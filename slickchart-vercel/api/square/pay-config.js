// GET /api/square/pay-config
// Returns the public config the Square Web Payments SDK needs to render a card-entry form in the
// provider app (application id + the connected location + environment). No secrets: the application
// id is public and the SDK tokenizes the card in the browser so raw card data never touches us.
import { sqContext, squareConfig, resolveLocationId } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  try {
    const cfg = squareConfig();
    const appId = process.env.SQUARE_APP_ID || '';
    if (!appId) { res.status(200).json({ ok: false, code: 'no-appid', error: 'Card entry isn’t configured (missing Square application id).' }); return; }
    let locationId = ctx.locationId;
    try { if (!locationId) locationId = await resolveLocationId(ctx.token, ctx.locationId); } catch (e) {}
    res.status(200).json({ ok: true, appId, locationId: locationId || '', env: cfg.env === 'production' ? 'production' : 'sandbox' });
  } catch (e) {
    res.status(e.status || 500).json({ error: (e && e.message) || 'Could not load card config' });
  }
}
