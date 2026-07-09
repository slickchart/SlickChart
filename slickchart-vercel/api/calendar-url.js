// GET /api/calendar-url  (Bearer session) → { url } : a private, long-lived ICS feed URL
// the provider pastes into Google/Apple Calendar to subscribe to their SlickChart appts.
import { signToken, verifyToken } from '../lib/auth.js';
import { appOrigin } from '../lib/email.js';

export default async function handler(req, res) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = secret && t ? verifyToken(t, secret) : null;
  if (!p || !p.u) { res.status(401).json({ error: 'Please log in first.' }); return; }
  const tok = signToken({ u: p.u, k: 'cal' }, secret, 315360000); // ~10 years
  res.status(200).json({ url: appOrigin(req) + '/api/calendar?t=' + encodeURIComponent(tok) });
}
