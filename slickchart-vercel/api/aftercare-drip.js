// Provider-authed: start (or cancel) the automated tattoo aftercare drip for one of the
// provider's own clients. Sets/clears clients.heal_started_at; the reminder cron
// (cron-reminders.js) then sends the timed Day-1 / Day-3 / Month-1 healing messages measured
// from that timestamp. Same credential model as /api/provider-message.
import { verifyToken } from '../lib/auth.js';
import { dbEnabled, sql } from '../lib/db.js';
import { ensureClientTables, setHealStart, clearHealStart } from '../lib/clients.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const c = (s && t) ? verifyToken(t, s) : null;
  return c && c.u;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const provider = providerId(req);
  if (!provider) { res.status(401).json({ error: 'Not signed in' }); return; }
  const body = req.body || {};
  const clientId = String(body.clientId || '');
  if (!clientId) { res.status(400).json({ error: 'Missing clientId' }); return; }
  try {
    await ensureClientTables();
    // Confirm the client belongs to this provider (setHealStart is already provider-scoped; this
    // gives a clean 404 rather than a silent no-op on an id the provider doesn't own).
    const q = sql();
    const rows = await q`SELECT id FROM clients WHERE id=${clientId} AND provider_id=${provider}`;
    if (!rows.length) { res.status(404).json({ error: 'Client not found' }); return; }
    if (body.cancel) { await clearHealStart(clientId, provider); res.status(200).json({ ok: true, active: false }); return; }
    const startedAt = Number(body.startedAt) || Date.now();
    await setHealStart(clientId, provider, startedAt);
    res.status(200).json({ ok: true, active: true, startedAt });
  } catch (e) {
    console.error('[aftercare-drip] failed:', e && e.stack || e);
    res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' });
  }
}
