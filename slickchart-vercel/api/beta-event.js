// POST /api/beta-event
// Records one app-side beta signal. Body is one of:
//   { type:'chart_saved', isNew:true, at:<ms> }
//   { type:'pulse_shown',              at:<ms> }
// Auth: same Bearer session token as /api/store. Aggregate telemetry only —
// no client names or note content are ever sent or stored.
import { sql, ensureBetaTable, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken, isSessionValid } from '../lib/auth.js';

async function requireLogin(req, res, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret ? verifyToken(token, secret) : null;
  if (!payload) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  try {
    if (!(await isSessionValid(q, payload.sid))) {
      res.status(401).json({ error: 'This session has been signed out.' });
      return null;
    }
  } catch (e) { /* if the check itself fails, don't lock people out over it */ }
  return payload.u || 'owner';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  // The app fires this fire-and-forget and ignores the response, so we never
  // want to surface an error to the provider — just quietly do nothing.
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }

  try {
    await ensureProvidersTable();          // sessions table exists (for isSessionValid)
    const q = sql();
    const owner = await requireLogin(req, res, q);
    if (!owner) return;                     // requireLogin already sent the 401

    const body = req.body || {};
    const type = body.type === 'pulse_shown' ? 'pulse_shown'
               : body.type === 'chart_saved' ? 'chart_saved'
               : null;
    if (!type) { res.status(400).json({ error: 'Unknown event type.' }); return; }
    const isNew = type === 'chart_saved' ? !!body.isNew : null;

    await ensureBetaTable();
    await q`INSERT INTO beta_events (provider_id, type, is_new)
            VALUES (${owner}, ${type}, ${isNew})`;

    res.status(200).json({ ok: true });
  } catch (e) {
    // Never let a metrics failure surface to the provider.
    res.status(200).json({ ok: false });
  }
}
