// Provider-authed: sync the provider's client list + per-client data blobs up to
// the server (POST), and read them back with link tokens & invite status (GET).
import { verifyToken, isSessionValid } from '../lib/auth.js';
import { dbEnabled, sql } from '../lib/db.js';
import { createHash } from 'crypto';
import { ensureClientTables, upsertClient, listClients, listEvents, listEventClients, markClientDeleted, mergeClientRows } from '../lib/clients.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const c = (s && t) ? verifyToken(t, s) : null;
  return c && c.u ? c : null;
}

// Vercel refuses a function response over ~4.5 MB, and this list carries every event's payload: a
// check-in or photo consult can hold several photos as data URLs, an in-person form its signature.
// Past that size EVERY poll failed, the app skipped it in silence (`if(!r.ok)return`), and no
// submission reached the provider at all: forms, check-ins, nothing healed (Josie, 2026-11-06).
// So the newest events go whole up to a budget, and older ones beyond it drop only their heavy parts
// (`slim:true`, with counts kept); the app fetches any it still needs whole with ?full=. Events from
// the last 3 days stay whole while the response can hold them, because a previous build does not
// know `slim` and must never be the one to file a recent check-in without its photos.
const EV_BUDGET = 2500000, EV_HARD = 3800000;
function heavy(v) { return typeof v === 'string' && v.length > 2000 && /^data:/.test(v); }
function slimPayload(p) {
  if (!p || typeof p !== 'object') return p;
  const o = Object.assign({}, p);
  for (const k of ['photos', 'refs']) if (Array.isArray(o[k])) { o[k + 'Count'] = o[k].length; o[k] = []; }
  for (const k of ['sigImg', 'avatar']) if (heavy(o[k])) delete o[k];
  if (o.answers && typeof o.answers === 'object') {
    const a = Array.isArray(o.answers) ? o.answers.slice() : Object.assign({}, o.answers);
    for (const k of Object.keys(a)) if (heavy(a[k])) a[k] = '';
    o.answers = a;
  }
  return o;
}
export function slimEvents(events) {
  const recentCut = Date.now() - 3 * 86400000;
  let total = 0;
  const out = (events || []).map(e => {
    let n = 0; try { n = JSON.stringify(e.payload || {}).length; } catch (x) {}
    const recent = Number(e.created_at) >= recentCut;
    if (total + n <= EV_BUDGET || (recent && total + n <= EV_HARD)) { total += n; return e; }
    const sp = slimPayload(e.payload);
    try { total += JSON.stringify(sp || {}).length; } catch (x) {}
    return Object.assign({}, e, { payload: sp, slim: true });
  });
  return out;
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ ok: false, clients: [] }); return; }
  const claim = providerId(req);
  if (!claim) { res.status(401).json({ error: 'Not signed in' }); return; }
  // A signed-out (revoked) session must not keep pushing a stale roster and delete list, same rule
  // as api/store.js. If the check itself fails, don't lock her out over it.
  try { if (!(await isSessionValid(sql(), claim.sid))) { res.status(401).json({ error: 'This session has been signed out. Please log in again.' }); return; } } catch (e) {}
  const provider = claim.u;
  await ensureClientTables();
  try {
    if (req.method === 'GET') {
      const clients = await listClients(provider);
      const events = await listEvents(provider);
      // Additive field (older builds ignore it): removed copies that events still point at.
      let eventClients = [];
      try { eventClients = await listEventClients(provider, events); } catch (e) { eventClients = []; }
      // ?full=<id,id> returns those events whole (this provider's only), for an event the list below
      // had to send slimmed.
      const fullIds = String((req.query && req.query.full) || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 10);
      if (fullIds.length) {
        const rows = await sql()`SELECT id, client_id, kind, payload, seen, created_at FROM client_events
          WHERE provider_id=${provider} AND id = ANY(${fullIds}::text[])`;
        res.status(200).json({ ok: true, events: rows });
        return;
      }
      // The app asks for this list every 15 seconds while it is open, and a busy account's answer is
      // megabytes (Ashley's: 380 submissions, 2.7 MB). Almost every time it is exactly what the phone
      // already has. So the answer carries a fingerprint, and a phone that sends it back gets a bare
      // "304 nothing changed" instead of the whole list again (2026-11-07). The fingerprint is of
      // THIS caller's own answer, computed fresh every time, so it can never stand in for anyone
      // else's data. Builds that do not send it get the full list exactly as before.
      const body = JSON.stringify({ ok: true, clients, events: slimEvents(events), eventClients });
      const etag = '"' + createHash('sha1').update(body).digest('base64').replace(/=+$/, '') + '"';
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'private, no-store');
      if (String(req.headers['if-none-match'] || '') === etag) { res.status(304).end(); return; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(body);
      return;
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      // Soft-delete any clients the provider removed/merged-away, so the server row is tombstoned
      // and can't resurrect as a blank zombie on the next re-sync. Runs before the upsert.
      // Merged copies first (before the delete below): move the copy's link, submissions and push
      // sign-ups onto the survivor. mergeClientRows checks BOTH ids are this provider's own rows.
      const merged = (Array.isArray(body.merged) ? body.merged : []).slice(0, 500);
      for (const m of merged) {
        if (!m || typeof m !== 'object') continue;
        try { await mergeClientRows(provider, String(m.from || ''), String(m.to || '')); } catch (e) { /* best-effort */ }
      }
      const del = Array.isArray(body.deletedIds) ? body.deletedIds : [];
      // Same small pool as the upsert below: a Square clean-up sends a few hundred ids in one request, and
      // one Promise.all over them opened a connection per id at once (the EMFILE failure described below).
      if (del.length) {
        const ids = del.slice(0, 500).map(String);
        let _d = 0;
        const _delWorker = async () => { while (_d < ids.length) { const id = ids[_d++]; try { await markClientDeleted(provider, id); } catch (e) { /* best-effort */ } } };
        await Promise.all(Array.from({ length: Math.min(4, ids.length) }, () => _delWorker()));
      }
      const items = (Array.isArray(body.clients) ? body.clients : []).slice(0, 2000);
      // Cap DB concurrency. Neon's HTTP driver opens a fresh connection PER query, and upsertClient
      // runs ~3 queries each. Firing every client at once (Promise.all over the whole list) opened
      // 400-520 simultaneous connections per request and exhausted the function's file descriptors
      // (EMFILE), 500-ing the route account-wide. A small worker pool keeps only a few connections
      // open at a time; per-client try/catch also isolates a bad record from the rest of the batch.
      const out = [], failed = [];
      const CONCURRENCY = 4;
      let _i = 0;
      async function _worker() {
        while (_i < items.length) {
          const c = items[_i++] || {};
          try { out.push(await upsertClient(provider, c)); }
          catch (e) { failed.push({ id: c.id || null }); console.error('[clients] upsert failed for', c && c.id, e && (e.stack || e.message) || e); }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => _worker()));
      res.status(200).json({ ok: true, saved: out.length, clients: out, failed });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { console.error('[clients] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
