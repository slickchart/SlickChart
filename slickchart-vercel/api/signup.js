// POST /api/signup  { email, password, name }
// Creates a provider account (unverified), emails a verification link, and
// returns a session token so they can start using the app right away.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { signToken, hashPassword, makeToken } from '../lib/auth.js';
import { sendEmail, appOrigin } from '../lib/email.js';
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
    await q`INSERT INTO providers (id, email, name, pass_hash, verified) VALUES (${id}, ${email}, ${name}, ${hashPassword(password)}, false)`;

    // Email verification link (valid 24h)
    const vtoken = makeToken();
    await q`INSERT INTO auth_tokens (token, provider_id, kind, expires_at) VALUES (${vtoken}, ${id}, 'verify', now() + interval '24 hours')`;
    const link = appOrigin(req) + '/slickchart?verify=' + vtoken;
    try {
      await sendEmail({
        to: email,
        subject: 'Verify your SlickChart email',
        text: 'Welcome to SlickChart! Verify your email: ' + link,
        html: '<p>Welcome to SlickChart!</p><p><a href="' + link + '">Verify your email</a> (link expires in 24 hours).</p>'
      });
    } catch (e) { /* don't block signup on email failure */ }

    const token = signToken({ u: id, e: email }, secret);
    res.status(200).json({ token, name, email, verified: false });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
}
