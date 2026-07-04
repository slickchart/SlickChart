// POST /api/login  { email, password }  (email omitted => legacy APP_PASSWORD owner)
// Verifies against a provider account, rate-limited to stop brute-forcing.
import { signToken, verifyPassword, tooManyAttempts, recordAttempt, clearAttempts, createSession } from '../lib/auth.js';
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) { res.status(500).json({ error: 'Login is not configured. Set SESSION_SECRET in Vercel.' }); return; }

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');

  if (email && dbEnabled()) {
    try {
      await ensureProvidersTable();
      const q = sql();
      if (await tooManyAttempts(q, email)) {
        res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
        return;
      }
      const rows = await q`SELECT id, name, email, pass_hash, verified FROM providers WHERE email = ${email}`;
      if (rows.length && verifyPassword(password, rows[0].pass_hash)) {
        await clearAttempts(q, email);
        const sid = await createSession(q, rows[0].id, req);
        const token = signToken({ u: rows[0].id, e: email, sid }, secret);
        res.status(200).json({ token, name: rows[0].name || '', email, verified: !!rows[0].verified });
        return;
      }
      await recordAttempt(q, email);
      res.status(401).json({ error: rows.length ? 'Incorrect password.' : 'No account found with that email. Create one to get started.' });
      return;
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); return; }
  }

  // Legacy single-password owner login
  const expected = process.env.APP_PASSWORD || '';
  if (expected && password === expected) {
    const token = signToken({ u: 'owner' }, secret);
    res.status(200).json({ token, name: '', email: '', verified: true });
    return;
  }
  res.status(401).json({ error: expected ? 'Incorrect password.' : 'Enter your email and password to log in.' });
}
