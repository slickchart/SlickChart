// Change a provider's own login email, from Settings → Password & Security.
//
//   GET  /api/change-email                       (session)  → { ok, email, pending }
//   POST /api/change-email { password, newEmail } (session)  → emails a confirm link to the NEW address
//   POST /api/change-email { confirm: <token> }   (the token) → makes the change
//
// Nothing changes until the new address proves it is hers by opening that link, and the old address
// is told both times, so a stolen session cannot quietly move an account to someone else's inbox.
//
// Her data does not move: clients, notes, photos, kv, Square and Google are all keyed by her provider
// id. What IS keyed by email has to move with it, or the change locks her out or spams her:
//   - providers.email            her login
//   - subscriptions              the paywall at sign-in reads this row BY EMAIL; left behind, a paying
//                                provider is told her subscription isn't active
//   - the Stripe customer(s)     login's fallback asks Stripe by email, and receipts go there
//   - nurture_sends / optout     keyed by email; left behind, the welcome sequence starts over
//   - waitlist                   the old address would stop being "a provider" and get lead emails
// Sessions are NOT revoked: a revoked session wipes that device, unsent edits included. Endpoints that
// need her email read it from her row by id (accountEmail in lib/db.js), not from the token.
//
// The request is non-enumerable: whether the new address already has an account, the answer is the
// same, and only that address is told which it was.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyPassword, makeToken, tooManyAttempts, recordAttempt, sessionFromReq } from '../lib/auth.js';
import { sendEmail, trustedOrigin } from '../lib/email.js';

const MAX_REQUESTS = 5;          // per account per hour, wrong passwords included
const WINDOW_MIN = 60;

const norm = s => String(s || '').trim().toLowerCase();
const looksLikeEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Founder accounts gate the owner-only tools by their email (CLAUDE.md §0.5), so neither side of a
// change may be one. Hers is changed by hand, deliberately.
function isFounderEmail(em) {
  const list = ['botanicalaestheticsbyashley@gmail.com']
    .concat(String(process.env.FOUNDER_EMAILS || '').split(','))
    .concat(String(process.env.OWNER_EMAIL || '').split(','))
    .concat(String(process.env.FOUNDER_NOTIFY_EMAIL || '').split(','))
    .map(norm).filter(Boolean);
  return list.includes(norm(em));
}

