// POST /api/signup   body: { email, password, name }
// Creates a provider account and returns a session token scoped to that provider.
// Each provider's data is isolated in the kv table by owner = provider id.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { signToken, hashPassword } from '../lib/auth.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured. Add a Postgres (Neon) database in Vercel.' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) { res.status(500).json({ error: 'Login is not configured. Set SESSION_SECRET in Vercel.' }); return; }

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const name = String(b.name || '').trim();

  if (!email || !/.+@.+\..+/.test(email)) { res.status(400).json({ error: 'Please enter a valid email address.' }); return; }
  if (password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }

  try {
    await ensureProvidersTable();
    const q = sql();
    const existing = await q`SELECT id FROM providers WHERE email = ${email}`;
    if (existing.length) { res.status(409).json({ error: 'An account with that email already exists — try logging in.' }); return; }

    const id = 'p_' + crypto.randomBytes(8).toString('hex');
    const pass_hash = hashPassword(password);
    await q`INSERT INTO providers (id, email, name, pass_hash) VALUES (${id}, ${email}, ${name}, ${pass_hash})`;

    const token = signToken({ u: id, e: email }, secret);
    res.status(200).json({ token, name, email });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
}
