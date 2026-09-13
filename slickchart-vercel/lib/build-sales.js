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
import { sql, dbEnabled, ensureBuildPurchasesTable } from './db.js';
import { sendEmail } from './email.js';
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
 * @param {{sessionId:string, email?:string, amountCents?:number|null, currency?:string|null}} sale
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
