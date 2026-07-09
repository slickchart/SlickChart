// POST /api/request-reset  { email }  — emails a password-reset link.
// Always returns 200 so we never reveal whether an email is registered.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { makeToken, tooManyAttempts, recordAttempt } from '../lib/auth.js';
import { sendEmail, appOrigin } from '../lib/email.js';

// A reset request is cheap to trigger but sends a real email every time, so cap how
// many we'll act on for one address in a window — this stops a known address from
// being bombed with reset emails (and the associated email cost). The key is
// namespaced ('reset:') so it shares the login_attempts table without ever colliding
// with — or triggering — a real login lockout, which uses the bare email as its key.
const MAX_RESET = 5;
const RESET_WINDOW_MIN = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email) { res.status(400).json({ error: 'Enter your email.' }); return; }
  try {
    if (dbEnabled()) {
      await ensureProvidersTable();
      const q = sql();
      const rlKey = 'reset:' + email;
      // Over the limit → stop here, but still return 200 (below) so we never reveal
      // whether the address exists or that a rate limit was hit. Record every request
      // (matching or not) so behavior is identical for real and unknown addresses.
      if (await tooManyAttempts(q, rlKey, MAX_RESET, RESET_WINDOW_MIN)) {
        res.status(200).json({ ok: true });
        return;
      }
      await recordAttempt(q, rlKey);
      const rows = await q`SELECT id FROM providers WHERE email = ${email}`;
      if (rows.length) {
        const token = makeToken();
        await q`INSERT INTO auth_tokens (token, provider_id, kind, expires_at) VALUES (${token}, ${rows[0].id}, 'reset', now() + interval '1 hour')`;
        const link = appOrigin(req) + '/slickchart?reset=' + token;
        try {
          await sendEmail({
            to: email,
            subject: 'Reset your SlickChart password',
            text: 'Reset your password: ' + link,
            html: '<p>Someone requested a password reset for your SlickChart account.</p><p><a href="' + link + '">Reset your password</a> (link expires in 1 hour). If this wasn\u2019t you, you can ignore this email.</p>'
          });
        } catch (e) { /* ignore send errors */ }
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) { res.status(200).json({ ok: true }); }
}
