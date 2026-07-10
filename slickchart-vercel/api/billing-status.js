// GET /api/billing-status — provider-authed: returns the real Stripe
// subscription record for the logged-in provider (or null if none yet).
import { verifyToken } from '../lib/auth.js';
import { dbEnabled, getSubscription } from '../lib/db.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, subscription: null }); return; }
  const c = claims(req);
  const email = (c && c.e || '').toLowerCase();
  if (!email) { res.status(401).json({ error: 'Not signed in' }); return; }
  try {
    const sub = await getSubscription(email);
    res.status(200).json({ ok: true, subscription: sub });
  } catch (e) { console.error('[billing-status] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
