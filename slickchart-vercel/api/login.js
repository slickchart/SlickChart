// POST /api/login   body: { email, password }  (email optional for legacy owner login)
// - If an email is given, verifies it against a provider account (email + password).
// - If no email is given, falls back to the legacy single APP_PASSWORD ("owner").
// Returns a signed session token scoped to that account.
import { signToken, verifyPassword } from '../lib/auth.js';
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) { res.status(500).json({ error: 'Login is not configured. Set SESSION_SECRET in Vercel.' }); return; }

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');

  // 1) Provider account (email + password)
  if (email && dbEnabled()) {
    try {
      await ensureProvidersTable();
      const q = sql();
      const rows = await q`SELECT id, name, email, pass_hash FROM providers WHERE email = ${email}`;
      if (rows.length && verifyPassword(password, rows[0].pass_hash)) {
        const token = signToken({ u: rows[0].id, e: email }, secret);
        res.status(200).json({ token, name: rows[0].name || '', email });
        return;
      }
      if (rows.length) { res.status(401).json({ error: 'Incorrect password.' }); return; }
      res.status(401).json({ error: 'No account found with that email. Create one to get started.' });
      return;
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
      return;
    }
  }

  // 2) Legacy single-password owner login (keeps existing deployment working)
  const expected = process.env.APP_PASSWORD || '';
  if (expected && password === expected) {
    const token = signToken({ u: 'owner' }, secret);
    res.status(200).json({ token, name: '', email: '' });
    return;
  }

  res.status(401).json({ error: expected ? 'Incorrect password.' : 'Enter your email and password to log in.' });
}
