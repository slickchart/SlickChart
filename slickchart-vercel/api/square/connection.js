// GET    /api/square/connection  → { connected, merchantId, env, oauth }
// DELETE /api/square/connection  → disconnects this provider's Square
import { getConnection, disconnect, providerFromReq, squareConfig } from '../../lib/square.js';

export default async function handler(req, res) {
  const providerId = providerFromReq(req);
  const cfg = squareConfig();
  const oauthConfigured = !!(cfg.appId && cfg.appSecret);
  if (req.method === 'DELETE') {
    if (!providerId) { res.status(401).json({ error: 'Please log in first.' }); return; }
    try { await disconnect(providerId); res.status(200).json({ ok: true }); }
    catch (e) { console.error('[connection] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
    return;
  }
  // GET status
  try {
    let conn = null;
    if (providerId) conn = await getConnection(providerId);
    const hasOwn = !!(conn && conn.token);
    const legacy = !!cfg.token; // deployment-wide fallback token present
    // A LOGGED-IN account is "connected" only when it has its OWN Square. Reporting "connected" just
    // because a deployment-wide token exists is what let a signed-in user import another account's
    // customers thinking they were connected to their own. The shared token only counts for the legacy
    // no-login case (no providerId).
    res.status(200).json({
      connected: providerId ? hasOwn : (hasOwn || legacy),
      oauth: hasOwn,
      legacy,
      oauthConfigured,
      env: cfg.env,
      merchantId: conn ? conn.merchantId : null
    });
  } catch (e) { console.error('[connection] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
