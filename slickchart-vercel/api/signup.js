// POST /api/signup  { email, password, name }
// Creates a provider account (unverified), emails a verification link, and
// returns a session token so they can start using the app right away.
import { sql, ensureProvidersTable, dbEnabled, hasActiveSubscription } from '../lib/db.js';
import { signToken, hashPassword, makeToken, createSession } from '../lib/auth.js';
import { sendEmail, trustedOrigin, addToAudience, welcomeEmailHtml, welcomeEmailText } from '../lib/email.js';
import { pushFoundersReport, founderPushConfigured } from '../lib/fcm.js';
import { recordNotify } from '../lib/notify-log.js';
import crypto from 'crypto';
import { signupPricing } from '../lib/pricing.js';
import { recordSignupProblem, nearPaidEmails } from '../lib/signup-rescue.js';

// Every refusal leaves a row (lib/signup-rescue.js), so a provider stuck at Create account is seen by
// the server, not only when she writes to Ashley (2026-11-18). Best-effort, never changes the answer.
async function noteRefusal(email, status, error) {
  if (!email || !dbEnabled()) return;
  try { await recordSignupProblem(sql(), { email, kind: 'signup-refused', extra: status + ': ' + String(error || '').slice(0, 160) }); } catch (e) {}
}

// Escape user-supplied text before dropping it into the founder-notification HTML email.
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured. Add a Postgres (Neon) database in Vercel.' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) { res.status(500).json({ error: 'Login is not configured. Set SESSION_SECRET in Vercel.' }); return; }

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const name = String(b.name || '').trim();
  if (!email || !/.+@.+\..+/.test(email)) { res.status(400).json({ error: 'Please enter a valid email address.' }); return; }
  if (password.length < 8) { await noteRefusal(email, 400, 'short password'); res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }

  // Payment gate — off by default so this can be deployed and tested safely
  // before it's actually enforced. Set REQUIRE_PAYMENT=true in Vercel once the
  // Stripe webhook is confirmed working.
  if ((process.env.REQUIRE_PAYMENT || '').toLowerCase() === 'true') {
    try {
      const paid = await hasActiveSubscription(email);
      if (!paid) {
        const price = signupPricing();
        // She may well have paid, under a slightly different email (a typo at checkout is the usual
        // one: 2026-11-18, "tahoo.com"). Tell Ashley straight away with the address she likely paid
        // under; the answer below is the same either way, so this never reveals anyone's payment.
        try {
          const q0 = sql();
          const near = await nearPaidEmails(q0, email);
          await recordSignupProblem(q0, { email, kind: 'signup-unpaid', match: near[0] || null,
            extra: near.length ? 'She typed this email at Create account; the payment is under the one above.' : '' });
        } catch (e) { /* never block the answer */ }
        res.status(402).json({
          error: 'We can\u2019t find a subscription under this email yet. If you already paid, check the email for a typo and use the exact one you typed at checkout. We\u2019ve let Ashley know too, so she can help. Not subscribed yet? Subscribe first, then come back here.',
          checkoutUrl: price.checkoutUrl,
          checkoutUrlYear: price.checkoutUrlYear,
          priceMonth: price.month,
          priceYear: price.year
        });
        return;
      }
    } catch (e) { await noteRefusal(email, 500, 'payment check failed'); res.status(500).json({ error: 'Could not verify payment status. Please try again.' }); return; }
  }

  try {
    await ensureProvidersTable();
    const q = sql();
    const existing = await q`SELECT id, coalesce(needs_setup, false) AS needs_setup FROM providers WHERE email = ${email}`;
    // Paying made her account already (lib/account-setup.js), still waiting for a password. Making it
    // here instead of from the emailed link is fine: such an account has never been signed in to and
    // holds nothing, which is exactly what Create account was before this existed.
    let id = '';
    if (existing.length && existing[0].needs_setup) {
      const claimed = await q`UPDATE providers SET pass_hash = ${hashPassword(password)}, needs_setup = false,
          name = CASE WHEN ${name} <> '' THEN ${name} ELSE name END, marketing_opt_in = ${!!b.optIn}
        WHERE id = ${existing[0].id} AND coalesce(needs_setup, false) RETURNING id`;
      if (claimed.length) { id = claimed[0].id; try { await q`DELETE FROM auth_tokens WHERE provider_id = ${id} AND kind = 'setup'`; } catch (e) {} }
    }
    if (!id && existing.length) { await noteRefusal(email, 409, 'already has an account'); res.status(409).json({ error: 'An account with that email already exists — try logging in.' }); return; }

    if (!id) {
      id = 'p_' + crypto.randomBytes(8).toString('hex');
      await q`INSERT INTO providers (id, email, name, pass_hash, verified, marketing_opt_in) VALUES (${id}, ${email}, ${name}, ${hashPassword(password)}, false, ${!!b.optIn})`;
    }
    if (b.optIn) { try { await addToAudience(email, name); } catch (e) { /* non-fatal */ } }

    // Email verification link (valid 24h)
    const vtoken = makeToken();
    await q`INSERT INTO auth_tokens (token, provider_id, kind, expires_at) VALUES (${vtoken}, ${id}, 'verify', now() + interval '24 hours')`;
    const link = trustedOrigin() + '/slickchart?verify=' + vtoken;
    try {
      await sendEmail({
        to: email,
        subject: `Welcome to SlickChart, ${name ? name.split(' ')[0] : 'friend'} — let's build this together`,
        text: welcomeEmailText({ name, link }),
        html: welcomeEmailHtml({ name, link })
      });
    } catch (e) { console.error('[signup] welcome email failed:', e && e.message || e); /* don't block signup on email failure */ }

    // Founder ping: email whoever is set in FOUNDER_NOTIFY_EMAIL when a new provider signs up.
    // Best-effort — never blocks or fails the signup. Set FOUNDER_NOTIFY_EMAIL in Vercel to override.
    //
    // Dedupe rule: a PAYING provider pays first, then creates the account, and the Stripe webhook
    // already sent the single "💰 New PAID provider" email. So if this new account already has an
    // active subscription, we SKIP this signup email — the founder gets exactly one email per paid
    // signup instead of two. Free / not-yet-paid signups still ping (the webhook won't fire for them).
    let _alreadyPaid = false;
    try { _alreadyPaid = await hasActiveSubscription(email); } catch (e) { _alreadyPaid = false; }
    // Has Ashley ALREADY been told about this person? A paying provider pays first, so the Stripe
    // webhook's "💰 New PAID provider" ping has usually already gone out by the time they create the
    // account — and a second "New signup" for the same human is just noise.
    //
    // The signal is subscriptions.paid_notified_at, NOT hasActiveSubscription. That distinction is the
    // whole point: gating on "looks paid" is what silenced real signups, because a stale subscription
    // row (roadmap sales used to write one) makes someone look paid when no payment event ever fired
    // and no ping was ever sent. paid_notified_at is stamped by the webhook at the moment it actually
    // announces someone, so it means "already told" rather than "probably told".
    let _alreadyAnnounced = false;
    try {
      const n = await q`SELECT paid_notified_at FROM subscriptions WHERE lower(email) = ${email} AND paid_notified_at IS NOT NULL`;
      _alreadyAnnounced = n.length > 0;
    } catch (e) { _alreadyAnnounced = false; }   // never announced is the safe assumption: a duplicate beats silence
    // Account number, shared by the founder email and the push below.
    let _total = 0;
    try { const c = await q`SELECT count(*)::int AS n FROM providers`; _total = (c && c[0] && c[0].n) || 0; } catch (e) {}
    try {
      // Default to the owner's inbox so signup pings work out of the box (no env setup needed).
      const notifyTo = String(process.env.FOUNDER_NOTIFY_EMAIL || process.env.FOUNDER_EMAILS || 'botanicalaestheticsbyashley@gmail.com').split(',')[0].trim();
      // Skipped only when the webhook has already announced this exact person (see above). If they
      // merely LOOK paid but were never announced, this still fires — silence is the worse failure.
      if (notifyTo && !_alreadyAnnounced) {
        const total = _total;
        // Only reachable when the webhook never announced them, so an active subscription here means
        // the row exists without a payment event behind it — usually a stale roadmap-sale row.
        const paidNote = _alreadyPaid ? ' (NOTE: this email already has an active subscription row, but no paid-provider ping was ever sent for it — worth checking it is not a leftover roadmap-sale row giving them SlickChart free)' : '';
        const when = new Date().toLocaleString('en-US', { timeZone: process.env.FOUNDER_TZ || 'America/Los_Angeles' });
        const optLine = b.optIn ? 'Yes' : 'No';
        await sendEmail({
          to: notifyTo,
          subject: `🎉 New SlickChart signup: ${name || email}${total ? ` (#${total})` : ''}${_alreadyPaid ? ' — check this one' : ''}`,
          text: `A new provider just created a SlickChart account${paidNote}.\n\nName: ${name || '(not given)'}\nEmail: ${email}\nMarketing opt-in: ${optLine}\nSigned up: ${when}\nTotal accounts: ${total}\n`,
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:8px;">
            <div style="font-size:22px;margin-bottom:6px;">🎉 New signup${total ? ` · #${total}` : ''}</div>
            <div style="font-size:14px;color:#333;line-height:1.9;">
              <b>Name:</b> ${escHtml(name || '(not given)')}<br>
              <b>Email:</b> ${escHtml(email)}<br>
              <b>Marketing opt-in:</b> ${optLine}<br>
              <b>Signed up:</b> ${escHtml(when)}<br>
              <b>Total accounts:</b> ${total}${_alreadyPaid ? '<br><b style="color:#a36">Note:</b> this email already has an active subscription row, but no paid-provider ping was ever sent for it. Worth checking it is not a leftover roadmap-sale row giving them SlickChart free.' : ''}
            </div></div>`
        });
      }
    } catch (e) { console.error('[signup] founder notify failed:', e && e.message || e); /* never block signup */ }

    // ── Native push to the founder's phone(s) ─────────────────────────────────────────────
    // Ashley gets ONE ping per new provider. A paying one is announced by the Stripe webhook when the
    // payment lands; this covers anyone the webhook did not announce, so the two together can neither
    // double up nor leave a gap.
    let _pushSkipped = '', _pushDevices = 0, _pushSent = 0, _pushDetail = '';
    try {
      if (_alreadyAnnounced) {
        _pushSkipped = 'already announced by the paid-provider ping';
      } else if (!founderPushConfigured()) {
        _pushSkipped = 'no push transport configured (FIREBASE_SERVICE_ACCOUNT, APNS_KEY_P8 or VAPID keys)';
      } else {
        const r = await pushFoundersReport({
          title: _alreadyPaid ? '🎉 New provider sign-up (already subscribed)' : '🎉 New provider sign-up!',
          body: (name || email) + ' just created an account' + (_total ? ` — that's ${_total} accounts now` : ''),
          url: '/slickchart', tag: 'signup:' + email
        });
        _pushDevices = r.devices || 0;
        _pushSent = r.sent || 0;
        if (!r.providerIds || !r.providerIds.length) _pushDetail = 'no provider row matches FOUNDER_EMAILS (' + (r.emails || []).join('|') + ')';
        else if (!_pushDevices) _pushDetail = 'founder provider row found, but no phone or browser registered under it';
        else if (!_pushSent) _pushDetail = ((r.results || [])[0] || {}).error || 'device found but the send failed';
        if (r.failedLine) _pushDetail = (_pushDetail ? _pushDetail + ' | ' : '') + 'not delivered: ' + r.failedLine;
        console.log('[signup] new-signup push: devices=' + _pushDevices + ' sent=' + _pushSent + ' for=' + email + (_pushDetail ? ' — ' + _pushDetail : ''));
      }
    } catch (e) {
      _pushSkipped = 'threw: ' + ((e && e.message) || 'unknown');
      console.error('[signup] founder push failed:', e && e.message || e); /* never block signup */
    }
    // Leave a trace either way. Without this a missed alert is unfalsifiable after the fact.
    await recordNotify({
      kind: 'provider-signup', subject: email, skipped: _pushSkipped,
      devices: _pushDevices, sent: _pushSent,
      detail: (_alreadyAnnounced ? 'skipped: the paid-provider ping already covered them. ' : (_alreadyPaid ? 'looks paid but was never announced, so this fired. ' : '')) + _pushDetail
    });

    const token = signToken({ u: id, e: email, sid: await createSession(q, id, req) }, secret);
    res.status(200).json({ token, name, email, verified: false });
  } catch (e) {
    // A concurrent signup with the same email (e.g. a double-tapped button) races past the
    // SELECT above and trips the UNIQUE(email) constraint. Surface the friendly 409, not a 500.
    const code = e && (e.code || (e.cause && e.cause.code));
    if (code === '23505' || /duplicate key|unique constraint/i.test(String(e && e.message || ''))) {
      await noteRefusal(email, 409, 'already has an account (race)');
      res.status(409).json({ error: 'An account with that email already exists — try logging in.' });
      return;
    }
    await noteRefusal(email, 500, (e && e.message) || 'error');
    console.error('[signup] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' });
  }
}
