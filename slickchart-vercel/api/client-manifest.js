// GET /api/client-manifest?t=<token>
// Per-client PWA manifest: identical to the static client manifest but with a TOKENIZED start_url, so a
// client who adds the app to their home screen launches straight into THEIR space. The static manifest's
// start_url is the bare "/client" (no token), which on Android and newer iOS is what the installed
// shortcut opens — dropping the client into the sample/demo client (Maya + demo "other providers" +
// demo booking). The token here only builds the launch URL; the page still validates it server-side.
export default function handler(req, res) {
  const t = String((req.query && req.query.t) || '').trim();
  const start = t ? ('/client/' + encodeURIComponent(t)) : '/client';
  const manifest = {
    name: 'SlickChart',
    short_name: 'SlickChart',
    description: 'Your visit summaries, aftercare, forms, and rebooking.',
    lang: 'en-US',
    dir: 'ltr',
    categories: ['health', 'lifestyle', 'medical'],
    start_url: start,
    scope: '/',
    display: 'standalone',
    display_override: ['standalone'],
    orientation: 'portrait',
    background_color: '#faf7f4',
    theme_color: '#c8a882',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    id: '/client'
  };
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(JSON.stringify(manifest));
}
