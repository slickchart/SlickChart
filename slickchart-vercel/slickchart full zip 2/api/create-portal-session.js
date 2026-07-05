// POST /api/create-portal-session — provider-authed: opens Stripe's own hosted
// billing portal for the logged-in provider, so payment method, invoice
// history, and cancellation are all handled by Stripe directly rather than
// rebuilt by hand in the app.
import { verifyToken } from '../lib/auth.js';
import { dbEnabled, getSubscription } from '../lib/db.js';
import { appOrigin } from '../lib/email.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) { res.status(500).json({ error: 'Billing is not fully configured yet (missing STRIPE_SECRET_KEY).' }); return; }

  const c = claims(req);
  const email = (c && c.e || '').toLowerCase();
  if (!email) { res.status(401).json({ error: 'Not signed in' }); return; }

  try {
    const sub = await getSubscription(email);
    if (!sub || !sub.stripe_customer_id) {
      res.status(404).json({ error: 'No billing account found for this email yet.' });
      return;
    }
    const body = new URLSearchParams({
      customer: sub.stripe_customer_id,
      return_url: appOrigin(req) + '/slickchart'
    });
    const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const j = await r.json();
    if (!r.ok) { res.status(502).json({ error: (j && j.error && j.error.message) || 'Could not open billing portal.' }); return; }
    res.status(200).json({ ok: true, url: j.url });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
