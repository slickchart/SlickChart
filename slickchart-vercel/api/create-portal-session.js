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
    // A provider who wants to cancel should land ON the cancel screen, not in a portal menu they
    // then have to hunt through. Stripe supports deep-linking straight into that flow, so "Cancel
    // subscription" in the app means exactly one more confirmation and it is done.
    let intent = '';
    try {
      const b = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
      intent = String((b && b.intent) || '');
    } catch (e) {}

    const origin = appOrigin(req);
    const mk = (withCancelFlow) => {
      const body = new URLSearchParams({ customer: sub.stripe_customer_id, return_url: origin + '/slickchart' });
      if (withCancelFlow) {
        body.set('flow_data[type]', 'subscription_cancel');
        body.set('flow_data[subscription_cancel][subscription]', sub.stripe_subscription_id);
        body.set('flow_data[after_completion][type]', 'redirect');
        body.set('flow_data[after_completion][redirect][return_url]', origin + '/slickchart?billing=canceled');
      }
      return fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
    };

    const wantsCancel = intent === 'cancel' && !!sub.stripe_subscription_id;
    let r = await mk(wantsCancel);
    let j = await r.json().catch(() => ({}));
    // The cancel deep-link needs cancellation enabled in the portal configuration. If it isn't, do
    // NOT leave them staring at an error — open the ordinary portal so they still get somewhere,
    // and log loudly, because a provider unable to cancel is a support ticket and a trust problem.
    if (!r.ok && wantsCancel) {
      console.error('[create-portal-session] cancel flow refused:', (j && j.error && j.error.message) || r.status);
      r = await mk(false);
      j = await r.json().catch(() => ({}));
      if (r.ok) { res.status(200).json({ ok: true, url: j.url, cancelFlow: false }); return; }
    }
    if (!r.ok) { res.status(502).json({ error: (j && j.error && j.error.message) || 'Could not open billing portal.' }); return; }
    res.status(200).json({ ok: true, url: j.url, cancelFlow: wantsCancel });
  } catch (e) { console.error('[create-portal-session] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
