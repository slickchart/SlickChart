// GET /api/build-unlock?session_id=cs_...  -> { ok, videoUrl, artifactUrl, email }
//
// The whole gate. A buyer lands here from Stripe's success redirect; we ask Stripe whether that
// session is actually paid, and only then hand back the video and the Artifact link.
//
// Why this and not a licence-key table: a cs_... id can't be forged into a paid one, because we never
// take the caller's word for it — we ask Stripe. That makes the purchase check stateless, and it means
// there is no database of buyers to get out of sync, no key to lose, and nothing to migrate.
//
// The links themselves are env vars so Ashley can change the video or the Artifact URL in Vercel
// without a deploy.
import { recordBuildSale, sendAccessEmailOnce } from '../lib/build-sales.js';

export default async function handler(req, res) {
  const sessionId = String((req.query && req.query.session_id) || '').trim();
  // Stripe session ids are cs_live_/cs_test_ + base62. Reject anything else before spending a call.
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) { res.status(400).json({ ok: false, error: 'Missing or invalid purchase reference.' }); return; }

  const key = process.env.STRIPE_SECRET_KEY || '';
  const videoUrl = String(process.env.BUILD_VIDEO_URL || '').trim();
  const artifactUrl = String(process.env.BUILD_ARTIFACT_URL || '').trim();
  if (!key) { res.status(500).json({ ok: false, error: 'Not set up yet.' }); return; }
  if (!videoUrl || !artifactUrl) {
    // Never tell a paying customer "not found" because WE haven't finished configuring it.
    console.error('[build-unlock] BUILD_VIDEO_URL / BUILD_ARTIFACT_URL not set');
    res.status(503).json({ ok: false, error: 'Your purchase went through — the materials are being finalised. Email hello@slickchart.app and we’ll send them straight over.' });
    return;
  }

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId), {
      headers: { Authorization: 'Bearer ' + key }
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[build-unlock] stripe error', r.status, (j && j.error && j.error.message) || '');
      res.status(r.status === 404 ? 404 : 502).json({ ok: false, error: 'We couldn’t find that purchase. If you’ve paid, email hello@slickchart.app and we’ll sort it out right away.' });
      return;
    }
    // paid | unpaid | no_payment_required. Only the first two exist here, and only 'paid' unlocks.
    if (String(j.payment_status || '') !== 'paid') {
      res.status(402).json({ ok: false, error: 'That payment hasn’t completed. If your card was charged, email hello@slickchart.app and we’ll get you in.' });
      return;
    }
    const email = String((j.customer_details && j.customer_details.email) || j.customer_email || '').trim();
    // These are AWAITED on purpose. They used to be fire-and-forget so the buyer wasn't kept waiting —
    // but this runs as a serverless function, which is frozen the instant the response is sent, so a
    // pending DB write plus an HTTPS call to Resend simply never finished. The first real buyer got a
    // perfect access page and no email at all. Half a second of latency is the correct trade.
    // Neither one may take the page down with it: the buyer has paid, and they see their links either way.
    try {
      await sendAccessEmailOnce(email, sessionId, { videoUrl, artifactUrl });
    } catch (e) { console.error('[build-unlock] access email failed:', e && e.message || e); }
    try {
      const promo = j.consent && j.consent.promotions;
      await recordBuildSale({
        sessionId,
        email,
        amountCents: Number.isFinite(j.amount_total) ? j.amount_total : null,
        currency: j.currency || null,
        marketingOptIn: promo === 'opt_in' ? true : (promo === 'opt_out' ? false : undefined)
      });
    } catch (e) { console.error('[build-unlock] recording the sale failed:', e && e.message || e); }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, videoUrl, artifactUrl, email });
  } catch (e) {
    console.error('[build-unlock] failed:', e && e.stack || e);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please refresh, or email hello@slickchart.app.' });
  }
}
