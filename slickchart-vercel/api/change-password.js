// POST /api/change-password  { token, current, next }
// Lets a logged-in provider change their own password from Settings. Verifies the
// session token, confirms the CURRENT password matches before allowing the change,
// then stores the new hash. Mirrors the auth patterns in store.js (session check)
// and reset.js (password update).
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken, isSessionValid, verifyPassword, hashPassword } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }

  const b = req.body || {};
  // The token may arrive in the body (how the Settings screen sends it) or as a Bearer header.
  const headerTok = (req.headers['authorization'] || '').startsWith('Bearer ')
    ? req.headers['authorization'].slice(7) : '';
  const token = String(b.token || headerTok || '');
  const current = String(b.current || '');
  const next = String(b.next || '');

  if (!token) { res.status(401).json({ error: 'Not logged in.' }); return; }
  if (!current || !next) { res.status(400).json({ error: 'Enter your current and new password.' }); return; }
  if (next.length < 8) { res.status(400).json({ error: 'New password must be at least 8 characters.' }); return; }

  try {
    await ensureProvidersTable();
    const q = sql();

    const secret = process.env.SESSION_SECRET || '';
    const payload = secret ? verifyToken(token, secret) : null;
    if (!payload || !payload.u) { res.status(401).json({ error: 'Not logged in.' }); return; }

    // Make sure the session hasn't been signed out.
    try {
      if (payload.sid && !(await isSessionValid(q, payload.sid))) {
        res.status(401).json({ error: 'This session has been signed out. Please log in again.' });
        return;
      }
    } catch (e) { /* don't lock the user out if the session check itself errors */ }

    const rows = await q`SELECT id, pass_hash FROM providers WHERE id = ${payload.u}`;
    if (!rows.length) { res.status(404).json({ error: 'Account not found.' }); return; }

    if (!verifyPassword(current, rows[0].pass_hash)) {
      res.status(400).json({ error: 'Your current password is incorrect.' });
      return;
    }

    await q`UPDATE providers SET pass_hash = ${hashPassword(next)} WHERE id = ${payload.u}`;
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[change-password] failed:', e && e.stack || e);
    res.status(e.status || 500).json({ error: e.message });
  }
}
