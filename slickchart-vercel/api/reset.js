// POST /api/reset  { token, password }  — sets a new password from a reset link.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  const b = req.body || {};
  const token = String(b.token || '');
  const password = String(b.password || '');
  if (!token) { res.status(400).json({ error: 'Missing token.' }); return; }
  if (password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }
  try {
    await ensureProvidersTable();
    const q = sql();
    const rows = await q`SELECT provider_id FROM auth_tokens WHERE token = ${token} AND kind = 'reset' AND expires_at > now()`;
    if (!rows.length) { res.status(400).json({ error: 'This reset link is invalid or has expired.' }); return; }
    await q`UPDATE providers SET pass_hash = ${hashPassword(password)} WHERE id = ${rows[0].provider_id}`;
    await q`DELETE FROM auth_tokens WHERE token = ${token}`;
    // A reset means the owner lost access / suspects compromise — sign out every existing session so
    // a stolen 30-day token can't outlive the reset (store.js checks isSessionValid on each request).
    try { await q`UPDATE sessions SET revoked = true WHERE provider_id = ${rows[0].provider_id}`; } catch (e) { /* non-fatal */ }
    res.status(200).json({ ok: true });
  } catch (e) { console.error('[reset] failed:', e && e.stack || e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
}
