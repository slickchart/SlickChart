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
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
    return;
  }
  // GET status
  try {
    let conn = null;
    if (providerId) conn = await getConnection(providerId);
    const legacy = !!cfg.token; // deployment-wide fallback token present
    res.status(200).json({
      connected: !!(conn && conn.token) || legacy,
      oauth: !!(conn && conn.token),
      legacy,
      oauthConfigured,
      env: cfg.env,
      merchantId: conn ? conn.merchantId : null
    });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
