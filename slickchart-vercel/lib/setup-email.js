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
import { hasReadyAccount, setupLinkForEmail } from './account-setup.js';

function founderEmails() {
  return String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SETUP_DAYS = 14;

export function setupLink(email) {
  return trustedOrigin() + '/slickchart?signup=1&email=' + encodeURIComponent(email);
}

// Since 2026-11-23 paying MAKES the account (lib/account-setup.js), so this is the "Get set up" email:
// one button that opens a pick-a-password screen and signs her in. `direct` is false only for the old
// fallback link (Create account with her email filled in), used if the account could not be made.
export function setupEmailHtml(email, link, direct = true) {
  const btn = direct ? 'Get set up' : 'Create your account';
  const body = direct
    ? 'Thank you so much for joining! Your SlickChart account is ready. Tap the button, pick a password, and you are in. It takes about a minute.'
    : 'Thank you so much for joining! Your subscription is all set. There is one quick step left: making your account, so you have something to sign in to.';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:12px;color:#1a2a28;">
    <div style="font-size:21px;font-weight:700;margin-bottom:10px;">Welcome to SlickChart!</div>
    <p style="font-size:15px;line-height:1.7;margin:0 0 18px;">${body}</p>
    <p style="margin:0 0 20px;"><a href="${link}" style="display:inline-block;background:#2bc7ac;color:#04231d;text-decoration:none;font-weight:700;font-size:16px;padding:14px 24px;border-radius:999px;">${btn}</a></p>
    ${direct
      ? `<p style="font-size:15px;line-height:1.7;margin:0 0 14px;">After that you sign in with <strong>${escHtml(email)}</strong> and the password you picked, on your phone or computer.</p>
    <p style="font-size:13px;line-height:1.6;margin:0 0 14px;color:#6a7a78;">This button works for ${SETUP_DAYS} days. If it has stopped working, go to slickchart.app, tap Sign in, then "Forgot password", and you will get a new one.</p>`
      : `<p style="font-size:15px;line-height:1.7;margin:0 0 14px;"><strong>Use this same email address</strong> (${escHtml(email)}) when you sign up, so it connects to your subscription. You will not be charged again.</p>`}
    <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">If anything at all goes wrong, just reply to this email and I will sort it out myself.</p>
    <p style="font-size:15px;line-height:1.7;margin:22px 0 0;">Ashley<br><span style="color:#7a8a88;font-size:13px;">SlickChart</span></p>
  </div>`;
}
export function setupEmailText(email, link, direct = true) {
  if (direct) return `Welcome to SlickChart!

Thank you so much for joining! Your SlickChart account is ready. Tap the link, pick a password, and you are in. It takes about a minute.

Get set up: ${link}

After that you sign in with ${email} and the password you picked, on your phone or computer.

This link works for ${SETUP_DAYS} days. If it has stopped working, go to slickchart.app, tap Sign in, then "Forgot password", and you will get a new one.

If anything goes wrong, just reply to this email and I will sort it out myself.

Ashley
SlickChart
`;
  return `Welcome to SlickChart!

Thank you so much for joining! Your subscription is all set. There is one quick step left: making your account, so you have something to sign in to.

Create your account (about a minute): ${link}

Use this SAME email address (${email}) when you sign up, so it connects to your subscription. You will not be charged again.

If anything goes wrong, just reply to this email and I will sort it out myself.

Ashley
SlickChart
`;
}
export const SETUP_SUBJECT = 'Get set up: your SlickChart account is ready';

// The link to put in the email: the direct one-time link when the account exists or can be made, else the
// old Create-account link. Returns { link, direct } or { ready: true } when she already has a real account.
export async function setupEmailLink(q, email, name) {
  let r = null;
  try { r = await setupLinkForEmail(q, email, name); } catch (e) { r = null; }
  if (r && r.ready) return { ready: true };
  if (r && r.link) return { link: r.link, direct: true };
  return { link: setupLink(email), direct: false };
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
    if (await hasReadyAccount(q, email)) return 'has-account';
    await ensureNurtureTables(q);
    if ((await q`SELECT 1 FROM nurture_optout WHERE email = ${email}`).length) return 'unsubscribed';
    const recent = await q`SELECT 1 FROM nurture_sends WHERE email = ${email} AND seq = 'setup-resend' AND sent_at > now() - interval '1 hour' LIMIT 1`;
    if (recent.length) return 'already';
    const n = await q`SELECT count(*)::int AS n FROM nurture_sends WHERE email = ${email} AND seq = 'setup-resend'`;
    const step = ((n[0] && n[0].n) || 0) + 1;
    const claimed = (await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'setup-resend', ${step})
      ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`).length > 0;
    if (!claimed) return 'already';
    const L = await setupEmailLink(q, email);
    if (L.ready) { try { await q`DELETE FROM nurture_sends WHERE email = ${email} AND seq = 'setup-resend' AND step = ${step}`; } catch (e2) {} return 'has-account'; }
    try {
      await sendEmail({ to: email, subject: SETUP_SUBJECT,
        html: setupEmailHtml(email, L.link, L.direct), text: setupEmailText(email, L.link, L.direct) });
      if (L.direct) { try { await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'setup-v2', 0) ON CONFLICT (email, seq, step) DO NOTHING`; } catch (e2) {} }
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
export async function sendSetupEmailNow(q, rawEmail, name) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 1) return 'no-email';
  try {
    if (founderEmails().includes(email)) return 'founder';
    if (await hasReadyAccount(q, email)) return 'has-account';
    await ensureNurtureTables(q);
    const opted = await q`SELECT 1 FROM nurture_optout WHERE email = ${email}`;
    if (opted.length) return 'unsubscribed';
    const claimed = (await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'setup', 0)
      ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`).length > 0;
    if (!claimed) return 'already';
    const L = await setupEmailLink(q, email, name);
    if (L.ready) { try { await q`DELETE FROM nurture_sends WHERE email = ${email} AND seq = 'setup' AND step = 0`; } catch (e2) {} return 'has-account'; }
    try {
      await sendEmail({ to: email, subject: SETUP_SUBJECT,
        html: setupEmailHtml(email, L.link, L.direct), text: setupEmailText(email, L.link, L.direct) });
      // She has had the direct-link email, so the one-time catch-up in cron-orphan-checkout skips her.
      if (L.direct) { try { await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'setup-v2', 0) ON CONFLICT (email, seq, step) DO NOTHING`; } catch (e2) {} }
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
