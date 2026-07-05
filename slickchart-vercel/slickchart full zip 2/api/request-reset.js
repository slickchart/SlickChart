// POST /api/request-reset  { email }  — emails a password-reset link.
// Always returns 200 so we never reveal whether an email is registered.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { makeToken } from '../lib/auth.js';
import { sendEmail, appOrigin } from '../lib/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email) { res.status(400).json({ error: 'Enter your email.' }); return; }
  try {
    if (dbEnabled()) {
      await ensureProvidersTable();
      const q = sql();
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