async function stripeCall(method, url, form) {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return null;
  try {
    const r = await fetch(url, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + key }, form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      body: form ? new URLSearchParams(form).toString() : undefined
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function send(to, subject, lines) {
  try {
    await sendEmail({
      to, subject,
      text: lines.map(l => l.replace(/<[^>]+>/g, '')).join('\n\n'),
      html: '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;font-size:15px;line-height:1.6;color:#222;">' + lines.map(l => '<p>' + l + '</p>').join('') + '</div>'
    });
  } catch (e) { console.error('[change-email] email failed:', e && e.message || e); }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }

  try {
    await ensureProvidersTable();
    const q = sql();

    // ── Confirm: the link from the new inbox. The token is the only credential, so it is checked
    //    for kind and expiry, used once, and the account it names is the only one touched.
    if (req.method === 'POST' && b.confirm) {
      const token = String(b.confirm);
      const t = await q`SELECT provider_id, data FROM auth_tokens WHERE token = ${token} AND kind = 'email_change' AND expires_at > now()`;
      if (!t.length || !t[0].data) { res.status(400).json({ error: 'This link has expired. Ask for a new one in Settings.' }); return; }
      const pid = String(t[0].provider_id);
      const next = norm(t[0].data);
      const cur = await q`SELECT email, name FROM providers WHERE id = ${pid}`;
      if (!cur.length) { await q`DELETE FROM auth_tokens WHERE token = ${token}`; res.status(400).json({ error: 'This link has expired. Ask for a new one in Settings.' }); return; }
      const old = norm(cur[0].email);
      if (old === next) { await q`DELETE FROM auth_tokens WHERE token = ${token}`; res.status(200).json({ ok: true, email: next }); return; }
      const taken = await q`SELECT 1 FROM providers WHERE lower(email) = ${next} AND id <> ${pid}`;
      if (taken.length || isFounderEmail(next) || isFounderEmail(old)) {
        await q`DELETE FROM auth_tokens WHERE token = ${token}`;
        res.status(409).json({ error: 'That email already has a SlickChart account, so it can’t be used for this one.' });
        return;
      }

      // 1) The login itself. If this fails nothing else has moved.
      try {
        await q`UPDATE providers SET email = ${next}, verified = true WHERE id = ${pid}`;
      } catch (e) {
        res.status(409).json({ error: 'That email already has a SlickChart account, so it can’t be used for this one.' });
        return;
      }
      await q`DELETE FROM auth_tokens WHERE provider_id = ${pid} AND kind = 'email_change'`;
      const notes = [];

      // 2) The subscription row the sign-in paywall reads. If the new address already has its own
      //    row (she paid with it), that one stands and the old row is left as it was.
      let customerIds = [];
      try {
        const have = await q`SELECT 1 FROM subscriptions WHERE email = ${next}`;
        if (!have.length) await q`UPDATE subscriptions SET email = ${next}, updated_at = now() WHERE email = ${old}`;
        const s = await q`SELECT stripe_customer_id FROM subscriptions WHERE email = ${next} OR email = ${old}`;
        customerIds = s.map(r => r.stripe_customer_id).filter(Boolean);
      } catch (e) { notes.push('subscription row'); console.error('[change-email] subscription move failed:', e && e.message || e); }

      // 3) Stripe: every customer on the old address, plus the one the row names. Receipts follow,
      //    and login's ask-Stripe fallback finds her under the new address.
      try {
        const list = await stripeCall('GET', 'https://api.stripe.com/v1/customers?limit=100&email=' + encodeURIComponent(old));
        for (const c of ((list && list.data) || [])) if (c && c.id && !customerIds.includes(c.id)) customerIds.push(c.id);
        for (const id of customerIds) {
          const ok = await stripeCall('POST', 'https://api.stripe.com/v1/customers/' + encodeURIComponent(id), { email: next });
          if (!ok) notes.push('stripe ' + id);
        }
      } catch (e) { notes.push('stripe'); }

      // 4) Marketing bookkeeping, so she is not re-sent the welcome emails or sent lead emails.
      try { await q`INSERT INTO nurture_sends (email, seq, step, sent_at) SELECT ${next}, seq, step, sent_at FROM nurture_sends WHERE email = ${old} ON CONFLICT DO NOTHING`; } catch (e) {}
      try { await q`INSERT INTO nurture_optout (email) SELECT ${next} FROM nurture_optout WHERE email = ${old} ON CONFLICT DO NOTHING`; } catch (e) {}
      try {
        const w = await q`SELECT 1 FROM waitlist WHERE lower(email) = ${next}`;
        if (!w.length) await q`UPDATE waitlist SET email = ${next} WHERE lower(email) = ${old}`;
        else await q`INSERT INTO nurture_optout (email) SELECT ${old} FROM waitlist WHERE lower(email) = ${old} ON CONFLICT DO NOTHING`;
      } catch (e) {}

      if (notes.length) console.error('[change-email] ' + pid + ' changed login email; follow-up needed for: ' + notes.join(', '));
      else console.log('[change-email] ' + pid + ' changed login email');

      const link = trustedOrigin() + '/slickchart';
      await send(old, 'Your SlickChart login email was changed',
        ['Your SlickChart login email is now <b>' + esc(next) + '</b>. Your clients, notes and photos are all still there.',
         'If you did not do this, reply to this email right away.']);
      await send(next, 'Your SlickChart login email is changed',
        ['You’re all set. Sign in to SlickChart with <b>' + esc(next) + '</b> and your same password.',
         '<a href="' + link + '">Open SlickChart</a>']);
      res.status(200).json({ ok: true, email: next });
      return;
    }

    // Everything else needs her own signed-in session.
    const p = await sessionFromReq(req, q);
    if (!p || !p.u || p.u === 'owner') { res.status(401).json({ error: 'Please sign in again.' }); return; }
    const rows = await q`SELECT id, email, name, pass_hash FROM providers WHERE id = ${String(p.u)}`;
    if (!rows.length) { res.status(404).json({ error: 'Account not found.' }); return; }
    const me = rows[0];
    const current = norm(me.email);

    if (req.method === 'GET') {
      let pending = null;
      try {
        const t = await q`SELECT data FROM auth_tokens WHERE provider_id = ${String(me.id)} AND kind = 'email_change' AND expires_at > now() ORDER BY created_at DESC LIMIT 1`;
        pending = t.length ? norm(t[0].data) : null;
      } catch (e) {}
      res.status(200).json({ ok: true, email: current, pending, canChange: !isFounderEmail(current) });
      return;
    }

    // ── Request a change.
    const rlKey = 'emailchg:' + me.id;
    if (await tooManyAttempts(q, rlKey, MAX_REQUESTS, WINDOW_MIN)) {
      res.status(429).json({ error: 'Too many tries. Please wait an hour and try again.' });
      return;
    }
    await recordAttempt(q, rlKey);
    const next = norm(b.newEmail);
    if (!looksLikeEmail(next)) { res.status(400).json({ error: 'Enter a valid email address.' }); return; }
    if (next === current) { res.status(400).json({ error: 'That is already your login email.' }); return; }
    if (!verifyPassword(String(b.password || ''), me.pass_hash)) { res.status(400).json({ error: 'Your password is incorrect.' }); return; }
    if (isFounderEmail(current) || isFounderEmail(next)) { res.status(400).json({ error: 'This account’s email can’t be changed here.' }); return; }

    const taken = await q`SELECT 1 FROM providers WHERE lower(email) = ${next}`;
    if (taken.length) {
      // Same answer to the caller; only the owner of that inbox learns why nothing happened.
      await send(next, 'About your SlickChart login',
        ['Someone asked to move a SlickChart login to this address, but this address already has its own SlickChart account, so nothing was changed.',
         'If that was you, reply to this email and we’ll sort it out.']);
    } else {
      await q`DELETE FROM auth_tokens WHERE provider_id = ${String(me.id)} AND kind = 'email_change'`;
      const token = makeToken();
      await q`INSERT INTO auth_tokens (token, provider_id, kind, expires_at, data) VALUES (${token}, ${String(me.id)}, 'email_change', now() + interval '24 hours', ${next})`;
      const link = trustedOrigin() + '/slickchart?emailchange=' + token;
      await send(next, 'Confirm your new SlickChart login email',
        ['Tap the link below to make <b>' + esc(next) + '</b> your SlickChart login email.',
         '<a href="' + link + '">Confirm my new email</a>',
         'This link works for 24 hours. If you didn’t ask for this, you can ignore it.']);
      await send(current, 'A change to your SlickChart login email was requested',
        ['Someone signed in to your SlickChart account asked to change its login email to <b>' + esc(next) + '</b>. Nothing changes until that address confirms it.',
         'If this wasn’t you, change your password in Settings and reply to this email.']);
    }
    res.status(200).json({ ok: true, pending: next });
  } catch (e) {
    console.error('[change-email] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
