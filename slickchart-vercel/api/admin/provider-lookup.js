// /api/admin/provider-lookup — FOUNDER-ONLY. Helps the founder support a provider who "can't log in".
//   GET  ?email=...                         -> does an account exist for this email? paid? verified?
//   POST { email, action:'resend_reset' }   -> send that provider a fresh password-reset link.
// Gated to FOUNDER_EMAILS / OWNER_EMAIL via the verified session token's email. Never exposes another
// provider's data to anyone but the founder, and never reveals a password (there is none to reveal —
// only a hash). The reset link is emailed to the address on file, exactly like the normal reset flow.
import { dbEnabled, sql } from '../../lib/db.js';
import { verifyToken, isSessionValid, makeToken } from '../../lib/auth.js';
import { sendEmail, trustedOrigin } from '../../lib/email.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }

async function requireFounder(req, res) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  if (!payload) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  try { if (payload.sid && !(await isSessionValid(sql(), payload.sid))) { res.status(401).json({ error: 'Session expired.' }); return null; } } catch (e) {}
  const email = norm(payload.e);
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!email || !founders.includes(email)) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return null; }
  return email;
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const founder = await requireFounder(req, res);
  if (!founder) return;

  const q = sql();
  const bodyEmail = norm((req.body && req.body.email) || '');
  const email = norm(req.query && req.query.email) || bodyEmail;
  if (!email || !/.+@.+\..+/.test(email)) { res.status(400).json({ error: 'Enter a valid email.' }); return; }

  try {
    const pr = await q`SELECT id, name, verified, created_at FROM providers WHERE lower(email) = ${email}`;
    const provider = pr[0] || null;
    let paid = false;
    try { const s = await q`SELECT status FROM subscriptions WHERE lower(email) = ${email}`; paid = !!(s[0] && s[0].status === 'active'); } catch (e) {}

    // ── Resend a password reset link ──────────────────────────────────────────
    if (req.method === 'POST' && (req.body && req.body.action) === 'resend_reset') {
      if (!provider) { res.status(200).json({ ok: false, exists: false, paid, message: 'No account exists for that email yet — the signup didn’t finish. Have them create their account (with this exact email) at slickchart.app.' }); return; }
      const token = makeToken();
      try {
        await q`INSERT INTO auth_tokens (token, provider_id, kind, expires_at) VALUES (${token}, ${provider.id}, 'reset', now() + interval '1 hour')`;
        const link = trustedOrigin() + '/slickchart?reset=' + token;
        await sendEmail({
          to: email,
          subject: 'Reset your SlickChart password',
          text: 'Reset your password: ' + link + '\n\n(This link expires in 1 hour.)',
          html: '<p>Here’s your link to set a new SlickChart password:</p><p><a href="' + link + '">Reset your password</a> (expires in 1 hour).</p><p>If you didn’t request this, you can ignore this email.</p>'
        });
        res.status(200).json({ ok: true, exists: true, paid, sent: true, message: 'Reset link sent to ' + email + '. Ask them to check inbox + spam.' });
      } catch (e) {
        console.error('[admin/provider-lookup] resend failed:', e && e.message || e);
        res.status(500).json({ error: 'Could not send the reset link. Try again in a moment.' });
      }
      return;
    }

    // ── GET: account status ───────────────────────────────────────────────────
    res.status(200).json({
      ok: true,
      email,
      exists: !!provider,
      name: (provider && provider.name) || '',
      verified: !!(provider && provider.verified),
      createdAt: (provider && provider.created_at) ? new Date(provider.created_at).getTime() : 0,
      paid
    });
  } catch (e) {
    console.error('[admin/provider-lookup] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
