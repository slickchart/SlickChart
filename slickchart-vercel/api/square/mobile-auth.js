// GET /api/square/mobile-auth  -> { ok, appId, accessToken, locationId }
//
// Tap to Pay inside the SlickChart phone app (Square Mobile Payments SDK). The SDK runs on the
// provider's own phone and must be authorized with HER Square OAuth access token and location, which
// is how Square designed it (the SDK takes a seller's OAuth token; a personal access token must never
// ship in an app). Isolation: sqContext resolves ONLY the signed-in provider's own OAuth connection
// from her verified session, never a shared token and never an id from the request, so an account can
// only ever receive its own token. Never cached, never logged.
import { sqContext, squareConfig, resolveLocationId, squareFetch } from '../../lib/square.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const cfg = squareConfig();
  if (!cfg.appId) { res.status(503).json({ error: 'Square is not set up on the server.' }); return; }
  try {
    // Square refuses in-person payments without PAYMENTS_WRITE_IN_PERSON, and a provider who connected
    // before it was added holds a token without it. Ask Square what this token carries (her own token,
    // read-only) and send her to reconnect once instead of failing inside the payment sheet.
    try {
      const st = await squareFetch('/oauth2/token/status', { method: 'POST', body: {} }, ctx.token);
      const scopes = Array.isArray(st && st.scopes) ? st.scopes : null;
      if (scopes && !(scopes.includes('PAYMENTS_WRITE_IN_PERSON') && scopes.includes('PAYMENTS_WRITE'))) {
        res.status(409).json({ error: 'Reconnect Square once to turn on Tap to Pay.', code: 'reconnect' }); return;
      }
    } catch (e) { if (e && (e.status === 401 || e.status === 403)) throw e; /* status check unavailable: let the SDK decide */ }
    const locationId = await resolveLocationId(ctx.token, ctx.locationId);
    if (!locationId) { res.status(409).json({ error: 'Your Square account has no location yet. Add one in Square, then try again.', code: 'nolocation' }); return; }
    res.status(200).json({ ok: true, appId: cfg.appId, accessToken: ctx.token, locationId, env: cfg.env || 'production' });
  } catch (e) {
    res.status(e.status && e.status < 500 ? e.status : 500).json({ error: 'Could not reach Square. Please try again.', code: e.status === 401 || e.status === 403 ? 'reconnect' : undefined });
  }
}
