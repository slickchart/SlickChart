// /api/admin/orphans — people who PAID but never made their SlickChart account, what the automatic
// "finish your account" email did for each, and Ashley's two wait settings for it.
//
//   GET   founder session  -> full list + settings
//         Monitor <key>    -> same, emails masked (the daily brief reads this; she authorized the key)
//   POST  founder session only: { orphan_email_hours, orphan_alert_hours } -> saves either or both
//
// Owner-only, resolved from the VERIFIED token's email (§0.5), never from a request field. Reads only
// billing rows and the send log; it never changes a subscription or contacts anyone.
import { dbEnabled, sql, ensureProvidersTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { maskEmail } from '../../lib/app-launch-log.js';
import { ensureNurtureTables } from '../../lib/nurture.js';
import { resendSetupEmail, sendSetupEmailNow } from '../../lib/setup-email.js';
import { emailTypoSuggestion, recentSignupProblems, ensureSignupProblemsTable } from '../../lib/signup-rescue.js';
import { FOUNDER_SETTINGS, getFounderSettings, setFounderSetting } from '../../lib/founder-settings.js';

async function founderSession(req, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = secret && tok ? verifyToken(tok, secret) : null;
  if (!p) return false;
  try { if (p.sid && !(await isSessionValid(q, p.sid))) return false; } catch (e) {}
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  return founders.includes(String(p.e || '').toLowerCase());
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
const looksLikeEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
function isFounderEmail(em) {
  return ['botanicalaestheticsbyashley@gmail.com']
    .concat(String(process.env.FOUNDER_EMAILS || '').split(','), String(process.env.OWNER_EMAIL || '').split(','))
    .map(x => String(x || '').trim().toLowerCase()).filter(Boolean).includes(em);
}

const iso = v => { const t = v ? new Date(v).getTime() : 0; return t ? new Date(t).toISOString() : null; };

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const q = sql();
  const founder = await founderSession(req, q);
  let monitor = false;
  if (!founder && req.method === 'GET') { try { monitor = await monitorKeyOk(req, q, (process.env.OWNER_EMAIL || '').trim().toLowerCase()); } catch (e) { monitor = false; } }
  if (!founder && !monitor) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }

  try {
    if (req.method === 'POST' && req.body && req.body.resend === 'all') {
      // "Send setup email again" — to EVERY person on this list (paid, real subscription, no account),
      // in one tap (CLAUDE.md §4d). The list is read from the server, never from the request, so this
      // can only ever email people who paid and have no account. Founder session only (above).
      await ensureProvidersTable();
      await ensureNurtureTables(q);
      const list = await q`SELECT s.email FROM subscriptions s
        WHERE s.status IN ('active', 'trialing') AND coalesce(s.stripe_subscription_id, '') <> ''
          AND s.updated_at > now() - interval '60 days'
          AND NOT EXISTS (SELECT 1 FROM providers p WHERE lower(p.email) = lower(s.email))
        ORDER BY s.updated_at DESC LIMIT 50`;
      const results = [];
      for (const r of list) results.push({ email: String(r.email || '').toLowerCase(), result: await resendSetupEmail(q, r.email) });
      res.status(200).json({ ok: true, sent: results.filter(x => x.result === 'sent').length, results });
      return;
    }
    if (req.method === 'POST' && req.body && req.body.move) {
      // "Move payment to <email>" (2026-11-18). Someone paid under a mistyped address (or one she
      // cannot reach) and so has no way to make her account. Ashley taps once: the subscription row
      // and the Stripe customer move to the address she gives, and the create-your-account email goes
      // there. Founder session only (above). `from` must be on THIS list (paid, real subscription, no
      // account), read from the server, so this can never move anyone else's subscription, and `to`
      // must not already have an account or a subscription of its own.
      const from = String(req.body.move.from || '').trim().toLowerCase();
      const to = String(req.body.move.to || '').trim().toLowerCase();
      if (!looksLikeEmail(to)) { res.status(400).json({ error: 'Enter the email she can get to.' }); return; }
      if (from === to) { res.status(400).json({ error: 'That is the same email.' }); return; }
      if (isFounderEmail(to) || isFounderEmail(from)) { res.status(400).json({ error: 'Not for a founder email.' }); return; }
      await ensureProvidersTable();
      await ensureNurtureTables(q);
      const row = await q`SELECT s.email, s.stripe_customer_id FROM subscriptions s
        WHERE lower(s.email) = ${from} AND s.status IN ('active', 'trialing') AND coalesce(s.stripe_subscription_id, '') <> ''
          AND NOT EXISTS (SELECT 1 FROM providers p WHERE lower(p.email) = lower(s.email))`;
      if (!row.length) { res.status(404).json({ error: 'That payment is not on the list any more (she may have made her account already).' }); return; }
      if ((await q`SELECT 1 FROM providers WHERE lower(email) = ${to}`).length) { res.status(409).json({ error: to + ' already has an account. Nothing was moved.' }); return; }
      if ((await q`SELECT 1 FROM subscriptions WHERE lower(email) = ${to}`).length) { res.status(409).json({ error: to + ' already has a subscription of its own. Nothing was moved.' }); return; }
      await q`UPDATE subscriptions SET email = ${to}, updated_at = now() WHERE lower(email) = ${from}`;
      const notes = [];
      const ids = [row[0].stripe_customer_id].filter(Boolean);
      try {
        const list = await stripeCall('GET', 'https://api.stripe.com/v1/customers?limit=100&email=' + encodeURIComponent(from));
        for (const c of ((list && list.data) || [])) if (c && c.id && !ids.includes(c.id)) ids.push(c.id);
        for (const id of ids) { if (!(await stripeCall('POST', 'https://api.stripe.com/v1/customers/' + encodeURIComponent(id), { email: to }))) notes.push('Stripe still shows the old email on ' + id + ' (receipts go there; her sign-in works anyway).'); }
      } catch (e) { notes.push('Stripe was not updated (her sign-in works anyway).'); }
      try { await q`INSERT INTO nurture_optout (email) SELECT ${to} FROM nurture_optout WHERE email = ${from} ON CONFLICT DO NOTHING`; } catch (e) {}
      const setup = await sendSetupEmailNow(q, to);
      try { await ensureSignupProblemsTable(q); await q`INSERT INTO signup_problems (email, kind, match, detail, alerted) VALUES (${to}, 'moved', ${from}, ${'payment moved by Ashley; setup email: ' + setup}, false)`; } catch (e) {}
      console.log('[admin/orphans] moved payment ' + from + ' -> ' + to + ' setup=' + setup);
      res.status(200).json({ ok: true, from, to, setup, notes });
      return;
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const saved = {};
      for (const k of Object.keys(FOUNDER_SETTINGS)) if (b[k] != null && b[k] !== '') { const v = await setFounderSetting(q, k, b[k]); if (v != null) saved[k] = v; }
      const settings = await getFounderSettings(q);
      res.status(200).json({ ok: true, saved, settings });
      return;
    }
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

    await ensureProvidersTable();
    await ensureNurtureTables(q);
    const settings = await getFounderSettings(q);
    const rows = await q`SELECT s.email, s.updated_at,
        (SELECT sent_at FROM nurture_sends n WHERE n.email = lower(s.email) AND n.seq = 'orphan' AND n.step = 0) AS emailed_at,
        (SELECT sent_at FROM nurture_sends n WHERE n.email = lower(s.email) AND n.seq = 'orphan' AND n.step = 1) AS alerted_at,
        (SELECT sent_at FROM nurture_sends n WHERE n.email = lower(s.email) AND n.seq = 'setup' AND n.step = 0) AS setup_at,
        (SELECT max(sent_at) FROM nurture_sends n WHERE n.email = lower(s.email) AND n.seq = 'setup-resend') AS resent_at,
        EXISTS (SELECT 1 FROM nurture_optout o WHERE o.email = lower(s.email)) AS unsubscribed
      FROM subscriptions s
      WHERE s.status IN ('active', 'trialing') AND coalesce(s.stripe_subscription_id, '') <> ''
        AND s.updated_at > now() - interval '60 days'
        AND NOT EXISTS (SELECT 1 FROM providers p WHERE lower(p.email) = lower(s.email))
      ORDER BY s.updated_at DESC LIMIT 50`;
    let fails = {};
    try { (await q`SELECT lower(email) AS e, count(*)::int AS n FROM login_attempts WHERE ts > now() - interval '30 days' GROUP BY lower(email)`).forEach(r => { fails[r.e] = r.n; }); } catch (e) {}
    const problems = await recentSignupProblems(q, 14);
    const people = rows.map(r => {
      const em = String(r.email || '').toLowerCase();
      const hours = Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 3600000);
      const emailed = iso(r.emailed_at);
      let status;
      if (emailed) status = 'emailed';
      else if (r.unsubscribed) status = 'unsubscribed, not emailed';
      else if (hours < settings.orphan_email_hours) status = (r.setup_at ? 'setup email sent, reminder' : 'waiting') + ' (' + (settings.orphan_email_hours - hours) + 'h until the email)';
      else status = 'due, goes out on the next hourly run';
      // The address she most likely meant: a mistyped domain, or the email she was refused with at
      // Create account / Sign in. Shown to Ashley only, as the one-tap "Move payment" suggestion.
      let suggest = emailTypoSuggestion(em);
      const tried = problems.find(p => p.match === em && p.email !== em);
      if (tried) suggest = tried.email;
      return { email: founder ? em : maskEmail(em), suggest: suggest ? (founder ? suggest : maskEmail(suggest)) : null, paidAt: iso(r.updated_at), hoursSincePaid: hours, emailedAt: emailed, setupEmailAt: iso(r.setup_at), resentAt: iso(r.resent_at), alertedAt: iso(r.alerted_at), status, failedSignIns: fails[em] || 0 };
    });
    const labels = {}; for (const k of Object.keys(FOUNDER_SETTINGS)) labels[k] = { label: FOUNDER_SETTINGS[k].label, min: FOUNDER_SETTINGS[k].min, max: FOUNDER_SETTINGS[k].max, def: FOUNDER_SETTINGS[k].def };
    const signupProblems = problems.filter(p => p.kind !== 'moved').map(p => Object.assign({}, p, founder ? {} : { email: maskEmail(p.email), match: p.match ? maskEmail(p.match) : null }));
    res.status(200).json({ ok: true, settings, labels, people, signupProblems });
  } catch (e) {
    console.error('[admin/orphans] failed:', (e && e.message) || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
