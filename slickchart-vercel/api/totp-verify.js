// POST /api/totp-verify — provider-authed.
//   { code }            — confirm enrollment: if correct, actually turns 2FA on
//   { disable: true }   — turns 2FA off entirely (requires the current code too, for safety)
import { verifyToken, sessionOk } from '../lib/auth.js';
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken as verifyTotp } from '../lib/totp.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

export default async function handler(req, res) {
  if (!(await sessionOk(req))) { res.status(401).json({ error: 'This session has been signed out. Please log in again.' }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  const c = claims(req);
  const providerId = c && c.u;
  if (!providerId) { res.status(401).json({ error: 'Not signed in' }); return; }

  try {
    await ensureProvidersTable();
    const q = sql();
    const rows = await q`SELECT totp_secret, totp_pending, totp_enabled FROM providers WHERE id = ${providerId}`;
    const r0 = rows[0] || {};
    const b0 = req.body || {};
    // Turning OFF checks the live secret. Turning ON checks the one being set up (or, for a setup
    // started before totp_pending existed, the stored one).
    const secret = b0.disable ? (r0.totp_enabled ? r0.totp_secret : null) : (r0.totp_pending || (!r0.totp_enabled ? r0.totp_secret : null));
    if (!secret) { res.status(400).json({ error: 'Start setup first — no code has been generated yet.' }); return; }

    const b = req.body || {};
    const code = String(b.code || '').trim();
    if (!code) { res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app.' }); return; }
    if (!verifyTotp(secret, code)) { res.status(400).json({ error: 'That code is incorrect or expired. Try the newest one shown in your app.' }); return; }

    if (b.disable) {
      await q`UPDATE providers SET totp_secret = NULL, totp_pending = NULL, totp_enabled = false WHERE id = ${providerId}`;
      res.status(200).json({ ok: true, enabled: false });
      return;
    }
    await q`UPDATE providers SET totp_secret = ${secret}, totp_pending = NULL, totp_enabled = true WHERE id = ${providerId}`;
    res.status(200).json({ ok: true, enabled: true });
  } catch (e) { console.error('[totp-verify] failed:', e && e.stack || e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
}
