// A new provider who PAID but cannot get in (2026-11-18). Two providers in a row told Ashley they
// "couldn't make an account". What the server showed:
//   - one typed her email with a typo at checkout (cm_…@tahoo.com, meant yahoo.com). The setup email
//     went to an inbox that does not exist, and the address she DOES own has no payment under it, so
//     Create account refused her with "this email hasn't completed checkout yet".
//   - three of the five people who paid and never got an account had tried to SIGN IN (2, 6 and 1
//     refusals): they thought paying made the account. The phone apps showed them only Sign in, and
//     a refusal said nothing but "Email or password is incorrect".
// Nothing told Ashley, so she learned about each one from the provider. This file is the catch:
//
//   emailTypoSuggestion(email)  "cm@tahoo.com" -> "cm@yahoo.com", for the common mail providers only
//   nearPaidEmails(q, email)    paid-but-no-account addresses that look like a mistyped copy of this one
//   recordSignupProblem(...)    one row per failed attempt (signup_problems), and an immediate alert to
//                               Ashley (email + every device via pushFoundersReport, CLAUDE.md §0b),
//                               at most once per address and kind per 12 h and 20 a day in all, so a
//                               stranger poking at the form cannot flood her phone
//   recentSignupProblems(q)     the list the founder screen and the daily brief read
//
// Privacy (CLAUDE.md §0.4): nothing here changes what the CALLER is told. The person on the form gets
// the same answer whether or not a near match exists; only Ashley sees the match. Never throws.
import { sendEmail } from './email.js';
import { pushFoundersReport, founderPushConfigured } from './fcm.js';
import { recordNotify } from './notify-log.js';
import { getFounderSettings } from './founder-settings.js';

// Mail providers people actually use. A domain ON this list is never "corrected"; a domain one or two
// keystrokes away from one of them is very probably a typo of it.
const COMMON = ['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com', 'icloud.com',
  'me.com', 'mac.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'aol.com', 'aim.com',
  'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net', 'bellsouth.net', 'cox.net', 'charter.net',
  'protonmail.com', 'proton.me', 'mail.com', 'gmx.com', 'yahoo.ca', 'hotmail.ca', 'yahoo.co.uk',
  'hotmail.co.uk', 'outlook.co.uk'];
// Where a typo lands closest to one of these, this is what was meant (gmial/gmai/gmail.co -> gmail.com).
const PREFER = ['gmail.com', 'yahoo.com', 'icloud.com', 'hotmail.com', 'outlook.com', 'aol.com'];

// Optimal string alignment distance (Levenshtein plus swapping two neighbours, "gmial").
export function editDistance(a, b) {
  a = String(a || ''); b = String(b || '');
  const n = a.length, m = b.length;
  if (!n) return m; if (!m) return n;
  const d = [];
  for (let i = 0; i <= n; i++) { d[i] = [i]; }
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[n][m];
}

function split(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1) return null;
  return { local: e.slice(0, at), domain: e.slice(at + 1) };
}

// The corrected address, or null when the domain is fine or not close to a common provider.
export function emailTypoSuggestion(email) {
  const p = split(email);
  if (!p) return null;
  const dom = p.domain;
  if (COMMON.includes(dom)) return null;
  const max = dom.length >= 9 ? 2 : 1;
  let best = null, bestD = 99;
  for (const c of PREFER.concat(COMMON)) {
    const dd = editDistance(dom, c);
    if (dd < bestD) { best = c; bestD = dd; }
  }
  if (!best || bestD < 1 || bestD > max) return null;
  return p.local + '@' + best;
}

// Do two addresses look like one person's, one of them mistyped? Same name with a near domain, or the
// same domain with a name one keystroke off (long names only, so "amy"/"amb" are never matched).
export function looksLikeSamePerson(a, b) {
  const x = split(a), y = split(b);
  if (!x || !y) return false;
  if (x.local === y.local && x.domain === y.domain) return false;
  if (emailTypoSuggestion(a) === y.local + '@' + y.domain || emailTypoSuggestion(b) === x.local + '@' + x.domain) return true;
  if (x.local === y.local && editDistance(x.domain, y.domain) <= 2) return true;
  if (x.domain === y.domain && x.local.length >= 5 && editDistance(x.local, y.local) <= 1) return true;
  return false;
}

// Paid (real subscription) in the last 30 days, no account, and close to `email`. Newest first.
export async function nearPaidEmails(q, email) {
  try {
    const rows = await q`SELECT lower(s.email) AS email FROM subscriptions s
      WHERE s.status IN ('active', 'trialing') AND coalesce(s.stripe_subscription_id, '') <> ''
        AND s.updated_at > now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM providers p WHERE lower(p.email) = lower(s.email) AND NOT coalesce(p.needs_setup, false))
      ORDER BY s.updated_at DESC LIMIT 60`;
    return rows.map(r => r.email).filter(e => looksLikeSamePerson(e, email)).slice(0, 3);
  } catch (e) { return []; }
}

let _ready = false;
export async function ensureSignupProblemsTable(q) {
  if (_ready) return;
  await q`CREATE TABLE IF NOT EXISTS signup_problems (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    email text NOT NULL,
    kind text NOT NULL,
    match text,
    detail text,
    alerted boolean NOT NULL DEFAULT false
  )`;
  await q`CREATE INDEX IF NOT EXISTS signup_problems_email_idx ON signup_problems (email, kind, at)`;
  _ready = true;
}

