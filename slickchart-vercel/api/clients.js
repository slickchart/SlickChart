// Provider-authed: sync the provider's client list + per-client data blobs up to
// the server (POST), and read them back with link tokens & invite status (GET).
import { verifyToken, isSessionValid } from '../lib/auth.js';
import { dbEnabled, sql } from '../lib/db.js';
import { ensureClientTables, upsertClient, listClients, listEvents, markClientDeleted, mergeClientRows } from '../lib/clients.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const c = (s && t) ? verifyToken(t, s) : null;
  return c && c.u ? c : null;
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
      res.status(200).json({ ok: true, clients, events });
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
