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

  // ── ?scan=1 — is a sign-out problem hitting more than one provider? ─────────
  // A provider whose saved token no longer works looks signed in (the app still renders their cached
  // clients) but can't send or sync. The token is minted at login with a 30-day life, and a session row
  // is written at the same moment, so a session created longer ago than that = an expired token on
  // whatever device it was issued to. Revoked sessions are the other reason a token stops working.
  // Reported per PAID provider so the founder can see instantly whether it's one person or everyone —
  // an everyone answer means SESSION_SECRET changed, which invalidates every token at once.
  if (req.method === 'GET' && String((req.query && req.query.scan) || '') === '1') {
    try {
      const rows = await q`
        SELECT p.id, p.email, p.name, p.created_at,
               s.newest_login, s.newest_seen, s.live_sessions, s.total_sessions
          FROM providers p
          JOIN subscriptions sub ON lower(sub.email) = lower(p.email) AND sub.status = 'active'
          LEFT JOIN LATERAL (
            SELECT max(created_at) AS newest_login,
                   max(last_seen_at) AS newest_seen,
                   count(*) FILTER (WHERE NOT revoked AND created_at > now() - interval '30 days') AS live_sessions,
                   count(*) AS total_sessions
              FROM sessions WHERE provider_id = p.id
          ) s ON true
         ORDER BY p.created_at DESC
         LIMIT 500`;
      const now = Date.now();
      const days = t => (t ? Math.floor((now - new Date(t).getTime()) / 86400000) : null);
      const list = (rows || []).map(r => ({
        email: r.email, name: r.name || '',
        signedUpDaysAgo: days(r.created_at),
        lastLoginDaysAgo: days(r.newest_login),
        lastSeenDaysAgo: days(r.newest_seen),
        totalSessions: Number(r.total_sessions || 0),
        // No session younger than the token's 30-day life = nothing they hold can still authenticate.
        tokenDead: Number(r.live_sessions || 0) === 0
      }));
      const stuck = list.filter(p => p.tokenDead);
      // Never logged in at all is a different problem (unfinished signup), so separate it out.
      const neverLoggedIn = stuck.filter(p => p.totalSessions === 0);
      const expiredOrRevoked = stuck.filter(p => p.totalSessions > 0);
      res.status(200).json({
        ok: true, scan: true, tokenTtlDays: 30, paidProviders: list.length,
        stuckCount: expiredOrRevoked.length,
        neverLoggedInCount: neverLoggedIn.length,
        allPaidAffected: list.length > 1 && expiredOrRevoked.length === list.length,
        stuck: expiredOrRevoked.slice(0, 100),
        neverLoggedIn: neverLoggedIn.slice(0, 100),
        healthy: list.filter(p => !p.tokenDead).length
      });
    } catch (e) {
      console.error('[admin/provider-lookup] scan failed:', e && e.message || e);
      res.status(500).json({ error: 'Scan failed.' });
    }
    return;
  }

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
    // Session state answers the "it says I'm not signed in but I am" report directly: if nothing they
    // hold can still authenticate, that's why sending fails, and signing out and back in fixes it.
    let session = null;
    if (provider) {
      try {
        const sr = await q`SELECT created_at, last_seen_at, revoked, device FROM sessions
                            WHERE provider_id = ${provider.id} ORDER BY created_at DESC LIMIT 1`;
        const live = await q`SELECT count(*)::int AS n FROM sessions
                              WHERE provider_id = ${provider.id} AND NOT revoked
                                AND created_at > now() - interval '30 days'`;
        const s0 = sr[0] || null;
        session = {
          everLoggedIn: !!s0,
          lastLoginAt: s0 && s0.created_at ? new Date(s0.created_at).getTime() : 0,
          lastSeenAt: s0 && s0.last_seen_at ? new Date(s0.last_seen_at).getTime() : 0,
          revoked: !!(s0 && s0.revoked),
          device: (s0 && s0.device) || '',
          liveSessions: (live[0] && live[0].n) || 0,
          tokenDead: !!s0 && ((live[0] && live[0].n) || 0) === 0
        };
      } catch (e) { /* diagnostics only — never fail the lookup over it */ }
    }
    res.status(200).json({
      ok: true,
      email,
      exists: !!provider,
      name: (provider && provider.name) || '',
      verified: !!(provider && provider.verified),
      createdAt: (provider && provider.created_at) ? new Date(provider.created_at).getTime() : 0,
      paid,
      session
    });
  } catch (e) {
    console.error('[admin/provider-lookup] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
