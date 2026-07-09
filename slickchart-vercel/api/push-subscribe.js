// Token-authed (the client's link token): store or remove this device's web-push
// subscription so the server can send the client notifications even when the app is
// fully closed. Same credential model as /api/client-data and /api/client-prefs.
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, getClientByToken, savePushSub, deletePushSubByEndpoint } from '../lib/clients.js';

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const token = (req.query && req.query.t) || (req.body && req.body.t) || '';
  if (!token) { res.status(400).json({ error: 'Missing link token' }); return; }
  try {
    await ensureClientTables();
    const c = await getClientByToken(String(token));
    if (!c) { res.status(404).json({ error: 'This link is not valid or has been removed.' }); return; }
    const body = req.body || {};

    if (req.method === 'POST') {
      const sub = body.subscription;
      if (!sub || !sub.endpoint) { res.status(400).json({ error: 'Missing subscription' }); return; }
      await savePushSub(c.id, c.provider_id, sub);
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === 'DELETE') {
      const endpoint = (body.endpoint) || (body.subscription && body.subscription.endpoint) || '';
      if (endpoint) await deletePushSubByEndpoint(c.id, String(endpoint));
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { console.error('[push-subscribe] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: e.message }); }
}
