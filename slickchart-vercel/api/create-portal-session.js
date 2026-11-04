// POST /api/create-portal-session — provider-authed: opens Stripe's own hosted
// billing portal for the logged-in provider, so payment method, invoice
// history, and cancellation are all handled by Stripe directly rather than
// rebuilt by hand in the app.
import { verifyToken, sessionOk } from '../lib/auth.js';
import { safeStripeMessage } from '../lib/stripe-safe.js';
import { dbEnabled, getSubscription, accountEmail } from '../lib/db.js';
import { appOrigin } from '../lib/email.js';
import { yearlyCentsFor } from '../lib/pricing.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

export default async function handler(req, res) {
  if (!(await sessionOk(req))) { res.status(401).json({ error: 'This session has been signed out. Please log in again.' }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) { res.status(500).json({ error: 'Billing is not fully configured yet (missing STRIPE_SECRET_KEY).' }); return; }

  const c = claims(req);
  if (!c || !c.u) { res.status(401).json({ error: 'Not signed in' }); return; }
  const email = await accountEmail(c);
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
    const stripeGet = (path) => fetch('https://api.stripe.com/v1/' + path, { headers: { Authorization: 'Bearer ' + key } })
      .then(r => r.ok ? r.json() : null).catch(() => null);
    // "Switch to yearly" must land on HER yearly price: $10/month -> $100/year (early providers keep
    // it for life), $17/month -> $170/year. Stripe's generic change-plan screen lists every price
    // configured in the portal, which would offer a $17 provider the $100 plan, or a $10 provider
    // the $170 one. So find the yearly price on her own product that is ten times her monthly
    // price and confirm exactly that. Not found -> the old generic screen, as before.
    let yearlyTarget = null;
    if (intent === 'yearly' && sub.stripe_subscription_id) {
      try {
        const live = await stripeGet('subscriptions/' + encodeURIComponent(sub.stripe_subscription_id));
        const item = live && live.items && live.items.data && live.items.data[0];
        const pr = item && item.price;
        const want = pr && pr.recurring && pr.recurring.interval === 'month' ? yearlyCentsFor(pr.unit_amount) : null;
        const product = pr && (typeof pr.product === 'string' ? pr.product : pr.product && pr.product.id);
        if (want && product) {
          const list = await stripeGet('prices?active=true&type=recurring&limit=100&product=' + encodeURIComponent(product));
          const hit = ((list && list.data) || []).find(x => x.recurring && x.recurring.interval === 'year' && x.unit_amount === want && x.currency === pr.currency);
          if (hit) yearlyTarget = { item: item.id, price: hit.id };
        }
      } catch (e) { yearlyTarget = null; }
    }
    const mk = (withCancelFlow, withUpdateFlow) => {
      const body = new URLSearchParams({ customer: sub.stripe_customer_id, return_url: origin + '/slickchart' });
      // "Switch to yearly": straight to Stripe's change-plan screen. Needs plan switching turned on
      // in the portal settings with the yearly price listed; if it is not, the fallback below opens
      // the ordinary portal instead of an error.
      if (withUpdateFlow && yearlyTarget) {
        body.set('flow_data[type]', 'subscription_update_confirm');
        body.set('flow_data[subscription_update_confirm][subscription]', sub.stripe_subscription_id);
        body.set('flow_data[subscription_update_confirm][items][0][id]', yearlyTarget.item);
        body.set('flow_data[subscription_update_confirm][items][0][price]', yearlyTarget.price);
        body.set('flow_data[subscription_update_confirm][items][0][quantity]', '1');
      } else if (withUpdateFlow) {
        body.set('flow_data[type]', 'subscription_update');
        body.set('flow_data[subscription_update][subscription]', sub.stripe_subscription_id);
      }
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
    const wantsUpdate = intent === 'yearly' && !!sub.stripe_subscription_id;
    let r = await mk(wantsCancel, wantsUpdate);
    let j = await r.json().catch(() => ({}));
    if (!r.ok && wantsUpdate && yearlyTarget) {
      console.error('[create-portal-session] yearly confirm flow refused:', (j && j.error && j.error.message) || r.status);
      yearlyTarget = null;
      r = await mk(false, true);
      j = await r.json().catch(() => ({}));
    }
    if (!r.ok && wantsUpdate) {
      console.error('[create-portal-session] plan-switch flow refused:', (j && j.error && j.error.message) || r.status);
      r = await mk(false, false);
      j = await r.json().catch(() => ({}));
    }
    // The cancel deep-link needs cancellation enabled in the portal configuration. If it isn't, do
    // NOT leave them staring at an error — open the ordinary portal so they still get somewhere,
    // and log loudly, because a provider unable to cancel is a support ticket and a trust problem.
    if (!r.ok && wantsCancel) {
      console.error('[create-portal-session] cancel flow refused:', (j && j.error && j.error.message) || r.status);
      r = await mk(false);
      j = await r.json().catch(() => ({}));
      if (r.ok) { res.status(200).json({ ok: true, url: j.url, cancelFlow: false }); return; }
    }
    if (!r.ok) {
      // Stripe's raw message was going straight to the browser here, which can name a customer id
      // or the account's portal configuration. Same treatment as build-checkout: log it whole,
      // return it with every identifier stripped, in a field separate from what she is shown.
      const sm = (j && j.error && j.error.message) || '';
      console.error('[create-portal-session] stripe error', r.status, sm);
      res.status(502).json({ error: 'Could not open billing portal.', detail: safeStripeMessage(sm) });
      return;
    }
    res.status(200).json({ ok: true, url: j.url, cancelFlow: wantsCancel });
  } catch (e) { console.error('[create-portal-session] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
