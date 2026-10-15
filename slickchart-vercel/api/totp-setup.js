// POST /api/totp-setup — provider-authed. Generates a real TOTP secret (not
// yet enabled) and returns everything needed to scan it into an authenticator
// app. Enrollment only actually turns on once /api/totp-verify confirms the
// person can produce a correct code from it.
import { verifyToken, sessionOk } from '../lib/auth.js';
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { generateSecret, otpauthUri } from '../lib/totp.js';

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
  const email = c && c.e;
  if (!providerId) { res.status(401).json({ error: 'Not signed in' }); return; }

  try {
    await ensureProvidersTable();
    const q = sql();
    // Never touch a working two-step setup from here. This used to overwrite the live secret and switch
    // two-step OFF with no code at all, so anyone holding a token could strip it and enrol their own.
    // Turning it off goes through /api/totp-verify, which needs a current code.
    const cur = await q`SELECT totp_enabled FROM providers WHERE id = ${providerId}`;
    if (cur[0] && cur[0].totp_enabled) { res.status(409).json({ error: 'Two-step sign-in is already on. Turn it off first with a code from your app.' }); return; }
    const secret = generateSecret();
    // Pending until /api/totp-verify confirms the person can produce a matching code.
    await q`UPDATE providers SET totp_pending = ${secret} WHERE id = ${providerId}`;
    const uri = otpauthUri(secret, email || providerId);
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(uri);
    res.status(200).json({ ok: true, secret, otpauthUri: uri, qrUrl });
  } catch (e) { console.error('[totp-setup] failed:', e && e.stack || e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
}
