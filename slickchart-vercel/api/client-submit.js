// Token-authed (the client's link token): a client submits a form, a booking
// request, or a message. Logged as an event for the provider to review.
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, getClientByToken, logEvent } from '../lib/clients.js';

const KINDS = ['form', 'booking', 'message', 'checkin', 'vc_submit', 'contact'];

// Reject a single oversized payload before it's stored. Legitimate submissions —
// even a check-in with several downscaled (1000px) photos as data URLs — stay well
// under this; anything larger is either abuse or a bug, and shouldn't bloat the
// provider's database. (Vercel already caps the raw request body at ~4.5MB; this is
// the explicit app-level boundary in case that platform default ever changes.)
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

// Best-effort in-memory burst limiter, keyed by link token — same approach as
// /api/ai. Stops a single client (or a script using a leaked link) from flooding
// their provider's event feed / database with rapid-fire submissions. It's per
// function instance (not global) and fails open, which is the right trade-off for
// this low-severity, token-scoped endpoint.
const SUBMIT_BURST_LIMIT = Math.max(parseInt(process.env.SUBMIT_BURST_LIMIT, 10) || 20, 1);
const _hits = new Map();
function burstOk(key, limit, windowMs) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { _hits.set(key, arr); return false; }
  arr.push(now);
  _hits.set(key, arr);
  if (_hits.size > 5000) { // keep the map from growing without bound
    for (const k of _hits.keys()) { if (k !== key) _hits.delete(k); if (_hits.size <= 4000) break; }
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const body = req.body || {};
  const token = String(body.t || '');
  const kind = String(body.kind || '');
  const payload = body.payload || {};
  if (!token || KINDS.indexOf(kind) < 0) { res.status(400).json({ error: 'Bad request' }); return; }

  // Size guard: reject an oversized payload rather than persisting it.
  try {
    if (Buffer.byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) {
      res.status(413).json({ error: 'That submission is too large. Please try fewer/smaller photos.' });
      return;
    }
  } catch (e) { res.status(400).json({ error: 'Bad request' }); return; }

  // Rate guard: throttle rapid-fire submissions from one link token.
  if (!burstOk(token, SUBMIT_BURST_LIMIT, 60000)) {
    res.status(429).json({ error: 'Too many submissions in a row — give it a moment and try again.' });
    return;
  }

  try {
    await ensureClientTables();
    const c = await getClientByToken(token);
    if (!c) { res.status(404).json({ error: 'Invalid link' }); return; }
    // Pull the client's idempotency key out of the payload (kept out of the stored blob) so a
    // retried submission that already committed doesn't create a second event.
    const idem = payload && payload._idem;
    if (payload && payload._idem) { delete payload._idem; }
    const id = await logEvent(c.provider_id, c.id, kind, payload, idem);
    res.status(200).json({ ok: true, id });
  } catch (e) { console.error('[client-submit] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
