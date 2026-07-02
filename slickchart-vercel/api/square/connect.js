// GET /api/square/connect  (requires SlickChart session Bearer token)
// Returns { url } — the Square authorization URL to send THIS provider to, with a
// signed state so the callback knows which provider is connecting.
import { squareConfig, authorizeUrl, providerFromReq } from '../../lib/square.js';
import { signToken } from '../../lib/auth.js';
import { appOrigin } from '../../lib/email.js';

export default async function handler(req, res) {
  const secret = process.env.SESSION_SECRET || '';
  const cfg = squareConfig();
  if (!cfg.appId || !cfg.appSecret) { res.status(500).json({ error: 'Square OAuth isn\u2019t configured. Set SQUARE_APP_ID and SQUARE_APP_SECRET in Vercel.' }); return; }
  const providerId = providerFromReq(req);
  if (!providerId) { res.status(401).json({ error: 'Please log in first.' }); return; }
  const state = signToken({ u: providerId, p: 'sq' }, secret, 600); // 10-minute state
  const redirectUri = appOrigin(req) + '/api/square/callback';
  res.status(200).json({ url: authorizeUrl(state, redirectUri) });
}
