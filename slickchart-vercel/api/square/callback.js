// GET /api/square/callback?code=...&state=...
// Square redirects the seller here after they approve. We verify the signed state,
// exchange the code for tokens, store them (encrypted) for that provider, then send
// them back into the app.
import { exchangeCode, storeConnection, getConnection } from '../../lib/square.js';
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
    // Mobile browsers sometimes fire this callback twice. The first request claims the
    // one-time code and connects successfully; the duplicate then gets "already claimed".
    // If a working connection now exists for this provider, treat it as success.
    const msg = (e.message || '').toLowerCase();
    const dup = msg.includes('already claimed') || msg.includes('already been used') || msg.includes('authorization_code');
    if (dup) {
      await new Promise(r => setTimeout(r, 700)); // let the winning request finish saving
      try {
        const c = await getConnection(payload.u);
        if (c && c.token) { backTo(res, origin, { sq: 'connected' }); return; }
      } catch (_) { /* fall through to error */ }
    }
    backTo(res, origin, { sq: 'error', reason: (e.message || 'exchange_failed').slice(0, 80) });
  }
}
