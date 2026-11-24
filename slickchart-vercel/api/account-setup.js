// /api/account-setup — the "Get set up" screen for a provider who just paid (lib/account-setup.js).
//
//   GET  ?token=<setup token>                 -> { ok, email, name }  (to draw the screen)
//   POST { token, password, name? }           -> { token, name, email, verified }  (signed in)
//   POST { sessionId: <Stripe checkout id> }  -> { setupToken, email, name }  when the account is waiting,
//                                                { hasAccount: true, email }   when she already has one,
//                                                202 { pending: true }         when Stripe is not done yet
//
// Identity comes only from what she holds: a one-time token emailed to the address she paid with, or the
// checkout session id Stripe sent her back with (checked against Stripe: complete, a subscription, recent).
// Neither can reach an account that has a password already: a waiting (`needs_setup`) account has never
// been signed in to and holds no data. Failures are rate-limited per IP.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { signToken, hashPassword, makeToken, createSession, tooManyAttemptsByIp, recordAttempt } from '../lib/auth.js';
import { sendEmail, trustedOrigin, welcomeEmailHtml, welcomeEmailText } from '../lib/email.js';
import { readSetupToken, paidCheckoutSession, ensurePaidAccount, issueSetupToken } from '../lib/account-setup.js';

function clientIp(req) {
  return String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim();
}
const BAD_LINK = 'This set-up link has expired or was already used. Tap Sign in, then "Forgot password", and we will email you a new one.';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) { res.status(500).json({ error: 'Login is not configured.' }); return; }
  const ip = clientIp(req);
  try {
    await ensureProvidersTable();
    const q = sql();
    if (await tooManyAttemptsByIp(q, ip)) { res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' }); return; }
    const fail = async () => { try { await recordAttempt(q, 'setup-link', ip); } catch (e) {} };

    if (req.method === 'GET') {
      const t = await readSetupToken(q, (req.query && req.query.token) || '');
      if (!t || !t.needsSetup) { await fail(); res.status(400).json({ error: BAD_LINK, email: t ? t.email : undefined, ready: !!(t && !t.needsSetup) }); return; }
      res.status(200).json({ ok: true, email: t.email, name: t.name });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const b = req.body || {};

    // Back from Stripe: who paid, from Stripe itself.
    if (b.sessionId) {
      const paid = await paidCheckoutSession(b.sessionId);
      if (!paid) { await fail(); res.status(202).json({ pending: true }); return; }
      // The webhook normally got here first; if it has not, record the subscription the same way so
      // Sign in's payment check sees it (never overwrites a row the webhook wrote).
      try {
        await q`INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, updated_at)
          VALUES (${paid.email}, ${paid.customerId}, ${paid.subscriptionId}, 'active', now()) ON CONFLICT (email) DO NOTHING`;
      } catch (e) { /* the webhook writes it */ }
      const acct = await ensurePaidAccount(q, paid.email, paid.name);
      if (!acct) { res.status(202).json({ pending: true }); return; }
      if (!acct.needsSetup) { res.status(200).json({ hasAccount: true, email: acct.email }); return; }
      const setupToken = await issueSetupToken(q, acct.id, 'stripe');
      res.status(200).json({ setupToken, email: acct.email, name: paid.name || '' });
      return;
    }

    // Pick a password: the account becomes a normal one and she is signed in.
    const password = String(b.password || '');
    const t = await readSetupToken(q, b.token || '');
    if (!t) { await fail(); res.status(400).json({ error: BAD_LINK }); return; }
    if (!t.needsSetup) { res.status(409).json({ error: 'Your account is already set up. Sign in with your email and password.', email: t.email }); return; }
    if (password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }
    const name = String(b.name || '').trim().slice(0, 120);
    const viaEmail = t.via === 'email';   // the link went to her inbox, so the address is proved hers
    const done = await q`UPDATE providers SET pass_hash = ${hashPassword(password)}, needs_setup = false,
        verified = (coalesce(verified, false) OR ${viaEmail}), name = CASE WHEN ${name} <> '' THEN ${name} ELSE name END
      WHERE id = ${t.providerId} AND coalesce(needs_setup, false) RETURNING id, email, name, verified`;
    if (!done.length) { res.status(409).json({ error: 'Your account is already set up. Sign in with your email and password.', email: t.email }); return; }
    try { await q`DELETE FROM auth_tokens WHERE provider_id = ${t.providerId} AND kind = 'setup'`; } catch (e) {}
    const p = done[0];

    // The usual welcome email. It verifies the address only when that is still needed (came from Stripe).
    try {
      let link = trustedOrigin() + '/slickchart';
      if (!p.verified) {
        const vtoken = makeToken();
        await q`INSERT INTO auth_tokens (token, provider_id, kind, expires_at) VALUES (${vtoken}, ${p.id}, 'verify', now() + interval '24 hours')`;
        link = trustedOrigin() + '/slickchart?verify=' + vtoken;
      }
      await sendEmail({ to: p.email, subject: `Welcome to SlickChart, ${p.name ? String(p.name).split(' ')[0] : 'friend'} — let's build this together`,
        text: welcomeEmailText({ name: p.name || '', link }), html: welcomeEmailHtml({ name: p.name || '', link }) });
    } catch (e) { console.error('[account-setup] welcome email failed:', (e && e.message) || e); }

    const token = signToken({ u: p.id, e: p.email, sid: await createSession(q, p.id, req) }, secret);
    res.status(200).json({ token, name: p.name || '', email: p.email, verified: !!p.verified });
  } catch (e) {
    console.error('[account-setup] failed:', (e && e.stack) || e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
