// GET /api/square/callback?code=...&state=...
// Square redirects the seller here after they approve. We verify the signed state,
// exchange the code for tokens, store them (encrypted) for that provider, then send
// them back into the app.
import { exchangeCode, storeConnection, getConnection, squareRedirectUri } from '../../lib/square.js';
import { verifyToken } from '../../lib/auth.js';
import { appOrigin } from '../../lib/email.js';

function backTo(res, origin, params, toApp) {
  const qs = new URLSearchParams(params).toString();
  if (toApp) { appReturnPage(res, 'slickchart://oauth?' + qs, params.sq === 'connected' ? 'Square connected' : 'Square was not connected'); return; }
  res.writeHead(302, { Location: origin + '/slickchart?' + qs });
  res.end();
}

// Started from the installed app (signed state carries a:1): this page is showing in the app's own
// in-app browser, so send the phone back to the app. The button is there because some phones ask
// before switching apps, and a page that only redirects would look stuck.
export function appReturnPage(res, href, title) {
  const h = String(href).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:48px 24px;background:#f7faf9;color:#223;text-align:center}'
    + 'h1{font-size:20px;margin:0 0 18px}a{display:inline-block;background:#0f8a7e;color:#fff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:12px;font-size:17px}</style>'
    + '<h1>' + title + '</h1><a href="' + h + '">Back to SlickChart</a>'
    + '<script>setTimeout(function(){location.href=' + JSON.stringify(String(href)) + ';},300);</script>');
}

export default async function handler(req, res) {
  const origin = appOrigin(req);
  const secret = process.env.SESSION_SECRET || '';
  const q = req.query || {};
  const code = q.code, state = q.state, error = q.error;
  const payload = (secret && state) ? verifyToken(state, secret, { scope: 'sq' }) : null;
  if (error) { backTo(res, origin, { sq: 'error', reason: (q.error_description || error) }, !!(payload && payload.a === 1)); return; }
  if (!payload || payload.p !== 'sq' || !payload.u) { backTo(res, origin, { sq: 'error', reason: 'invalid_state' }); return; }
  const toApp = payload.a === 1;
  if (!code) { backTo(res, origin, { sq: 'error', reason: 'no_code' }, toApp); return; }
  try {
    // Must byte-for-byte match the redirect_uri used in the authorize step (api/square/connect).
    const redirectUri = squareRedirectUri(req);
    const tokens = await exchangeCode(code, redirectUri);
    await storeConnection(payload.u, tokens);
    backTo(res, origin, { sq: 'connected' }, toApp);
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
        if (c && c.token) { backTo(res, origin, { sq: 'connected' }, toApp); return; }
      } catch (_) { /* fall through to error */ }
    }
    backTo(res, origin, { sq: 'error', reason: (e.message || 'exchange_failed').slice(0, 80) }, toApp);
  }
}
