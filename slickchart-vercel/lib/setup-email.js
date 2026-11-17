// The "create your account" email a new provider gets RIGHT AFTER paying (2026-11-17).
//
// Paying and creating the account are two separate steps (SESSION-HANDOFF §2m). Until now nothing was
// emailed between them: the only setup email was the paid-but-no-account rescue in
// api/cron-orphan-checkout.js, which waits her "hours after paying" setting (3 h by default) on
// purpose. So a provider who paid and closed the page had no email telling her how to get in, and
// on 2026-11-17 a new provider told Ashley she "didn't get a setup email" 20 minutes after paying.
//
// This one goes from the Stripe webhook the moment checkout completes, only when no provider account
// with that email exists yet, once ever per address (nurture_sends seq 'setup'), never to a founder
// and never to someone who unsubscribed (same rule as the rescue email). The rescue email still goes
// after her wait if the account is still missing, as the reminder. Never throws.
import { sendEmail, trustedOrigin } from './email.js';
import { ensureNurtureTables } from './nurture.js';

function founderEmails() {
  return String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function setupLink(email) {
  return trustedOrigin() + '/slickchart?signup=1&email=' + encodeURIComponent(email);
}

export function setupEmailHtml(email, link) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:12px;color:#1a2a28;">
    <div style="font-size:21px;font-weight:700;margin-bottom:10px;">Welcome to SlickChart!</div>
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">Thank you so much for joining! Your subscription is all set. There is one quick step left: making your account, so you have something to sign in to.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">It takes about a minute:</p>
    <p style="margin:0 0 20px;"><a href="${link}" style="display:inline-block;background:#2bc7ac;color:#04231d;text-decoration:none;font-weight:700;font-size:15px;padding:13px 20px;border-radius:999px;">Create your account</a></p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;"><strong>Use this same email address</strong> (${escHtml(email)}) when you sign up, so it connects to your subscription. You will not be charged again.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">Already made it? Then you are all set, and you can ignore this.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">If anything at all goes wrong, just reply to this email and I will sort it out myself.</p>
    <p style="font-size:15px;line-height:1.7;margin:22px 0 0;">Ashley<br><span style="color:#7a8a88;font-size:13px;">SlickChart</span></p>
  </div>`;
}
export function setupEmailText(email, link) {
  return `Welcome to SlickChart!

Thank you so much for joining! Your subscription is all set. There is one quick step left: making your account, so you have something to sign in to.

Create your account (about a minute): ${link}

Use this SAME email address (${email}) when you sign up, so it connects to your subscription. You will not be charged again.

Already made it? Then you are all set, and you can ignore this.

If anything goes wrong, just reply to this email and I will sort it out myself.

Ashley
SlickChart
`;
}

// Founder "Send setup email again" (Admin tools -> Paid but no account, api/admin/orphans.js). Sends
// the same email to someone who STILL has no account, at most once an hour per address so a double
// tap cannot send two, logged in nurture_sends seq 'setup-resend'. Same rules: never a founder, never
// someone with an account, never an unsubscribed address. Returns the same words as below.
export async function resendSetupEmail(q, rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 1) return 'no-email';
  try {
    if (founderEmails().includes(email)) return 'founder';
    if ((await q`SELECT 1 FROM providers WHERE lower(email) = ${email} LIMIT 1`).length) return 'has-account';
    await ensureNurtureTables(q);
    if ((await q`SELECT 1 FROM nurture_optout WHERE email = ${email}`).length) return 'unsubscribed';
    const recent = await q`SELECT 1 FROM nurture_sends WHERE email = ${email} AND seq = 'setup-resend' AND sent_at > now() - interval '1 hour' LIMIT 1`;
    if (recent.length) return 'already';
    const n = await q`SELECT count(*)::int AS n FROM nurture_sends WHERE email = ${email} AND seq = 'setup-resend'`;
    const step = ((n[0] && n[0].n) || 0) + 1;
    const claimed = (await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'setup-resend', ${step})
      ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`).length > 0;
    if (!claimed) return 'already';
    const link = setupLink(email);
    try {
      await sendEmail({ to: email, subject: 'Welcome to SlickChart: create your account',
        html: setupEmailHtml(email, link), text: setupEmailText(email, link) });
      return 'sent';
    } catch (e) {
      try { await q`DELETE FROM nurture_sends WHERE email = ${email} AND seq = 'setup-resend' AND step = ${step}`; } catch (e2) {}
      console.error('[setup-email] resend failed for ' + email + ':', (e && e.message) || e);
      return 'failed';
    }
  } catch (e) {
    console.error('[setup-email] resend failed:', (e && e.message) || e);
    return 'failed';
  }
}

// Returns 'sent' | 'has-account' | 'founder' | 'unsubscribed' | 'already' | 'failed' | 'no-email'.
export async function sendSetupEmailNow(q, rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 1) return 'no-email';
  try {
    if (founderEmails().includes(email)) return 'founder';
    const acct = await q`SELECT 1 FROM providers WHERE lower(email) = ${email} LIMIT 1`;
    if (acct.length) return 'has-account';
    await ensureNurtureTables(q);
    const opted = await q`SELECT 1 FROM nurture_optout WHERE email = ${email}`;
    if (opted.length) return 'unsubscribed';
    const claimed = (await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'setup', 0)
      ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`).length > 0;
    if (!claimed) return 'already';
    const link = setupLink(email);
    try {
      await sendEmail({ to: email, subject: 'Welcome to SlickChart: create your account',
        html: setupEmailHtml(email, link), text: setupEmailText(email, link) });
      return 'sent';
    } catch (e) {
      // Release the claim; the hourly rescue (cron-orphan-checkout) is the safety net after her wait.
      try { await q`DELETE FROM nurture_sends WHERE email = ${email} AND seq = 'setup' AND step = 0`; } catch (e2) {}
      console.error('[setup-email] send failed for ' + email + ':', (e && e.message) || e);
      return 'failed';
    }
  } catch (e) {
    console.error('[setup-email] failed:', (e && e.message) || e);
    return 'failed';
  }
}
