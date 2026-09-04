// POST /api/stripe-webhook — Stripe calls this directly whenever a checkout
// completes or a subscription changes. This is the ONLY place that ever marks
// an email as "paid" — the app itself never decides that on its own.
//
// Setup required in Stripe's dashboard (Developers → Webhooks → Add endpoint):
//   URL:    https://slickchart.app/api/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted
// Renewals arrive as customer.subscription.updated too, so they keep the subscription row fresh but
// are deliberately SILENT — the founder is pinged once per provider, on their first payment only.
// Copy the "Signing secret" it gives you into Vercel as STRIPE_WEBHOOK_SECRET.
//
// Vercel-specific: signature verification needs the exact raw request bytes,
// so automatic body parsing is turned off below and the body is read by hand.
import crypto from 'crypto';
import { sql, ensureProvidersTable } from '../lib/db.js';
import { sendEmail } from '../lib/email.js';
import { sendNativeToProvider, fcmConfigured } from '../lib/fcm.js';
import { ensureClientTables, claimReminder } from '../lib/clients.js';

// The owner's inbox for real-time milestone pings. Defaults to the built-in owner so a PAID signup is
// never missed even before any env is configured; FOUNDER_NOTIFY_EMAIL / FOUNDER_EMAILS override it.
function founderNotifyEmail() {
  return String(process.env.FOUNDER_NOTIFY_EMAIL || process.env.FOUNDER_EMAILS || 'botanicalaestheticsbyashley@gmail.com').split(',')[0].trim();
}
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Reject a signature whose timestamp is older than this (seconds). Matches Stripe's own
// default tolerance and blocks replay of a captured-but-stale signed payload.
const SIG_TOLERANCE_SEC = 300;
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  sigHeader.split(',').forEach((p) => { const [k, v] = p.split('='); parts[k] = v; });
  if (!parts.t || !parts.v1) return false;
  // Replay guard: the timestamp must be recent (and a valid number).
  const ts = parseInt(parts.t, 10);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > SIG_TOLERANCE_SEC) return false;
  const signedPayload = parts.t + '.' + rawBody;
  const computed = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(parts.v1));
  } catch (e) { return false; }
}

// Stripe subscription events reference the customer by ID, not email — this
// looks the email up via Stripe's own API when we don't already have it stored.
async function lookupCustomerEmail(customerId) {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key || !customerId) return '';
  try {
    const r = await fetch('https://api.stripe.com/v1/customers/' + customerId, {
      headers: { Authorization: 'Bearer ' + key }
    });
    if (!r.ok) return '';
    const j = await r.json();
    return (j && j.email || '').toLowerCase();
  } catch (e) { return ''; }
}

// Claim the right to announce this provider, exactly once, ever. A monthly renewal arrives as the very
// same `customer.subscription.updated` with status=active as the first payment, so the claim — not the
// event — is what makes the ping mean "new". Stamping subscriptions.paid_notified_at in a single
// conditional UPDATE is atomic, permanent, and lives on the row it describes, so concurrent webhook
// deliveries and twelve months of renewals all collapse to one announcement.
// Returns true only for the caller that actually won the claim.
async function claimPaidNotify(q, em) {
  const rows = await q`UPDATE subscriptions SET paid_notified_at = now()
    WHERE lower(email) = ${em} AND paid_notified_at IS NULL RETURNING email`;
  return rows.length > 0;
}

