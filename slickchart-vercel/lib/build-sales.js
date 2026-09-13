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
import { sendEmail, trustedOrigin } from './email.js';
import { sendNativeToProvider, fcmConfigured } from './fcm.js';

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Same inbox the paid-provider ping uses, and the same built-in default, so a sale is never missed
// just because an env var hasn't been set yet.
function founderNotifyEmail() {
  return String(process.env.FOUNDER_NOTIFY_EMAIL || process.env.FOUNDER_EMAILS || 'botanicalaestheticsbyashley@gmail.com').split(',')[0].trim();
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

  let q;
  try {
    await ensureBuildPurchasesTable();
    q = sql();
    // COALESCE keeps whatever the first writer knew: if the redirect recorded the sale without an
    // amount, a later webhook fills it in, and neither one blanks a field the other already set.
    await q`INSERT INTO build_purchases (stripe_session_id, email, amount_cents, currency)
      VALUES (${sid}, ${email}, ${amountCents}, ${currency})
      ON CONFLICT (stripe_session_id) DO UPDATE SET
        email        = COALESCE(build_purchases.email, EXCLUDED.email),
        amount_cents = COALESCE(build_purchases.amount_cents, EXCLUDED.amount_cents),
        currency     = COALESCE(build_purchases.currency, EXCLUDED.currency)`;
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
  try {
    if (fcmConfigured()) {
      const founderEmails = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || founderNotifyEmail() || '')
        .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (founderEmails.length) {
        const body = (price ? price + ' — ' : '') + who
          + (total ? ` · that's ${total} sold 🎉` : ' 🎉');
        const payload = { title: '🚀 Build Your Own App sold!', body, url: '/slickchart', tag: 'build-sale:' + sid };
        let pushed = 0;
        for (const fe of founderEmails) {
          try {
            const provs = await q`SELECT id FROM providers WHERE lower(email) = ${fe}`;
            for (const pr of (provs || [])) { try { pushed += (await sendNativeToProvider(pr.id, payload)) || 0; } catch (e) {} }
          } catch (e) {}
        }
        console.log('[build-sales] sale push: founders=' + founderEmails.length + ' devices=' + pushed + ' session=' + sid);
      }
    }
  } catch (e) { console.error('[build-sales] founder push failed:', e && e.message || e); }
}

// ── The buyer's own access email ─────────────────────────────────────────────────────────────────
// Lives here rather than in build-unlock.js because two paths send it: the success redirect right
// after paying, and /api/build-access when someone asks for it again because they lost the first one.
export function accessEmailBody(sessionId, links) {
  const back = trustedOrigin() + '/build/unlocked?session_id=' + encodeURIComponent(sessionId);
  return {
    subject: 'Your Build Your Own App access',
    text: 'You\'re in. Here\'s everything:\n\n'
      + 'Start here (watch this first): ' + links.videoUrl + '\n\n'
      + 'The system itself: ' + links.artifactUrl + '\n'
      + '(Pin it in Claude as soon as it opens - it then lives in your sidebar.)\n\n'
      + 'Using the Claude desktop app? Pinning is saved to your Claude account, not to a browser, so\n'
      + 'pin it once and it is in your sidebar there too. Then pick one place and stay in it - your\n'
      + 'ticks save where you tick them.\n\n'
      + 'Keep this email - it\'s your way back in. You can also reopen your access page any time:\n'
      + back + '\n\n'
      + 'Lost this email? Get it sent again at ' + trustedOrigin() + '/build/access\n\n- Ashley',
    html: '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#1a2a28;">'
      + '<p>You’re in.</p>'
      + '<p><b>1. Start here</b> — watch this first:<br><a href="' + links.videoUrl + '">' + links.videoUrl + '</a></p>'
      + '<p><b>2. The system itself</b>:<br><a href="' + links.artifactUrl + '">' + links.artifactUrl + '</a><br>'
      + '<span style="color:#5D5149;font-size:13.5px;">Pin it in Claude as soon as it opens — it then lives in your sidebar.</span></p>'
      + '<p style="font-size:13.5px;color:#5D5149;"><b style="color:#1a2a28;">Using the Claude desktop app?</b> Pinning is saved to your Claude account, not to a browser — pin it once and it’s in your sidebar there too. Then pick one place and stay in it: your ticks save where you tick them.</p>'
      + '<p>Keep this email — it’s your way back in. You can also <a href="' + back + '">reopen your access page</a> any time.</p>'
      + '<p style="font-size:13.5px;color:#5D5149;">Lost this email? <a href="' + trustedOrigin() + '/build/access">Have it sent again</a>.</p>'
      + '<p>— Ashley</p></div>'
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
