// POST /api/build-checkout  { }  -> { url }
//
// Starts a Stripe Checkout Session for the Build Your Own App system. The price lives in Stripe (env
// BUILD_PRICE_ID), so changing what it costs is a Stripe dashboard change, never a deploy.
//
// After paying, Stripe sends the buyer to /build/unlocked?session_id=cs_... — and that page proves the
// purchase by asking Stripe about that session (see build-unlock.js). No database, no licence keys, no
// second webhook: Stripe is the source of truth for "did this person pay", so we just ask it.
import { trustedOrigin } from '../lib/email.js';
import { safeStripeMessage } from '../lib/stripe-safe.js';

// Stripe's way of saying "this account has not agreed to the extra Terms of Service that
// consent_collection requires". It arrives as a plain invalid_request_error with no `param`, so the
// message is the only thing that identifies it — matched on the two stable halves rather than the
// whole sentence, and narrowly enough that no other rejection is mistaken for it.
function needsPromotionsToS(j) {
  const m = String((j && j.error && j.error.message) || '');
  return /consent_collection/i.test(m) && /terms of service/i.test(m);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const key = process.env.STRIPE_SECRET_KEY || '';
  const price = process.env.BUILD_PRICE_ID || '';
  if (!key || !price) {
    console.error('[build-checkout] missing STRIPE_SECRET_KEY or BUILD_PRICE_ID');
    res.status(500).json({ error: 'Checkout isn’t set up yet.', code: 'not_configured' });
    return;
  }
  const origin = trustedOrigin();
  const build = (withPromotions) => {
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
  if (withPromotions) form.set('consent_collection[promotions]', 'auto');
  form.set('allow_promotion_codes', 'true');
  return form;
  };
  const create = async (withPromotions) => {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: build(withPromotions).toString()
    });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  };
  try {
    let { r, j } = await create(true);
    // Stripe refuses consent_collection.promotions until the ACCOUNT agrees to an extra Terms of
    // Service in the dashboard, and it refuses the whole session, not just that field. So an
    // un-ticked box in a Stripe setting silently killed every single sale. The opt-in is worth
    // having (it is how the buyer list gets real recorded consent instead of assuming a purchase is
    // permission to market) but it is NOT worth a dead buy button, so if that is the complaint we
    // drop just that field and sell. Nothing else is retried. The moment the ToS is agreed in the
    // dashboard the first attempt succeeds again and the opt-in comes back with no deploy.
    if (!r.ok && needsPromotionsToS(j)) {
      console.error('[build-checkout] Stripe has not accepted the consent_collection ToS for this account; selling without the marketing opt-in. Agree at dashboard.stripe.com/settings/checkout to restore it.');
      ({ r, j } = await create(false));
    }
    if (!r.ok || !j.url) {
      // Stripe's raw MESSAGE can name price ids and account state, so it stays in the log. The
      // `code` and `param` are a fixed Stripe enum and a parameter NAME — neither carries an id, a
      // key or anything about the account — so they come back in a field the page never renders.
      // Without them a dead checkout looks identical whether the price was archived, the key is in
      // the wrong mode, or Stripe is down, and the only way to tell was Vercel's logs.
      const se = (j && j.error) || {};
      console.error('[build-checkout] stripe error', r.status, se.code || '', se.param || '', se.message || '');
      res.status(502).json({ error: 'Couldn’t start checkout.',
        code: String(se.code || se.type || ('http_' + r.status)).slice(0, 60),
        param: String(se.param || '').slice(0, 60),
        detail: safeStripeMessage(se.message) });
      return;
    }
    res.status(200).json({ url: j.url });
  } catch (e) {
    console.error('[build-checkout] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Couldn’t start checkout.', code: 'unreachable' });
  }
}
