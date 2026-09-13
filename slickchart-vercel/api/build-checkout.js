// POST /api/build-checkout  { }  -> { url }
//
// Starts a Stripe Checkout Session for the Build Your Own App system. The price lives in Stripe (env
// BUILD_PRICE_ID), so changing what it costs is a Stripe dashboard change, never a deploy.
//
// After paying, Stripe sends the buyer to /build/unlocked?session_id=cs_... — and that page proves the
// purchase by asking Stripe about that session (see build-unlock.js). No database, no licence keys, no
// second webhook: Stripe is the source of truth for "did this person pay", so we just ask it.
import { trustedOrigin } from '../lib/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const key = process.env.STRIPE_SECRET_KEY || '';
  const price = process.env.BUILD_PRICE_ID || '';
  if (!key || !price) {
    console.error('[build-checkout] missing STRIPE_SECRET_KEY or BUILD_PRICE_ID');
    res.status(500).json({ error: 'Checkout isn’t set up yet. Please try again shortly.' });
    return;
  }
  const origin = trustedOrigin();
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('line_items[0][price]', price);
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', origin + '/build/unlocked?session_id={CHECKOUT_SESSION_ID}');
  form.set('cancel_url', origin + '/build');
  // Stripe collects the email; we need it to send the buyer their link so they can come back later.
  form.set('customer_creation', 'always');
  // Tags this sale so the Stripe webhook can tell it apart from a SlickChart subscription checkout —
  // both arrive as checkout.session.completed. Without this, a one-off roadmap sale would be written
  // into `subscriptions` as an active paid provider. (The webhook also treats any mode='payment'
  // session as a roadmap sale, so the guard holds even for a session created before this line shipped.)
  form.set('metadata[product]', 'build');
  form.set('payment_intent_data[metadata][product]', 'build');
  // Stripe shows a marketing opt-in tickbox on the checkout page and reports the answer back as
  // session.consent.promotions. That is how the buyer list gets built with real, recorded consent
  // rather than by assuming a purchase is permission to market to someone later.
  form.set('consent_collection[promotions]', 'auto');
  form.set('allow_promotion_codes', 'true');
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) {
      // Stripe's raw error can name price ids and account state — log it, don't return it.
      console.error('[build-checkout] stripe error', r.status, (j && j.error && j.error.message) || '');
      res.status(502).json({ error: 'Couldn’t start checkout. Please try again.' });
      return;
    }
    res.status(200).json({ url: j.url });
  } catch (e) {
    console.error('[build-checkout] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Couldn’t start checkout. Please try again.' });
  }
}
