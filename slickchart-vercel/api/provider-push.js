// POST   /api/provider-push  { subscription }  → store this device's web-push subscription
// DELETE /api/provider-push  { endpoint }      → forget it
// GET    /api/provider-push                    → { ok, devices } so the app can show whether push is on
//
// Bearer session only, and the provider id comes from the VERIFIED token — never from the body
// (CLAUDE.md §0.1). The endpoint is validated before it is stored: we later POST to it, so an
// unvalidated endpoint is a blind SSRF target. Same guard the client path uses.
import { sql, dbEnabled } from '../lib/db.js';
import { verifyToken, isSessionValid } from '../lib/auth.js';
import { validPushEndpoint, pushConfigured } from '../lib/push.js';
import {
  ensureProviderPushTable, saveProviderPushSub, deleteProviderPushSubByEndpoint, countProviderPushSubs
} from '../lib/provider-push.js';

async function requireLogin(req, res, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && token ? verifyToken(token, secret) : null;
  if (!payload || !payload.u) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  try {
    if (payload.sid && !(await isSessionValid(q, payload.sid))) {
      res.status(401).json({ error: 'This session has been signed out. Please log in again.' });
      return null;
    }
  } catch (e) { /* session table unavailable: fall through on a valid signature */ }
  return String(payload.u);
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'nodb' }); return; }
  const q = sql();
  const providerId = await requireLogin(req, res, q);
  if (!providerId) return;
  try {
    await ensureProviderPushTable();
    if (req.method === 'GET') {
      res.status(200).json({ ok: true, configured: pushConfigured(), devices: await countProviderPushSubs(providerId) });
      return;
    }
    if (req.method === 'POST') {
      const sub = (req.body && req.body.subscription) || null;
      if (!sub || !sub.endpoint) { res.status(400).json({ error: 'Missing subscription' }); return; }
      if (!validPushEndpoint(sub.endpoint)) { res.status(400).json({ error: 'Invalid subscription endpoint' }); return; }
      await saveProviderPushSub(providerId, sub);
      res.status(200).json({ ok: true, devices: await countProviderPushSubs(providerId) });
      return;
    }
    if (req.method === 'DELETE') {
      const endpoint = (req.body && (req.body.endpoint || (req.body.subscription && req.body.subscription.endpoint))) || '';
      if (endpoint) await deleteProviderPushSubByEndpoint(providerId, String(endpoint));
      res.status(200).json({ ok: true, devices: await countProviderPushSubs(providerId) });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[provider-push] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
