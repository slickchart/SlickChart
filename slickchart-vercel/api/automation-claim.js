// Provider-authed: pre-claim a scheduled automation's occurrence for a set of clients, so the
// scheduled cron send (api/cron-automations) skips anyone the provider already sent to manually via
// "Send now". The manual send and the scheduled send otherwise use different dedup keys, so a client
// could receive the same automation twice. Here we claim the SAME reminder key the cron will use
// ('auto:<owner>:<autoId>:<occ>') for each manually-sent client — claimReminder is atomic and
// idempotent, so the cron's later claim for those clients returns false and it skips them. Clients the
// provider did NOT send to now stay unclaimed and still receive the scheduled send at its time.
import { verifyToken } from '../lib/auth.js';
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, claimReminder } from '../lib/clients.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const c = (s && t) ? verifyToken(t, s) : null;
  return c && c.u;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }
  const provider = providerId(req);
  if (!provider) { res.status(401).json({ error: 'Not signed in' }); return; }
  const body = req.body || {};
  const autoId = String(body.autoId || '').trim();
  const occ = Number(body.occ) || 0;
  const clientIds = (Array.isArray(body.clientIds) ? body.clientIds : [])
    .map(x => String(x || '')).filter(Boolean).slice(0, 2000);
  if (!autoId || !occ || !clientIds.length) { res.status(400).json({ error: 'Missing autoId, occ, or clientIds' }); return; }
  try {
    await ensureClientTables();
    const rkey = 'auto:' + provider + ':' + autoId + ':' + occ;
    let claimed = 0;
    for (const cid of clientIds) {
      try { if (await claimReminder(cid, rkey)) claimed++; } catch (e) {}
    }
    res.status(200).json({ ok: true, claimed });
  } catch (e) {
    console.error('[automation-claim] failed:', e && e.stack || e);
    res.status(500).json({ error: 'claim failed' });
  }
}
