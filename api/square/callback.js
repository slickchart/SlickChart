// GET /api/square/callback?code=...&state=...
// Square redirects the seller here after they approve. We verify the signed state,
// exchange the code for tokens, store them (encrypted) for that provider, then send
// them back into the app.
import { exchangeCode, storeConnection } from '../../lib/square.js';
import { verifyToken } from '../../lib/auth.js';
import { appOrigin } from '../../lib/email.js';

function backTo(res, origin, params) {
  const qs = new URLSearchParams(params).toString();
  res.writeHead(302, { Location: origin + '/slickchart?' + qs });
  res.end();
}

export default async function handler(req, res) {
  const origin = appOrigin(req);
  const secret = process.env.SESSION_SECRET || '';
  const q = req.query || {};
  const code = q.code, state = q.state, error = q.error;
  if (error) { backTo(res, origin, { sq: 'error', reason: (q.error_description || error) }); return; }
  const payload = (secret && state) ? verifyToken(state, secret) : null;
  if (!payload || payload.p !== 'sq' || !payload.u) { backTo(res, origin, { sq: 'error', reason: 'invalid_state' }); return; }
  if (!code) { backTo(res, origin, { sq: 'error', reason: 'no_code' }); return; }
  try {
    const redirectUri = origin + '/api/square/callback';
    const tokens = await exchangeCode(code, redirectUri);
    await storeConnection(payload.u, tokens);
    backTo(res, origin, { sq: 'connected' });
  } catch (e) {
    backTo(res, origin, { sq: 'error', reason: (e.message || 'exchange_failed').slice(0, 80) });
  }
}
