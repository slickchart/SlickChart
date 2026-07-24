// POST /api/signup  { email, password, name }
// Creates a provider account (unverified), emails a verification link, and
// returns a session token so they can start using the app right away.
import { sql, ensureProvidersTable, dbEnabled, hasActiveSubscription } from '../lib/db.js';
import { signToken, hashPassword, makeToken, createSession } from '../lib/auth.js';
import { sendEmail, trustedOrigin, addToAudience, welcomeEmailHtml, welcomeEmailText } from '../lib/email.js';
import crypto from 'crypto';

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
  if (password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }

  // Payment gate — off by default so this can be deployed and tested safely
  // before it's actually enforced. Set REQUIRE_PAYMENT=true in Vercel once the
  // Stripe webhook is confirmed working.
  if ((process.env.REQUIRE_PAYMENT || '').toLowerCase() === 'true') {
    try {
      const paid = await hasActiveSubscription(email);
      if (!paid) {
        res.status(402).json({
          error: 'This email hasn\u2019t completed checkout yet. Please subscribe first, then come back and create your account with the same email.',
          checkoutUrl: process.env.STRIPE_PAYMENT_LINK || ''
        });
        return;
      }
    } catch (e) { res.status(500).json({ error: 'Could not verify payment status. Please try again.' }); return; }
  }

  try {
    await ensureProvidersTable();
    const q = sql();
    const existing = await q`SELECT id FROM providers WHERE email = ${email}`;
    if (existing.length) { res.status(409).json({ error: 'An account with that email already exists — try logging in.' }); return; }

    const id = 'p_' + crypto.randomBytes(8).toString('hex');
    await q`INSERT INTO providers (id, email, name, pass_hash, verified, marketing_opt_in) VALUES (${id}, ${email}, ${name}, ${hashPassword(password)}, false, ${!!b.optIn})`;
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

    // Founder ping: email whoever is set in FOUNDER_NOTIFY_EMAIL every time a new provider signs up,
    // so the founder knows in real time as beta testers come through. Best-effort — never blocks or
    // fails the signup. Set FOUNDER_NOTIFY_EMAIL in Vercel to turn it on.
    try {
      // Default to the owner's inbox so signup pings work out of the box (no env setup needed) — this is
      // why the first paid provider's signup was missed. FOUNDER_NOTIFY_EMAIL / FOUNDER_EMAILS override it.
      const notifyTo = String(process.env.FOUNDER_NOTIFY_EMAIL || process.env.FOUNDER_EMAILS || 'botanicalaestheticsbyashley@gmail.com').split(',')[0].trim();
      if (notifyTo) {
        let total = 0;
        try { const c = await q`SELECT count(*)::int AS n FROM providers`; total = (c && c[0] && c[0].n) || 0; } catch (e) {}
        const when = new Date().toLocaleString('en-US', { timeZone: process.env.FOUNDER_TZ || 'America/Los_Angeles' });
        const optLine = b.optIn ? 'Yes' : 'No';
        await sendEmail({
          to: notifyTo,
          subject: `🎉 New SlickChart signup: ${name || email}${total ? ` (#${total})` : ''}`,
          text: `A new provider just created a SlickChart account.\n\nName: ${name || '(not given)'}\nEmail: ${email}\nMarketing opt-in: ${optLine}\nSigned up: ${when}\nTotal accounts: ${total}\n`,
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:8px;">
            <div style="font-size:22px;margin-bottom:6px;">🎉 New signup${total ? ` · #${total}` : ''}</div>
            <div style="font-size:14px;color:#333;line-height:1.9;">
              <b>Name:</b> ${escHtml(name || '(not given)')}<br>
              <b>Email:</b> ${escHtml(email)}<br>
              <b>Marketing opt-in:</b> ${optLine}<br>
              <b>Signed up:</b> ${escHtml(when)}<br>
              <b>Total accounts:</b> ${total}
            </div></div>`
        });
      }
    } catch (e) { console.error('[signup] founder notify failed:', e && e.message || e); /* never block signup */ }

    const token = signToken({ u: id, e: email, sid: await createSession(q, id, req) }, secret);
    res.status(200).json({ token, name, email, verified: false });
  } catch (e) {
    // A concurrent signup with the same email (e.g. a double-tapped button) races past the
    // SELECT above and trips the UNIQUE(email) constraint. Surface the friendly 409, not a 500.
    const code = e && (e.code || (e.cause && e.cause.code));
    if (code === '23505' || /duplicate key|unique constraint/i.test(String(e && e.message || ''))) {
      res.status(409).json({ error: 'An account with that email already exists — try logging in.' });
      return;
    }
    console.error('[signup] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' });
  }
}
