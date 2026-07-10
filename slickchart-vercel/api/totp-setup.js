// POST /api/totp-setup — provider-authed. Generates a real TOTP secret (not
// yet enabled) and returns everything needed to scan it into an authenticator
// app. Enrollment only actually turns on once /api/totp-verify confirms the
// person can produce a correct code from it.
import { verifyToken } from '../lib/auth.js';
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { generateSecret, otpauthUri } from '../lib/totp.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  const c = claims(req);
  const providerId = c && c.u;
  const email = c && c.e;
  if (!providerId) { res.status(401).json({ error: 'Not signed in' }); return; }

  try {
    await ensureProvidersTable();
    const q = sql();
    const secret = generateSecret();
    // Stored but not enabled yet — /api/totp-verify flips totp_enabled on
    // once the person proves they can actually generate a matching code.
    await q`UPDATE providers SET totp_secret = ${secret}, totp_enabled = false WHERE id = ${providerId}`;
    const uri = otpauthUri(secret, email || providerId);
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(uri);
    res.status(200).json({ ok: true, secret, otpauthUri: uri, qrUrl });
  } catch (e) { console.error('[totp-setup] failed:', e && e.stack || e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
}
