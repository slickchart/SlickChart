// Recording a Build Your Own App sale, and telling Ashley about it.
//
// Two different places learn that a $97 purchase happened, and either one can be first:
//   1. api/stripe-webhook.js  — Stripe's checkout.session.completed (authoritative, arrives even if
//      the buyer closes the tab on the Stripe page)
//   2. api/build-unlock.js    — the buyer landing on /build/unlocked, where we've already asked Stripe
//      directly whether that session is paid
//
// Both call recordBuildSale(). The row is keyed by the Stripe session id, and the founder ping is
// claimed with an UPDATE ... WHERE notified_at IS NULL, so whichever path gets there first does the
// announcing and the other one quietly no-ops. That means a missing webhook subscription can't cost
// Ashley the notification, and a working one can't double it.
//
// Nothing in here may throw at its callers: the webhook still owes Stripe a 200, and the buyer is
// waiting on the unlock response.
import { sql, dbEnabled, ensureTable, ensureBuildPurchasesTable } from './db.js';
import { sendEmail, trustedOrigin, addToAudience } from './email.js';
import { pushFoundersReport, nativePushConfigured } from './fcm.js';
import { recordNotify } from './notify-log.js';

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Same inbox the paid-provider ping uses, and the same built-in default, so a sale is never missed
// just because an env var hasn't been set yet.
function founderNotifyEmail() {
  return String(process.env.FOUNDER_NOTIFY_EMAIL || process.env.FOUNDER_EMAILS || 'botanicalaestheticsbyashley@gmail.com').split(',')[0].trim();
}