// Ping the founder that a NEW provider is paying — email + native push to their phone — exactly ONCE
// per provider, no matter WHICH Stripe event first marks them active (checkout.session.completed OR a
// customer.subscription.updated that flips to 'active'). The old code fired this only inside the
// checkout branch, gated on a read-then-write `wasNew` flag; when Stripe delivered the subscription
// event first / out of order, the in-app toast still popped (the app's poller keys off
// subscriptions.status='active') but the email + push were silently skipped.
// Best-effort throughout: Stripe still needs its 200, so nothing here may throw.
async function notifyFounderPaid(q, email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return;
  // Once-only claim. This used to run against reminder_log and, when the claim itself errored, notify
  // anyway on the theory that a duplicate beat a missed ping — but with renewals flowing through the
  // same branch, "notify anyway" meant every provider re-announced every month, forever. So the claim
  // is now the subscription row itself, and a failure here stays SILENT (fall back to the old
  // reminder_log claim first, and only give up if that's broken too). A rare missed ping is recoverable;
  // a monthly false alarm per provider is not.
  let claimed = false;
  try {
    claimed = await claimPaidNotify(q, em);
  } catch (e) {
    console.error('[stripe-webhook] paid-notify claim failed, trying reminder_log:', e && e.message || e);
    try {
      await ensureClientTables();
      claimed = await claimReminder('founder', 'paidnotify:' + em);
    } catch (e2) {
      console.error('[stripe-webhook] paid-notify fallback claim failed, staying silent:', e2 && e2.message || e2);
      return;
    }
  }
  if (!claimed) return;   // already announced — a renewal, a retry, or a duplicate delivery

  let name = '';
  try { const p = await q`SELECT name FROM providers WHERE lower(email) = ${em}`; name = (p[0] && p[0].name) || ''; } catch (e) {}

  // ── Founder email ──────────────────────────────────────────────────────────
  try {
    const to = founderNotifyEmail();
    if (to) await sendEmail({
      to,
      subject: `💰 New PAID SlickChart provider: ${name || em}`,
      text: `A provider just started a paid subscription.\n\nName: ${name || '(not given)'}\nEmail: ${em}\n\nThat's real revenue — congratulations! 🎉`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:8px;"><div style="font-size:22px;margin-bottom:6px;">💰 New PAID provider</div><div style="font-size:14px;color:#333;line-height:1.9;"><b>Name:</b> ${escHtml(name || '(not given)')}<br><b>Email:</b> ${escHtml(em)}</div><div style="font-size:13px;color:#2a7;margin-top:10px;">That's real revenue — congratulations! 🎉</div></div>`
    });
  } catch (e) { console.error('[stripe-webhook] founder paid-notify email failed:', e && e.message || e); }

  // ── Native push to the founder's phone(s) ───────────────────────────────────
  try {
    if (fcmConfigured()) {
      const founderEmails = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || founderNotifyEmail() || '')
        .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (founderEmails.length) {
        let paidTotal = 0;
        try { const c = await q`SELECT count(*)::int AS n FROM subscriptions WHERE status = 'active'`; paidTotal = (c[0] && c[0].n) || 0; } catch (e) {}
        const pushBody = (name || em) + ' just signed up' + (paidTotal ? ` — that's ${paidTotal} paying providers now 🎉` : ' 🎉');
        const pushPayload = { title: '💰 New paid provider!', body: pushBody, url: '/slickchart', tag: 'paid-signup:' + em };
        let pushed = 0;
        for (const fe of founderEmails) {
          try {
            const provs = await q`SELECT id FROM providers WHERE lower(email) = ${fe}`;
            for (const pr of (provs || [])) { try { pushed += (await sendNativeToProvider(pr.id, pushPayload)) || 0; } catch (e) {} }
          } catch (e) {}
        }
        console.log('[stripe-webhook] paid-signup push: founders=' + founderEmails.length + ' devices=' + pushed + ' for=' + em);
      }
    }
  } catch (e) { console.error('[stripe-webhook] founder paid-push failed:', e && e.message || e); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) { res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' }); return; }

  const rawBody = await readRawBody(req);
  const sig = req.headers['stripe-signature'];
  if (!verifyStripeSignature(rawBody, sig, secret)) {
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  let event;
  try { event = JSON.parse(rawBody); } catch (e) { res.status(400).json({ error: 'Bad payload' }); return; }

  try {
    await ensureProvidersTable();
    const q = sql();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = ((session.customer_details && session.customer_details.email) || session.customer_email || '').trim().toLowerCase();
      const customerId = session.customer || null;
      const subscriptionId = session.subscription || null;
      if (email) {
        await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, updated_at)
          VALUES (${email}, ${customerId}, ${subscriptionId}, 'active', now())
          ON CONFLICT (email) DO UPDATE SET
            stripe_customer_id=EXCLUDED.stripe_customer_id,
            stripe_subscription_id=EXCLUDED.stripe_subscription_id,
            status='active', updated_at=now()`;
        // Founder ping (email + native push), deduped once-per-provider. Fires here AND from the
        // subscription-activated branch below, so whichever event Stripe delivers first wins and the
        // push can't be lost to event ordering. Never blocks the webhook's 200.
        await notifyFounderPaid(q, email);
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const customerId = sub.customer;
      const rawStatus = sub.status || 'canceled';
      const status = (rawStatus === 'active' || rawStatus === 'trialing') ? 'active'
        : (rawStatus === 'past_due' || rawStatus === 'unpaid') ? 'past_due' : 'canceled';
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const planAmount = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price
        ? sub.items.data[0].price.unit_amount : null;
      const existing = await q`SELECT email FROM subscriptions WHERE stripe_customer_id=${customerId}`;
      let subEmail = (existing[0] && existing[0].email) || '';
      if (existing[0]) {
        await q`UPDATE subscriptions SET status=${status}, stripe_subscription_id=${sub.id},
          current_period_end=${periodEnd}, plan_amount=${planAmount}, updated_at=now()
          WHERE stripe_customer_id=${customerId}`;
      } else {
        subEmail = await lookupCustomerEmail(customerId);
        if (subEmail) {
          await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, current_period_end, plan_amount, updated_at)
            VALUES (${subEmail}, ${customerId}, ${sub.id}, ${status}, ${periodEnd}, ${planAmount}, now())
            ON CONFLICT (email) DO UPDATE SET status=EXCLUDED.status, stripe_subscription_id=EXCLUDED.stripe_subscription_id,
              current_period_end=EXCLUDED.current_period_end, plan_amount=EXCLUDED.plan_amount, updated_at=now()`;
        }
      }
      // If THIS event is the one that made the provider active, ping the founder — deduped once-per-
      // provider, so it fires exactly once whether the checkout event or this one lands first.
      if (status === 'active' && subEmail) await notifyFounderPaid(q, subEmail);
    }
    res.status(200).json({ received: true });
  } catch (e) {
    console.error('[stripe-webhook]', e && e.message || e);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
