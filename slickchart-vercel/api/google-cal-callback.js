// GET /api/google-cal-callback?code=…&state=…
//
// Google sends her back here. The provider is taken from the SIGNED state token minted when the
// consent link was built — never from a query parameter naming an account, which would let anyone
// attach their own Google calendar to someone else's SlickChart (CLAUDE.md §0.1).
import { dbEnabled } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';
import { ensureGoogleTable, exchangeGoogleCode, saveGoogleConnection, googleConfigured } from '../lib/google-cal.js';
import { redirectUri } from './google-cal.js';

function page(title, body) {
  return '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:40px 24px;background:#f7faf9;color:#223}'
    + 'div{max-width:420px;margin:0 auto;background:#fff;border:1px solid #e3ebe8;border-radius:16px;padding:22px}'
    + 'h1{font-size:19px;margin:0 0 8px}p{font-size:15px;line-height:1.6;color:#566}a{color:#0f8a7e}</style>'
    + '<div><h1>' + title + '</h1><p>' + body + '</p>'
    + '<p><a href="/slickchart">Back to SlickChart</a></p></div>';
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const q = (req.query || {});
  if (q.error) { res.status(200).end(page('Not connected', 'Google said: ' + String(q.error).slice(0, 80) + '. Nothing was changed.')); return; }
  if (!dbEnabled() || !googleConfigured()) { res.status(200).end(page('Not set up yet', 'Calendar sync is not configured on this deployment.')); return; }
  const code = String(q.code || ''), state = String(q.state || '');
  const payload = state ? verifyToken(state, process.env.SESSION_SECRET || '', { scope: 'gcal' }) : null;
  if (!code || !payload || !payload.u || payload.k !== 'gcal') {
    res.status(400).end(page('That link expired', 'Please start again from Settings in SlickChart.'));
    return;
  }
  try {
    await ensureGoogleTable();
    const tokens = await exchangeGoogleCode(code, redirectUri(req));
    if (!tokens.refresh_token) {
      // Without a refresh token the connection dies in an hour. prompt=consent should always return
      // one; if it did not, say so rather than storing something that will quietly stop working.
      res.status(200).end(page('Almost — try once more',
        'Google did not send the long-term permission. Please remove SlickChart from your Google account permissions and connect again.'));
      return;
    }
    await saveGoogleConnection(String(payload.u), tokens, { privateTitles: payload.p === 1 });
    res.status(200).end(page('Calendar connected',
      'Your Google Calendar is linked. Your SlickChart appointments will appear there, and your own events will block client bookings.'));
  } catch (e) {
    console.error('[google-cal-callback] failed:', e && e.stack || e);
    res.status(200).end(page('Could not connect', 'Something went wrong talking to Google. Nothing was changed — please try again.'));
  }
}