const KIND_WORDS = {
  'signup-unpaid': 'tried to create an account, but no payment is under that email',
  'signin-no-account': 'paid, but tried to SIGN IN before making an account (it was refused)',
  'reset-no-account': 'paid, then asked for a password reset, but has no account yet',
  'checkout-typo': 'paid with an email that looks mistyped, so the setup email cannot reach her',
  // Any other refusal of Create account (bad email, short password, already has an account, server
  // error): recorded so the activity monitor can see someone stuck, never alerted on its own.
  'signup-refused': 'was refused at Create account',
};
const RECORD_ONLY = new Set(['signup-refused']);

function founderInbox() {
  return String(process.env.FOUNDER_NOTIFY_EMAIL || process.env.FOUNDER_EMAILS || 'botanicalaestheticsbyashley@gmail.com').split(',')[0].trim();
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// kind: one of KIND_WORDS. match: the address we think she meant / paid with (or null).
// extra: a short line of what was done automatically (e.g. "The setup email was sent to her again.").
export async function recordSignupProblem(q, { email, kind, match, extra }) {
  const em = String(email || '').trim().toLowerCase();
  if (!em || em.indexOf('@') < 1 || !KIND_WORDS[kind]) return { recorded: false };
  try {
    await ensureSignupProblemsTable(q);
    const recent = await q`SELECT 1 FROM signup_problems WHERE email = ${em} AND kind = ${kind} AND alerted AND at > now() - interval '12 hours' LIMIT 1`;
    const today = await q`SELECT count(*)::int AS n FROM signup_problems WHERE alerted AND at > now() - interval '24 hours'`;
    let on = 1; try { on = (await getFounderSettings(q)).signup_problem_alert_on; } catch (e) {}
    const alert = !RECORD_ONLY.has(kind) && !!on && !recent.length && ((today[0] && today[0].n) || 0) < 20;
    await q`INSERT INTO signup_problems (email, kind, match, detail, alerted) VALUES (${em}, ${kind}, ${match || null}, ${extra || null}, ${alert})`;
    if (!alert) return { recorded: true, alerted: false };

    const what = KIND_WORDS[kind];
    const matchLine = match ? (kind === 'checkout-typo' ? 'She probably meant: ' + match : 'Paid under a similar email: ' + match) : '';
    const fix = match
      ? 'One tap fixes it: Admin tools > Paid but no account > "Move payment to ' + (kind === 'checkout-typo' ? match : em) + '". That moves her subscription to the right email and sends her the setup email there.'
      : (kind === 'signup-unpaid' ? 'No payment under a similar email in the last 30 days, so she may simply not have subscribed yet.' : '');
    try {
      await sendEmail({
        to: founderInbox(),
        subject: '⚠️ A new provider could not get in: ' + em,
        text: em + ' ' + what + '.\n\n' + (matchLine ? matchLine + '\n\n' : '') + (extra ? extra + '\n\n' : '') + (fix ? fix + '\n' : ''),
        html: '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;padding:8px;font-size:15px;line-height:1.6;color:#1a2a28;">'
          + '<div style="font-size:20px;font-weight:700;margin-bottom:8px;">A new provider could not get in</div>'
          + '<p style="margin:0 0 10px;"><b>' + esc(em) + '</b> ' + esc(what) + '.</p>'
          + (matchLine ? '<p style="margin:0 0 10px;"><b>' + esc(matchLine) + '</b></p>' : '')
          + (extra ? '<p style="margin:0 0 10px;">' + esc(extra) + '</p>' : '')
          + (fix ? '<p style="margin:0 0 10px;">' + esc(fix) + '</p>' : '') + '</div>'
      });
    } catch (e) { console.error('[signup-rescue] founder email failed:', (e && e.message) || e); }
    let devices = 0, sent = 0, skipped = '';
    try {
      if (!founderPushConfigured()) skipped = 'no push transport configured';
      else {
        const r = await pushFoundersReport({
          title: '⚠️ New provider can’t get in',
          body: em + (match ? ' (paid as ' + match + ')' : '') + ': ' + what,
          url: '/slickchart', tag: 'signup-problem:' + em
        });
        devices = r.devices || 0; sent = r.sent || 0;
      }
    } catch (e) { skipped = 'threw: ' + ((e && e.message) || 'unknown'); }
    await recordNotify({ kind: 'signup-problem', subject: em, skipped, devices, sent, detail: kind + (match ? ' match=' + match : '') });
    return { recorded: true, alerted: true };
  } catch (e) {
    console.error('[signup-rescue] record failed:', (e && e.message) || e);
    return { recorded: false };
  }
}

// The last N days of problems, newest first, one row per address+kind (with a count). Never throws.
export async function recentSignupProblems(q, days = 14) {
  try {
    await ensureSignupProblemsTable(q);
    const d = Math.max(1, Math.min(60, Number(days) || 14));
    const rows = await q`SELECT email, kind, max(match) AS match, count(*)::int AS n, min(at) AS first_at, max(at) AS last_at,
        EXISTS (SELECT 1 FROM providers p WHERE lower(p.email) = sp.email AND NOT coalesce(p.needs_setup, false)) AS has_account
      FROM signup_problems sp WHERE at > now() - make_interval(days => ${d})
      GROUP BY email, kind ORDER BY max(at) DESC LIMIT 40`;
    return rows.map(r => ({ email: r.email, kind: r.kind, what: KIND_WORDS[r.kind] || r.kind, match: r.match || null, times: r.n,
      first: r.first_at ? new Date(r.first_at).toISOString() : null, last: r.last_at ? new Date(r.last_at).toISOString() : null,
      solved: !!r.has_account || false }));
  } catch (e) { return []; }
}
