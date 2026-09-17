// Scheduled PAID-BUT-NO-ACCOUNT rescue — invoked by Vercel Cron (see vercel.json).
//
// Paying and creating the account are two separate steps: Stripe checkout writes a `subscriptions`
// row, and the person then has to come back and create a provider account with the SAME email. If
// they don't finish that second step, they are charged and have no way in, and NOTHING anywhere
// notices. The only signal is the customer emailing to say their password doesn't work — which is
// exactly how this was found (a provider paid, never got the welcome email, and couldn't log in;
// the welcome email only exists inside signup, so its absence meant signup never ran).
//
// Two steps, each claimed once in nurture_sends:
//   1. After GRACE_HOURS  — email THEM a "finish setting up your account" nudge.
//   2. After ESCALATE_HOURS — tell Ashley, so a real person can reach out before they give up.
//
// Deliberately conservative about who counts as stranded:
//   • Only rows with a real stripe_subscription_id. A Build Your Own App roadmap sale used to write
//     a subscriptions row with NO subscription id, and those buyers must never be told to finish
//     setting up a SlickChart account they never bought.
//   • Only active/trialing.
//   • Never anyone who unsubscribed, and never a founder address.
import { dbEnabled, sql, ensureProvidersTable } from '../lib/db.js';
import { sendEmail, trustedOrigin } from '../lib/email.js';
import { ensureNurtureTables } from '../lib/nurture.js';
import { pushFounders } from '../lib/fcm.js';

// Long enough that nobody mid-signup is emailed, short enough to matter the same day.
const GRACE_HOURS = 3;
// If they still have no account after this, it needs a person, not another automated email.
const ESCALATE_HOURS = 48;

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;                                   // fail closed — never publicly invokable
  const h = req.headers['authorization'] || '';
  if (h === 'Bearer ' + secret) return true;                   // Vercel Cron sends this
  if ((req.query && req.query.key) === secret) return true;    // manual test trigger
  return false;
}

function founderEmails() {
  return String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || process.env.FOUNDER_NOTIFY_EMAIL || 'botanicalaestheticsbyashley@gmail.com')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rescueHtml(link) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:12px;color:#1a2a28;">
    <div style="font-size:21px;font-weight:700;margin-bottom:10px;">One quick step left</div>
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">Your SlickChart subscription is active — thank you! But it looks like your account never got created, so there is nothing to log into yet. That is our fault, not yours.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">It takes about a minute:</p>
    <p style="margin:0 0 20px;"><a href="${link}" style="display:inline-block;background:#2bc7ac;color:#04231d;text-decoration:none;font-weight:700;font-size:15px;padding:13px 20px;border-radius:999px;">Create your account</a></p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;"><strong>Use this same email address</strong> when you sign up, so it connects to the subscription you already paid for. You will not be charged again.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">If anything at all goes wrong, just reply to this email and I will sort it out myself.</p>
    <p style="font-size:15px;line-height:1.7;margin:22px 0 0;">Ashley<br><span style="color:#7a8a88;font-size:13px;">SlickChart</span></p>
  </div>`;
}
function rescueText(link) {
  return `One quick step left.

Your SlickChart subscription is active — thank you! But it looks like your account never got created, so there is nothing to log into yet. That is our fault, not yours.

Create your account (about a minute): ${link}

Use this SAME email address when you sign up, so it connects to the subscription you already paid for. You will not be charged again.

If anything goes wrong, just reply to this email and I will sort it out myself.

Ashley
SlickChart
`;
}

export default async function handler(req, res) {
  if (!authorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }

  const out = { stranded: 0, emailed: 0, escalated: 0 };
  try {
    await ensureProvidersTable();
    const q = sql();
    await ensureNurtureTables(q);
    const founders = founderEmails();

    // Paid, real subscription, old enough to be sure they are not mid-signup, and NO provider account
    // with that email. lower() on both sides because signup stores the address lowercased.
    const rows = await q`
      SELECT s.email, s.updated_at
        FROM subscriptions s
       WHERE s.status IN ('active','trialing')
         AND s.stripe_subscription_id IS NOT NULL
         AND s.updated_at < now() - (${GRACE_HOURS} * interval '1 hour')
         AND NOT EXISTS (SELECT 1 FROM providers p WHERE lower(p.email) = lower(s.email))
       ORDER BY s.updated_at ASC
       LIMIT 50`;

    for (const r of (rows || [])) {
      const email = String(r.email || '').trim().toLowerCase();
      if (!email || founders.includes(email)) continue;
      out.stranded++;

      // Someone who asked not to be emailed stays not emailed, even for this.
      let opted = [];
      try { opted = await q`SELECT email FROM nurture_optout WHERE email = ${email}`; } catch (e) {}
      const mayEmail = !opted.length;

      // 1) Nudge them. Claimed once ever, so a later run can't re-send.
      if (mayEmail) {
        const claimed = (await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'orphan', 0)
          ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`).length > 0;
        if (claimed) {
          const link = trustedOrigin() + '/slickchart?signup=1&email=' + encodeURIComponent(email);
          try {
            await sendEmail({ to: email, subject: 'Your SlickChart account is one step from ready',
              html: rescueHtml(link), text: rescueText(link) });
            out.emailed++;
          } catch (e) {
            // Release the claim so the next run retries rather than leaving them stranded silently.
            try { await q`DELETE FROM nurture_sends WHERE email = ${email} AND seq = 'orphan' AND step = 0`; } catch (e2) {}
            console.error('[orphan-checkout] rescue email failed for ' + email + ':', (e && e.message) || e);
          }
        }
      }

      // 2) Still nothing after two days: hand it to a person.
      const ageMs = Date.now() - new Date(r.updated_at).getTime();
      if (ageMs >= ESCALATE_HOURS * 3600 * 1000) {
        const claimed = (await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'orphan', 1)
          ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`).length > 0;
        if (claimed) {
          out.escalated++;
          const days = Math.floor(ageMs / 86400000);
          try {
            await pushFounders({
              title: '⚠️ A paying provider can’t get in',
              body: email + ' paid ' + days + ' day' + (days === 1 ? '' : 's') + ' ago and still has no account',
              url: '/slickchart', tag: 'orphan:' + email
            });
          } catch (e) {}
          try {
            await sendEmail({
              to: founders[0],
              subject: '⚠️ Paid but no account: ' + email,
              text: email + ' has an active subscription from ' + days + ' day(s) ago but never created a SlickChart account.\n\n'
                + 'They have been emailed a link to finish signing up' + (mayEmail ? '' : ' — EXCEPT they are unsubscribed, so they were NOT emailed')
                + '. If they still do not appear, reach out personally.\n',
              html: '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:8px;">'
                + '<div style="font-size:20px;margin-bottom:8px;">⚠️ Paid but no account</div>'
                + '<div style="font-size:14px;color:#333;line-height:1.8;"><b>' + escHtml(email) + '</b> has an active subscription from <b>'
                + days + ' day(s)</b> ago but never created an account.<br>'
                + (mayEmail ? 'They have been emailed a link to finish signing up.' : '<b style="color:#a36">They are unsubscribed, so no email was sent.</b>')
                + '<br>If they still do not appear, reach out personally.</div></div>'
            });
          } catch (e) { console.error('[orphan-checkout] founder alert failed:', (e && e.message) || e); }
        }
      }
    }

    console.log('[orphan-checkout] stranded=' + out.stranded + ' emailed=' + out.emailed + ' escalated=' + out.escalated);
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    console.error('[orphan-checkout] failed:', (e && e.stack) || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