// Emails whose purchases shouldn't show in the numbers — Ashley's own test buys. Set
// BUILD_EXCLUDE_EMAILS in Vercel (comma separated).
//
// Why a filter and not a DELETE: the purchase is real in Stripe forever, and both /build/access and
// /build/unlocked re-record from Stripe, so a deleted row simply comes back the next time either page
// runs for that address. Filtering survives that. The row also stays on the books, which is the honest
// version — the money did change hands.
export function excludedBuyerEmails() {
  return String(process.env.BUILD_EXCLUDE_EMAILS || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
}

function money(cents, currency) {
  if (!Number.isFinite(cents)) return '';
  const cur = String(currency || 'usd').toUpperCase();
  const amount = (cents / 100).toFixed(2).replace(/\.00$/, '');
  return (cur === 'USD' ? '$' : cur + ' ') + amount;
}

/**
 * Record one paid Build Your Own App checkout, and ping the founder exactly once for it.
 * Safe to call repeatedly with the same session id.
 *
 * Pass notify:false to record a sale WITHOUT announcing it — used when recovering an older purchase
 * that Ashley was never going to be pinged about anyway, so a backfill can't fire a "sold!" push
 * days after the fact. The sale still counts in the stats; it is just stamped as already told.
 *
 * @param {{sessionId:string, email?:string, amountCents?:number|null, currency?:string|null, notify?:boolean}} sale
 */
export async function recordBuildSale(sale) {
  const sid = String((sale && sale.sessionId) || '').trim();
  if (!sid || !dbEnabled()) return;
  const email = String((sale && sale.email) || '').trim().toLowerCase() || null;
  const amountCents = Number.isFinite(sale && sale.amountCents) ? sale.amountCents : null;
  const currency = String((sale && sale.currency) || '').toLowerCase() || null;
  // true / false / null — null means this buyer was never shown the box (see the column comment).
  const optIn = (sale && typeof sale.marketingOptIn === 'boolean') ? sale.marketingOptIn : null;

  let q;
  try {
    await ensureBuildPurchasesTable();
    q = sql();
    // COALESCE keeps whatever the first writer knew: if the redirect recorded the sale without an
    // amount, a later webhook fills it in, and neither one blanks a field the other already set.
    await q`INSERT INTO build_purchases (stripe_session_id, email, amount_cents, currency, marketing_opt_in)
      VALUES (${sid}, ${email}, ${amountCents}, ${currency}, ${optIn})
      ON CONFLICT (stripe_session_id) DO UPDATE SET
        email            = COALESCE(build_purchases.email, EXCLUDED.email),
        amount_cents     = COALESCE(build_purchases.amount_cents, EXCLUDED.amount_cents),
        currency         = COALESCE(build_purchases.currency, EXCLUDED.currency),
        marketing_opt_in = COALESCE(build_purchases.marketing_opt_in, EXCLUDED.marketing_opt_in)`;
  } catch (e) {
    console.error('[build-sales] could not record sale:', e && e.message || e);
    return;   // no row means no claim to make; better a missed ping than an unrecorded one
  }

  // Once-ever claim for this sale. If the claim itself errors we stay SILENT rather than notify
  // anyway — the same call the paid-provider ping makes, and for the same reason: a rare missed ping
  // is recoverable, a repeating false one is not.
  let claimed = false;
  try {
    const rows = await q`UPDATE build_purchases SET notified_at = now()
      WHERE stripe_session_id = ${sid} AND notified_at IS NULL
      RETURNING stripe_session_id`;
    claimed = !!(rows && rows.length);
  } catch (e) {
    console.error('[build-sales] notify claim failed, staying silent:', e && e.message || e);
    return;
  }
  // The buyer list, built from recorded consent only. BUILD_AUDIENCE_ID is a SEPARATE Resend
  // audience from the SlickChart one: these are two different products and their lists must not
  // merge. If it isn't set, nothing goes to Resend — the consent is still stored on the row above,
  // so no signup is lost and the list can be exported or synced later.
  if (optIn === true && email) {
    try { await addToAudience(email, '', String(process.env.BUILD_AUDIENCE_ID || '')); }
    catch (e) { console.error('[build-sales] audience add failed:', e && e.message || e); }
  }

  if (!claimed) return;   // the other path already announced this one
  if (sale && sale.notify === false) return;   // backfill: counted, deliberately silent

  // Running totals, for the "that's N now" line. Best-effort — a sale still announces without them.
  let total = 0, cents = 0;
  try {
    const c = await q`SELECT count(*)::int AS n, COALESCE(sum(amount_cents), 0)::bigint AS cents FROM build_purchases`;
    total = (c[0] && c[0].n) || 0;
    cents = Number((c[0] && c[0].cents) || 0);
  } catch (e) {}

  const who = email || '(no email on the receipt)';
  const price = money(amountCents, currency);
  const runningTotal = total ? `${total} sold so far${cents ? ' · ' + money(cents, currency) + ' collected' : ''}` : '';

  // ── Founder email ──────────────────────────────────────────────────────────
  try {
    const to = founderNotifyEmail();
    if (to) await sendEmail({
      to,
      subject: `🚀 Build Your Own App sold${price ? ' — ' + price : ''}`,
      text: `Someone just bought Build Your Own App.\n\nEmail: ${who}\n`
        + (price ? `Paid: ${price}\n` : '')
        + (runningTotal ? `\n${runningTotal}\n` : '')
        + `\nTheir access links went out automatically.`,
      html: '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:8px;">'
        + '<div style="font-size:22px;margin-bottom:6px;">🚀 Build Your Own App sold</div>'
        + `<div style="font-size:14px;color:#333;line-height:1.9;"><b>Email:</b> ${escHtml(who)}`
        + (price ? `<br><b>Paid:</b> ${escHtml(price)}` : '') + '</div>'
        + (runningTotal ? `<div style="font-size:13px;color:#2a7;margin-top:10px;">${escHtml(runningTotal)}</div>` : '')
        + '<div style="font-size:12px;color:#777;margin-top:10px;">Their access links went out automatically.</div></div>'
    });
  } catch (e) { console.error('[build-sales] founder email failed:', e && e.message || e); }

  // ── Native push to the founder's phone(s) ──────────────────────────────────
  // Same founder lookup and the same recorded outcome as a provider signup, so a missed sale alert
  // leaves the same readable trace instead of nothing. A sale is the one alert worth least guessing.
  let skipped = '', devices = 0, sentCount = 0, detail = '';
  try {
    if (!nativePushConfigured()) {
      skipped = 'no push transport configured (FIREBASE_SERVICE_ACCOUNT for Android, APNS_KEY_P8 for iPhone)';
    } else {
      const body = (price ? price + ' — ' : '') + who
        + (total ? ` · that's ${total} sold 🎉` : ' 🎉');
      const r = await pushFoundersReport({ title: '🚀 Build Your Own App sold!', body, url: '/slickchart', tag: 'build-sale:' + sid });
      devices = r.devices || 0; sentCount = r.sent || 0;
      if (!r.providerIds || !r.providerIds.length) detail = 'no provider row matches FOUNDER_EMAILS (' + (r.emails || []).join('|') + ')';
      else if (!devices) detail = 'founder provider row found, but no phone registered under it';
      else if (!sentCount) detail = ((r.results || [])[0] || {}).error || 'device found but the send failed';
      console.log('[build-sales] sale push: devices=' + devices + ' sent=' + sentCount + ' session=' + sid + (detail ? ' — ' + detail : ''));
    }
  } catch (e) {
    skipped = 'threw: ' + ((e && e.message) || 'unknown');
    console.error('[build-sales] founder push failed:', e && e.message || e);
  }
  await recordNotify({ kind: 'build-sale', subject: (sale && sale.email) || '', skipped, devices, sent: sentCount, detail });
}

// ── The buyer's own access email ─────────────────────────────────────────────────────────────────
// Lives here rather than in build-unlock.js because two paths send it: the success redirect right
// after paying, and /api/build-access when someone asks for it again because they lost the first one.
export function accessEmailBody(sessionId, links) {
  const origin = trustedOrigin();
  const back = origin + '/build/unlocked?session_id=' + encodeURIComponent(sessionId);
  const accessUrl = origin + '/build/access';
  const accessLabel = accessUrl.replace(/^https?:\/\//, '');   // shown text must match where it goes
  return {
    subject: 'Your Build Your Own App access',
    text: 'You\'re in. Here\'s everything:\n\n'
      + 'Start here (watch this first): ' + links.videoUrl + '\n\n'
      + 'The system itself: ' + links.artifactUrl + '\n'
      + '(Pin it in Claude as soon as it opens - it then lives in your sidebar.)\n\n'
      + 'Using the Claude desktop app? Pinning is saved to your Claude account, not to a browser, so\n'
      + 'pin it once and it is in your sidebar there too. Then pick one place and stay in it - your\n'
      + 'ticks save where you tick them.\n\n'
      + 'Your access page, any time: ' + back + '\n\n'
      + 'Lost this email? You do not need it. Go to ' + accessUrl + ', put in the\n'
      + 'email you paid with, and it comes straight back to you.\n\n- Ashley',
    // Built to the same shape as the SlickChart welcome email (dark brand header, light body, cards)
    // so the two read as one business. Email-safe throughout: tables not flex, inline styles only, no
    // web fonts (Georgia stands in for Fraunces), and a solid teal under the gradient because Outlook
    // drops background-image and would otherwise render dark text on nothing.
    html: '<div style="background:#f4f8f7;padding:22px 10px;">'
      + '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">'

      + '<div style="background:#0a1719;padding:26px 24px;text-align:center;color:#eaf6f4;">'
      // The wordmark is TEXT, not an image. Most mail clients block remote images by default, and the
      // image version left a broken-image box sitting where the brand should be. The logo mark stays
      // as an image because alt="" makes it vanish cleanly when blocked, rather than leaving a gap.
      + '<img src="https://slickchart.app/assets/slickchart-logo.png" width="40" height="40" alt="" style="display:block;margin:0 auto 8px;border:0;background:#0a1719;">'
      + '<div style="font-size:21px;font-weight:700;letter-spacing:-.01em;color:#eaf6f4;line-height:1.2;">Slick<span style="color:#2bc7ac;">Chart</span></div>'
      + '<div style="height:1px;width:34px;background:#2bc7ac;opacity:.5;margin:11px auto;"></div>'
      + '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:18px;color:#6fdca6;letter-spacing:.01em;">Build Your Own App</div>'
      + '</div>'

      + '<div style="padding:30px 26px 8px;color:#1a2a28;">'
      + '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:30px;line-height:1.2;margin:0 0 8px;color:#0a1719;">You’re in.</div>'
      + '<p style="font-size:15.5px;line-height:1.7;color:#5D5149;margin:0 0 26px;">Everything you bought is right here. Do them in order — the video first.</p>'

      + '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 6px;"><tr>'
      + '<td width="34" valign="top" style="padding:0 0 4px;"><div style="width:26px;height:26px;border-radius:50%;background:#2bc7a2;color:#03201e;font-size:13px;font-weight:700;text-align:center;line-height:26px;">1</div></td>'
      + '<td valign="top" style="padding:0 0 4px;"><div style="font-family:Georgia,\'Times New Roman\',serif;font-size:19px;color:#0a1719;line-height:1.3;">Watch this first</div>'
      + '<p style="font-size:14.5px;line-height:1.65;color:#5D5149;margin:5px 0 12px;">Short, and it’s the part that stops you starting in the wrong place.</p>'
      + '<a href="' + links.videoUrl + '" style="background:#2bc7a2;background-image:linear-gradient(135deg,#19b8bf 0%,#2bc7a2 52%,#6fdca6 100%);color:#03201e;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block;font-size:15px;">Watch the intro &rarr;</a>'
      + '</td></tr></table>'

      + '<div style="height:1px;background:#e6eeec;margin:26px 0;"></div>'

      + '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr>'
      + '<td width="34" valign="top" style="padding:0 0 4px;"><div style="width:26px;height:26px;border-radius:50%;background:#2bc7a2;color:#03201e;font-size:13px;font-weight:700;text-align:center;line-height:26px;">2</div></td>'
      + '<td valign="top" style="padding:0 0 4px;"><div style="font-family:Georgia,\'Times New Roman\',serif;font-size:19px;color:#0a1719;line-height:1.3;">Open the system</div>'
      + '<p style="font-size:14.5px;line-height:1.65;color:#5D5149;margin:5px 0 12px;">The Master Build Roadmap — every step, every prompt, in order.</p>'
      + '<a href="' + links.artifactUrl + '" style="background:#2bc7a2;background-image:linear-gradient(135deg,#19b8bf 0%,#2bc7a2 52%,#6fdca6 100%);color:#03201e;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block;font-size:15px;">Open the roadmap &rarr;</a>'
      + '</td></tr></table>'

      + '<div style="background:#eef6f4;border-radius:12px;padding:17px 19px;margin:26px 0 0;">'
      + '<div style="font-size:11.5px;font-weight:700;color:#1e9e88;text-transform:uppercase;letter-spacing:.06em;margin-bottom:9px;">Two things that save you a headache</div>'
      + '<p style="font-size:14px;line-height:1.7;color:#3a3a3a;margin:0 0 10px;"><b>Pin it the moment it opens.</b> Use the menu on the page and choose Pin, and it lives in your sidebar instead of getting lost in old chats. Pinning is saved to your Claude account, not to a browser — so it’s in the desktop app too, with nothing to install.</p>'
      + '<p style="font-size:14px;line-height:1.7;color:#3a3a3a;margin:0;"><b>Then pick one place and stay in it.</b> Your ticks save where you tick them, so if you start in the desktop app, keep going there.</p>'
      + '</div>'

      + '<div style="border:1px solid #e6eeec;border-radius:12px;padding:16px 19px;margin:14px 0 0;">'
      + '<p style="font-size:13.5px;line-height:1.65;color:#5D5149;margin:0;"><b style="color:#1a2a28;">Lost this email?</b> You don’t need it. Go to <a href="' + accessUrl + '" style="color:#1e9e88;">' + accessLabel + '</a>, put in the email you paid with, and it comes straight back to you. Your <a href="' + back + '" style="color:#1e9e88;">access page</a> is always there too.</p>'
      + '</div>'

      + '<p style="font-size:15px;line-height:1.7;margin:26px 0 0;color:#1a2a28;">Go build it.<br><strong>Ashley</strong><br><span style="color:#999;font-size:13px;">Founder, SlickChart · Botanical Aesthetics</span></p>'
      + '</div>'

      + '<div style="padding:20px 26px 24px;text-align:center;">'
      + '<p style="font-size:12px;line-height:1.6;color:#9aa8a5;margin:0;">Licensed to one buyer for their own use. Please don’t resell or share it.<br>'
      + 'Questions? Just reply — it reaches me.</p>'
      + '</div>'

      + '</div></div>'
  };
}

/** Send the access email, no questions asked. Used by the "I lost my email" flow. */
export async function sendAccessEmail(to, sessionId, links) {
  if (!to) return;
  const body = accessEmailBody(sessionId, links);
  await sendEmail({ to, subject: body.subject, text: body.text, html: body.html });
}

/**
 * Send the access email at most once per checkout, for the success redirect — a refresh of that page
 * must not re-send.
 *
 * The marker is RELEASED if the send fails. The original version left it in place, so a send that
 * never happened still looked sent and the buyer could never get the email, no matter how many times
 * they reloaded. (That is on top of the real reason the first one went missing: the caller never
 * awaited this, and a serverless function is frozen the moment it responds.)
 */
export async function sendAccessEmailOnce(to, sessionId, links) {
  if (!to || !dbEnabled()) return;
  let q;
  try {
    await ensureTable();
    q = sql();
    const rows = await q`INSERT INTO kv (owner, k, v) VALUES ('build', ${'sent:' + sessionId}, ${String(Date.now())})
      ON CONFLICT (owner, k) DO NOTHING RETURNING k`;
    if (!rows || !rows.length) return;            // already sent for this purchase
  } catch (e) {
    console.error('[build-sales] access-email claim failed:', e && e.message || e);
    return;                                        // can't prove it's unsent → don't risk a duplicate
  }
  try {
    await sendAccessEmail(to, sessionId, links);
  } catch (e) {
    console.error('[build-sales] access email failed, releasing the marker so a reload retries:', e && e.message || e);
    try { await q`DELETE FROM kv WHERE owner = 'build' AND k = ${'sent:' + sessionId}`; } catch (e2) {}
  }
}
