// GET /.well-known/apple-app-site-association  (served here via a vercel.json rewrite)
// iOS Universal Links: lets the installed SlickChart app claim slickchart.app links, so a client
// tapping their /client/<token> link opens the app straight to their space instead of Safari.
//
// Apple requires this be served over HTTPS as application/json with NO redirect. The appID is the
// Apple Team ID + the app's bundle id ("774LQ68Z3X.com.slickchart.app"). Override with APPLE_APP_ID
// in Vercel env if the signing team or bundle ever changes — no code edit needed.
export default function handler(req, res) {
  const appID = (process.env.APPLE_APP_ID || '774LQ68Z3X.com.slickchart.app').trim();
  // Only the client-space links open the app. Everything else (marketing, provider app, consult pages)
  // keeps opening in the browser as before.
  const body = {
    applinks: {
      apps: [],
      details: [
        { appID, paths: ['/client', '/client/*'] }
      ]
    }
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(JSON.stringify(body));
}
