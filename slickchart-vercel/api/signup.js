// POST /api/signup  { email, password, name }
// Creates a provider account (unverified), emails a verification link, and
// returns a session token so they can start using the app right away.
import { sql, ensureProvidersTable, dbEnabled, hasActiveSubscription } from '../lib/db.js';
import { signToken, hashPassword, makeToken, createSession } from '../lib/auth.js';
import { sendEmail, appOrigin, addToAudience, welcomeEmailHtml, welcomeEmailText } from '../lib/email.js';
import crypto from 'crypto';

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
    const link = appOrigin(req) + '/slickchart?verify=' + vtoken;
    try {
      await sendEmail({
        to: email,
        subject: `Welcome to SlickChart, ${name ? name.split(' ')[0] : 'friend'} — let's build this together`,
        text: welcomeEmailText({ name, link }),
        html: welcomeEmailHtml({ name, link })
      });
    } catch (e) { console.error('[signup] welcome email failed:', e && e.message || e); /* don't block signup on email failure */ }

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
