// GET /api/square/connect  (requires SlickChart session Bearer token)
// Returns { url } — the Square authorization URL to send THIS provider to, with a
// signed state so the callback knows which provider is connecting.
import { squareConfig, authorizeUrl, providerFromReqChecked, squareRedirectUri } from '../../lib/square.js';
import { signToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  const secret = process.env.SESSION_SECRET || '';
  const cfg = squareConfig();
  if (!cfg.appId || !cfg.appSecret) { res.status(500).json({ error: 'Square OAuth isn\u2019t configured. Set SQUARE_APP_ID and SQUARE_APP_SECRET in Vercel.' }); return; }
  const providerId = await providerFromReqChecked(req);
  if (!providerId) { res.status(401).json({ error: 'Please log in first.' }); return; }
  // ?app=1: the installed app opened this in its in-app browser, so the callback must hand the phone
  // back to the app (slickchart://oauth) instead of loading the web app inside that browser. It rides
  // inside the SIGNED state, so it can only change where a finished flow lands, never whose it is.
  const fromApp = String((req.query && req.query.app) || '') === '1';
  const state = signToken(Object.assign({ u: providerId, p: 'sq', k: 'sq' }, fromApp ? { a: 1 } : {}), secret, 600); // 10-minute state; k scopes it so it can never pass as a session
  const redirectUri = squareRedirectUri(req);
  res.status(200).json({ url: authorizeUrl(state, redirectUri) });
}
