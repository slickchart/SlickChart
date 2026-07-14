// POST /api/login  { email, password, totpCode? }  (email omitted => legacy APP_PASSWORD owner)
// Verifies against a provider account, rate-limited (per-email AND per-IP) to stop brute-forcing,
// enforces TOTP 2FA when the account has it enabled, and (when REQUIRE_PAYMENT is on) re-checks the
// subscription at login — not just at signup.
import { signToken, verifyPassword, tooManyAttempts, tooManyAttemptsByIp, recordAttempt, clearAttempts, createSession } from '../lib/auth.js';
import { sql, ensureProvidersTable, dbEnabled, hasActiveSubscription } from '../lib/db.js';
import { verifyToken as verifyTotp } from '../lib/totp.js';

// Trust the platform-set client IP (x-real-ip on Vercel); the leftmost X-Forwarded-For entry is
// client-supplied and spoofable, so only fall back to it when x-real-ip is absent.
function clientIp(req) {
  return String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) { res.status(500).json({ error: 'Login is not configured. Set SESSION_SECRET in Vercel.' }); return; }

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const totpCode = String(b.totpCode || '').trim();
  const ip = clientIp(req);

  if (email && dbEnabled()) {
    try {
      await ensureProvidersTable();
      const q = sql();
      if ((await tooManyAttempts(q, email)) || (await tooManyAttemptsByIp(q, ip))) {
        res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
        return;
      }
      const rows = await q`SELECT id, name, email, pass_hash, verified, totp_enabled, totp_secret FROM providers WHERE email = ${email}`;
      const passOk = rows.length && verifyPassword(password, rows[0].pass_hash);
      if (passOk) {
        // Second factor: if the account has TOTP enabled, a valid 6-digit code is required.
        if (rows[0].totp_enabled) {
          if (!totpCode) {
            // Password was correct — ask for the code (not a failed attempt).
            res.status(401).json({ requiresTotp: true, error: 'Enter the 6-digit code from your authenticator app.' });
            return;
          }
          if (!verifyTotp(rows[0].totp_secret, totpCode)) {
            await recordAttempt(q, email, ip);
            res.status(401).json({ requiresTotp: true, error: 'That code is incorrect or expired — try the newest one in your app.' });
            return;
          }
        }
        // Re-check the subscription at login when the paywall is enforced. Fail OPEN on a lookup
        // error so a transient billing-provider hiccup can't lock a paying customer out.
        if ((process.env.REQUIRE_PAYMENT || '').toLowerCase() === 'true') {
          // Founder / comped accounts skip the paywall. There's a built-in owner default so the
          // founder is never locked out even before FOUNDER_EMAILS is set; add more (comma-separated)
          // via the FOUNDER_EMAILS env var in Vercel.
          const founders = ['botanicalaestheticsbyashley@gmail.com']
            .concat(String(process.env.FOUNDER_EMAILS || '').toLowerCase().split(','))
            .map(s => s.trim()).filter(Boolean);
          const exempt = founders.includes(email);
          if (!exempt) {
            try {
              if (!(await hasActiveSubscription(email))) {
                res.status(402).json({ error: 'Your subscription isn’t active. Please renew to continue.', checkoutUrl: process.env.STRIPE_PAYMENT_LINK || '' });
                return;
              }
            } catch (e) { /* fail open — don't block on a billing lookup failure */ }
          }
        }
        await clearAttempts(q, email);
        const sid = await createSession(q, rows[0].id, req);
        const token = signToken({ u: rows[0].id, e: email, sid }, secret);
        res.status(200).json({ token, name: rows[0].name || '', email, verified: !!rows[0].verified, totpEnabled: !!rows[0].totp_enabled });
        return;
      }
      await recordAttempt(q, email, ip);
      // Single generic message for both "no account" and "wrong password" so login can't be used to
      // enumerate which emails are registered.
      res.status(401).json({ error: 'Email or password is incorrect.' });
      return;
    } catch (e) { console.error('[login] failed:', e && e.stack || e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); return; }
  }

  // Legacy single-password owner login
  const expected = process.env.APP_PASSWORD || '';
  if (expected && password === expected) {
    const token = signToken({ u: 'owner' }, secret);
    res.status(200).json({ token, name: '', email: '', verified: true });
    return;
  }
  res.status(401).json({ error: expected ? 'Incorrect password.' : 'Enter your email and password to log in.' });
}
