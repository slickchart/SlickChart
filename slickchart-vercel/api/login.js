// POST /api/login   body: { password }
// Checks the password against APP_PASSWORD and returns a signed session token.
import { signToken } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const expected = process.env.APP_PASSWORD || '';
  const secret = process.env.SESSION_SECRET || '';
  if (!expected || !secret) {
    res.status(500).json({ error: 'Login is not configured. Set APP_PASSWORD and SESSION_SECRET in Vercel.' });
    return;
  }

  const password = (req.body && req.body.password) || '';
  if (password !== expected) {
    res.status(401).json({ error: 'Incorrect password.' });
    return;
  }

  const token = signToken({ u: 'owner' }, secret);
  res.status(200).json({ token });
}
