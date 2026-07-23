// POST /api/logout  (provider session Bearer token)
// Revokes THIS session server-side so its token stops working immediately. Without this, "Sign out"
// only dropped the token from the current device's localStorage while the 30-day token stayed valid
// server-side — so a copy of it (shared/lost device, backup) kept working after the provider signed out.
import { sql, dbEnabled, ensureProvidersTable } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  // Always report success — signing out must never appear to fail to the user, and there's nothing
  // sensitive to protect by distinguishing cases. If the DB is off there are no server sessions anyway.
  if (!dbEnabled()) { res.status(200).json({ ok: true }); return; }
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  const sid = payload && payload.sid;
  if (sid) {
    try {
      await ensureProvidersTable();
      const q = sql();
      await q`UPDATE sessions SET revoked = true WHERE id = ${sid}`;
    } catch (e) { /* best-effort — the client drops its token regardless */ }
  }
  res.status(200).json({ ok: true });
}
