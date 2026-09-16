// POST /api/free-signup  { email }  → join the free starter list and get the link emailed now.
//
// Public and unauthenticated, and it sends a real email, so it is written the same way as the other
// passwordless flows here (client-link, request-reset):
//   • Always returns a generic success. It never reveals whether an address is already on the list.
//   • Rate limited per email AND per IP, so it cannot be used to bomb a stranger's inbox.
//   • Sent exactly once per address, claimed atomically, so a double submit sends one email.
// Nothing here reads or writes any provider's data — free_signups is its own table and this route
// touches nothing else.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { tooManyAttempts, tooManyAttemptsByIp, recordAttempt } from '../lib/auth.js';
import { sendEmail, addToAudience } from '../lib/email.js';
import { ensureNurtureTables } from '../lib/nurture.js';
import { ensureFreeTables, freeSender, WELCOME_SUBJECT, welcomeHtml, welcomeText } from '../lib/free-funnel.js';
import { pushFounders, fcmConfigured } from '../lib/fcm.js';

// One address may ask 3 times an hour (fat fingers, a lost email, a second device). One IP may ask
// 20 times an hour, which is generous for a household or an office and useless for a script.
const MAX_PER_EMAIL = 3, MAX_PER_IP = 20, WINDOW_MIN = 60;
// How long before the same address can be sent the link again. Below this, a repeat signup is
// recorded and acknowledged but sends nothing — that is what makes a double submit send one email.
// Above it, they get it again, because "I lost the email" should not be a permanent dead end.
const RESEND_AFTER_HOURS = 24;

function reqIp(req) {
  const real = String(req.headers['x-real-ip'] || '').trim();
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return real || fwd || (req.socket && req.socket.remoteAddress) || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  const body = (req.body && typeof req.body === 'object') ? req.body : (() => { try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; } })();
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  // The only thing worth telling the caller plainly: their address is malformed. Everything else
  // below answers identically whatever the truth is.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).json({ ok: false, error: 'That email address doesn’t look right.' });
    return;
  }

  const link = String(process.env.FREE_ROADMAP_URL || '').trim();
  if (!link) {
    // Never tell someone "it worked" when we have nothing to send them.
    console.error('[free-signup] FREE_ROADMAP_URL is not set — nothing to deliver');
    res.status(503).json({ ok: false, error: 'The free starter isn’t quite ready to send. Email hello@slickchart.app and I’ll send it over myself.' });
    return;
  }
  if (!dbEnabled()) {
    // Without the database there is no once-only guard and no rate limit, which would turn this
    // into an open mailer. Refuse rather than send.
    console.error('[free-signup] no database — refusing to send unguarded');
    res.status(503).json({ ok: false, error: 'Something’s down on my end. Email hello@slickchart.app and I’ll send it over myself.' });
    return;
  }

  try {
    await ensureProvidersTable();                 // login_attempts lives here — used as the rate limiter
    const q = sql();
    await ensureNurtureTables(q);                 // nurture_sends (once-only) + nurture_optout
    await ensureFreeTables(q);

    const ip = reqIp(req);
    const rlKey = 'free:' + email;                // namespaced so it can never trip a real login lockout
    const limited = (await tooManyAttempts(q, rlKey, MAX_PER_EMAIL, WINDOW_MIN))
                 || (await tooManyAttemptsByIp(q, 'free-ip:' + ip, MAX_PER_IP, WINDOW_MIN));
    // Record every attempt, limited or not, so a blocked caller and a fresh one behave identically.
    await recordAttempt(q, rlKey, 'free-ip:' + ip);
    if (limited) { res.status(200).json({ ok: true }); return; }

    // Someone who has unsubscribed stays unsubscribed. We cannot tell a genuine return visit from
    // a stranger typing their address, and the wrong answer here is the one that emails a person
    // who asked not to be emailed. The page tells them to write to hello@ if they are stuck.
    const out = await q`SELECT email FROM nurture_optout WHERE email = ${email}`;
    if (out.length) { res.status(200).json({ ok: true }); return; }

    await q`INSERT INTO free_signups (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;

    // Their own list, never the SlickChart provider one. addToAudience with an explicit '' does
    // nothing rather than falling back to the account's first audience — which is how a freebie
    // signup would otherwise end up getting esthetician software marketing. The row above is the
    // real record either way, so nothing is lost if FREE_AUDIENCE_ID isn't set yet.
    try { await addToAudience(email, '', String(process.env.FREE_AUDIENCE_ID || '')); }
    catch (e) { console.error('[free-signup] audience add failed:', e && e.message || e); }

    // Claim the send. Step 0 of the 'free' sequence, in the same table the drip engine uses, so the
    // day-1 email can never arrive before this one and this one can never go twice.
    let claimed = (await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'free', 0)
      ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`).length > 0;
    if (!claimed) {
      // Already sent. Re-claim only if it was long enough ago — a conditional UPDATE, so two
      // simultaneous requests cannot both win it.
      claimed = (await q`UPDATE nurture_sends SET sent_at = now()
        WHERE email = ${email} AND seq = 'free' AND step = 0
          AND sent_at < now() - (${RESEND_AFTER_HOURS} * interval '1 hour')
        RETURNING email`).length > 0;
    }
    if (!claimed) { res.status(200).json({ ok: true }); return; }   // signed up twice — one email

    const { from, replyTo } = freeSender();
    try {
      await sendEmail({
        to: email, from, replyTo,
        subject: WELCOME_SUBJECT,
        html: welcomeHtml({ email, link }),
        text: welcomeText({ email, link })
      });
    } catch (e) {
      // Release the claim so they can try again immediately instead of being told it sent.
      await q`DELETE FROM nurture_sends WHERE email = ${email} AND seq = 'free' AND step = 0`;
      console.error('[free-signup] send failed:', e && e.message || e);
      res.status(502).json({ ok: false, error: 'I couldn’t get that email out just now.' });
      return;
    }

    // ── Tell Ashley someone signed up ─────────────────────────────────────────
    // This sits AFTER the once-only claim above, which is the point: a repeat submit that sends no
    // email also sends no push, so the phone buzzes exactly once per person, same as the inbox.
    // Best-effort and last — a push problem must never turn a successful signup into an error for
    // the person who just handed over their address.
    try {
      if (fcmConfigured()) {
        const total = await (async () => {
          try { const r = await q`SELECT count(*)::int AS n FROM free_signups`; return (r[0] && r[0].n) || 0; } catch (e) { return 0; }
        })();
        const pushed = await pushFounders({
          title: '🎁 New free starter signup!',
          body: email + ' just grabbed the free starter' + (total ? ` — that's ${total} on the list now` : ''),
          url: '/slickchart', tag: 'free:' + email
        });
        console.log('[free-signup] founder push: devices=' + pushed + ' for=' + email);
      }
    } catch (e) { console.error('[free-signup] founder push failed:', e && e.message || e); }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[free-signup] failed:', e && e.stack || e);
    res.status(500).json({ ok: false, error: 'Something went wrong on my end.' });
  }
}
