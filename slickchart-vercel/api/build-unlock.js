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
import { sendEmail, trustedOrigin } from '../lib/email.js';
import { dbEnabled, sql, ensureTable } from '../lib/db.js';
import { recordBuildSale } from '../lib/build-sales.js';

// Send the buyer their link once, so closing the tab doesn't lose it. Idempotent via a kv marker —
// a refresh of the success page must not re-send. Failing to mark is not failing to unlock.
async function emailOnce(sessionId, to, links) {
  if (!to || !dbEnabled()) return;
  try {
    await ensureTable();
    const q = sql();
    const rows = await q`INSERT INTO kv (owner, k, v) VALUES ('build', ${'sent:' + sessionId}, ${String(Date.now())})
      ON CONFLICT (owner, k) DO NOTHING RETURNING k`;
    if (!rows || !rows.length) return;            // already sent for this purchase
  } catch (e) { return; }                          // can't prove it's unsent → don't risk a duplicate
  const origin = trustedOrigin();
  const back = origin + '/build/unlocked?session_id=' + encodeURIComponent(sessionId);
  try {
    await sendEmail({
      to,
      subject: 'Your Build Your Own App access',
      text: 'You\'re in. Here\'s everything:\n\n'
        + 'Start here (watch this first): ' + links.videoUrl + '\n\n'
        + 'The system itself: ' + links.artifactUrl + '\n'
        + '(Pin it in Claude as soon as it opens - it then lives in your sidebar.)\n\n'
        + 'Keep this email — it\'s your way back in. You can also reopen your access page any time:\n'
        + back + '\n\n— Ashley',
      html: '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#1a2a28;">'
        + '<p>You’re in.</p>'
        + '<p><b>1. Start here</b> — watch this first:<br><a href="' + links.videoUrl + '">' + links.videoUrl + '</a></p>'
        + '<p><b>2. The system itself</b>:<br><a href="' + links.artifactUrl + '">' + links.artifactUrl + '</a><br>'
        + '<span style="color:#5D5149;font-size:13.5px;">Pin it in Claude as soon as it opens \u2014 it then lives in your sidebar.</span></p>'
        + '<p>Keep this email — it’s your way back in. You can also <a href="' + back + '">reopen your access page</a> any time.</p>'
        + '<p>— Ashley</p></div>'
    });
  } catch (e) { console.error('[build-unlock] email failed:', e && e.message); }
}

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
    // Don't make the buyer wait on an email send to see their links.
    emailOnce(sessionId, email, { videoUrl, artifactUrl }).catch(() => {});
    // Record the sale (and ping Ashley) from here too. The Stripe webhook normally gets there first,
    // but this path has just had 'paid' confirmed by Stripe itself, so it's a safe second route in if
    // the webhook is ever mis-subscribed. recordBuildSale claims the notification once per session id,
    // so whichever arrives first announces and the other no-ops. Never blocks the buyer.
    recordBuildSale({
      sessionId,
      email,
      amountCents: Number.isFinite(j.amount_total) ? j.amount_total : null,
      currency: j.currency || null
    }).catch(() => {});
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, videoUrl, artifactUrl, email });
  } catch (e) {
    console.error('[build-unlock] failed:', e && e.stack || e);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please refresh, or email hello@slickchart.app.' });
  }
}
