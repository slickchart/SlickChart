// POST /api/course-paid   { t: <client link token>, courseId }
//
// The client's "Already paid? Refresh" button, made real.
//
// A paid course opens only once a payment is on record in the provider's `sc_course_purchases`, and
// until now the ONLY thing that could put one there was Square delivering a `payment.*` webhook for
// the checkout link the client used. That is a long chain — the seller has to have subscribed
// `payment.*`, SQUARE_WEBHOOK_SIGNATURE_KEY and SQUARE_WEBHOOK_URL have to be set and match, and the
// event has to actually arrive — and every link in it fails silently, leaving someone who has paid
// staring at a locked course with no way to do anything about it. "Already paid? Refresh" only
// re-read the same blob, so it could never help.
//
// So ask Square directly: does a COMPLETED payment exist carrying this exact link's
// "SC1:<clientId>:<courseId>" note? If yes, record the unlock — same key, same shape as the webhook.
// The webhook stays as the fast path; this is the one that doesn't depend on any of it.
//
// ISOLATION (CLAUDE.md §0): the provider, the client id and the Square token all come from the
// client's own row, looked up by the link token. Nothing authorizing is read from the request body.
// courseId is only honoured when it is already assigned to THIS client, and is character-restricted
// before it can reach a key. A client's token can therefore only ever unlock a course their own
// provider already sent them, under their own provider's owner row.
import { dbEnabled, sql } from '../lib/db.js';
import { ensureClientTables, getClientByToken } from '../lib/clients.js';
import { getConnection, squareFetch } from '../lib/square.js';

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PAGES = 3;            // 300 payments is far more than any recent window needs
const LOOKBACK_MS = 180 * 86400000;

// Best-effort, per-instance: stops a held-down refresh button from hammering the seller's Square.
// Serverless instances come and go, so this is a courtesy throttle, not a security control — the
// real bound is that the work per call is capped and only ever touches this client's own provider.
const _recent = new Map();
function throttled(key) {
  const now = Date.now();
  if (_recent.size > 500) _recent.clear();
  const last = _recent.get(key) || 0;
  if (now - last < 4000) return true;
  _recent.set(key, now);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(404).json({ error: 'Not found' }); return; }
  const body = req.body || {};
  const token = String(body.t || '');
  const courseId = String(body.courseId || '');
  if (!token || !SAFE_ID.test(courseId)) { res.status(400).json({ error: 'Missing details' }); return; }
  try {
    await ensureClientTables();
    const c = await getClientByToken(token);
    if (!c) { res.status(404).json({ error: 'This link is not valid or has been removed.' }); return; }
    const clientId = String(c.id);
    if (!SAFE_ID.test(clientId)) { res.status(200).json({ ok: true, paid: false, reason: 'badclient' }); return; }

    // The course has to be one this client was actually sent — never anything they can name.
    const assigned = (((c.data || {}).pendingCourses) || []).find(x => x && String(x.id) === courseId);
    if (!assigned) { res.status(200).json({ ok: true, paid: false, reason: 'notassigned' }); return; }

    const q = sql();
    // Already recorded (the webhook got there first, or the provider marked it paid) — say so without
    // troubling Square at all.
    try {
      const rows = await q`SELECT v FROM kv WHERE owner = ${c.provider_id} AND k = 'sc_course_purchases'`;
      const cur = JSON.parse((rows[0] && rows[0].v) || '{}') || {};
      if (cur[clientId + ':' + courseId]) { res.status(200).json({ ok: true, paid: true, reason: 'recorded' }); return; }
    } catch (e) { /* unreadable — fall through and ask Square */ }

    if (throttled(clientId + ':' + courseId)) { res.status(200).json({ ok: true, paid: false, reason: 'throttled' }); return; }

    const conn = await getConnection(c.provider_id);
    if (!conn || !conn.token) { res.status(200).json({ ok: true, paid: false, reason: 'nosquare' }); return; }

    const since = new Date(Math.max(Number(assigned.assignedAt) || 0, Date.now() - LOOKBACK_MS)).toISOString();
    const want = 'SC1:' + clientId + ':' + courseId;
    let cursor = '', found = null;
    for (let page = 0; page < MAX_PAGES && !found; page++) {
      const qs = new URLSearchParams({ begin_time: since, sort_order: 'DESC', limit: '100' });
      if (cursor) qs.set('cursor', cursor);
      let d;
      try { d = await squareFetch('/v2/payments?' + qs.toString(), {}, conn.token); }
      catch (e) { res.status(200).json({ ok: true, paid: false, reason: 'squareerror' }); return; }
      const list = (d && d.payments) || [];
      for (const p of list) {
        if (String(p.status || '').toUpperCase() !== 'COMPLETED') continue;
        if (String(p.note || '').trim().indexOf(want) !== 0) continue;
        found = p; break;
      }
      cursor = (d && d.cursor) || '';
      if (!cursor) break;
    }
    if (!found) { res.status(200).json({ ok: true, paid: false, reason: 'nopayment' }); return; }

    // Same write the webhook does: append into the one accumulating map, under this provider only.
    const entry = { at: Date.now(), paymentId: String(found.id || '').slice(0, 64), via: 'check' };
    const patch = JSON.stringify({ [clientId + ':' + courseId]: entry });
    await q`INSERT INTO kv (owner, k, v) VALUES (${c.provider_id}, 'sc_course_purchases', ${patch})
      ON CONFLICT (owner, k) DO UPDATE
      SET v = (COALESCE(NULLIF(kv.v,'')::jsonb, '{}'::jsonb) || ${patch}::jsonb)::text,
          updated_at = now()`;
    res.status(200).json({ ok: true, paid: true, reason: 'square' });
  } catch (e) {
    console.error('[course-paid] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
