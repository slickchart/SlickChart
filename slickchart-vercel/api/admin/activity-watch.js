// GET /api/admin/activity-watch?since=<ms>   Authorization: Monitor <key>  (or a founder session)
//
// The hourly provider-activity watch (2026-11-19). Ashley: "with accounts like frances where you are
// able to scan and see what went wrong is something we need to be doing all the time and finding +
// intervening on problems before it frusterates a provider into leaving". The daily health sweep looks
// at the last 26 hours once a morning, and the phone logs keep only each device's last 40 events, so a
// provider's bad hour was often gone (or a day old) before anyone read it. This answers ONE question
// every hour: what went wrong for a real provider since <since>?
//
// Every problem has a stable `key` (kind + masked account + the shape of the message), so the hourly
// Claude routine can tell a NEW problem from one it already handled without storing any provider data.
//
// Read-only. Masked emails, counts, screen names and the app's own (already scrubbed, cut short)
// "did not work" messages only: no client names, notes or contact details. Same owner-made, revocable
// monitor key as health-sweep / app-launches. Reads one small table at a time; nothing here reads a
// provider's kv values (§0.9: a query reading every provider's library fails once one is huge).
import { dbEnabled, sql, ensureProvidersTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { ensureAppLaunchTable, maskEmail } from '../../lib/app-launch-log.js';
import { ensureDeviceReportsTable } from '../../lib/device-report.js';
import { APP_BUILD } from '../../lib/app-build.js';
import { cutOffKinds, storageWhy } from './health-sweep.js';

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

// The shape of a message, so "Could not load 3 photos" and "Could not load 5 photos" are one problem.
export const shape = s => String(s || '').toLowerCase().replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 80);
const buildDate = b => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(b || '')); return m ? Date.parse(m[1] + 'T00:00:00Z') : 0; };

// One device's log -> problems. Pure, so it is tested without a database (scratchpad test).
// level: 'urgent' = a provider is blocked or losing work right now; 'fix' = something broke that we
// should fix; 'watch' = worth a line if it repeats.
export function deviceProblems(row, since) {
  const acct = maskEmail(row.email) || '(not signed in)';
  const web = /^web/.test(String(row.platform || ''));
  const where = (row.platform || '?') + ' ' + (row.build || '');
  const all = (Array.isArray(row.events) ? row.events : []).filter(e => e && e.e);
  const ev = all.filter(e => Number(e.t) > since);
  const out = [];
  const add = (level, kind, detail, n, examples, keyPart) => out.push({ level, kind, account: acct, device: String(row.device_key || '').slice(-4), where,
    detail, count: n, examples: examples || [], last: Math.max(...ev.map(e => Number(e.t)), 0), key: kind + '|' + acct + '|' + (keyPart == null ? '' : keyPart) });
  const of = k => ev.filter(e => e.e === k);

  // "Did not work" messages she saw, grouped by what they said.
  const groups = {};
  for (const e of of('toast-err')) { const k = shape(e.d); (groups[k] = groups[k] || []).push(e); }
  for (const [k, list] of Object.entries(groups))
    add(list.length >= 3 ? 'fix' : 'watch', 'didnt-work', 'saw "' + String(list[0].d || '').slice(0, 120) + '"' + (list.length > 1 ? ' ' + list.length + 'x' : ''), list.length, [], k);
  const errs = [...of('error'), ...of('rejection')];
  if (errs.length) {
    const eg = {}; errs.forEach(e => { const k = shape(e.d); (eg[k] = eg[k] || []).push(e); });
    for (const [k, list] of Object.entries(eg)) add('fix', 'script-error', 'app error: ' + String(list[0].d || '').slice(0, 140) + (list.length > 1 ? ' (' + list.length + 'x)' : ''), list.length, [], k);
  }
  const drop = [...of('token-dropped'), ...of('signed-out-by-server')];
  // A sign-out she asked for is logged as 'signout' first; only one the app did on its own counts.
  const asked = of('signout').length;
  if (drop.length > asked) add('urgent', 'signed-out', 'the app signed her out ' + (drop.length - asked) + 'x (' + String(drop[0].d || '').slice(0, 80) + ')', drop.length - asked);
  const big = [...of('store-413'), ...of('store-big-failed')];
  if (big.length) {
    const keys = [...new Set(big.map(e => (/^(sc_[a-z0-9_]+)/i.exec(String(e.d || '')) || [])[1] || '?'))];
    const healed = of('store-413-healed').length;
    add(healed ? 'fix' : 'urgent', 'save-refused', 'saves refused as too large ' + big.length + 'x (' + keys.join(', ') + ', last ' + String(big[big.length - 1].d || '').slice(0, 60) + ')' + (healed ? ', healed ' + healed + 'x' : ''), big.length, [], keys.join(','));
  }
  const cam = of('camera-fail');
  if (cam.length) add('fix', 'camera', 'camera did not open ' + cam.length + 'x (' + String(cam[0].d || '').slice(0, 80) + ')', cam.length);
  const off = of('offline-page-shown');
  if (off.length >= 2) add('watch', 'offline', 'offline page shown ' + off.length + 'x', off.length);
  const { midLaunch } = cutOffKinds(ev);
  if (!web && midLaunch >= 2) add('fix', 'launch-cut-off', 'the app closed while opening ' + midLaunch + 'x', midLaunch);

  // Someone at the front door who never got in: refused, or went round the screens without signing in.
  const refused = of('signin-refused'), ok = of('signin-ok').length;
  const screens = of('signin-screen').map(e => String(e.d || ''));
  if (!ok && (refused.length || screens.includes('signup'))) {
    const reasons = [...new Set(refused.map(e => String(e.d || '').slice(0, 80)))];
    const reset = screens.includes('sent');
    const stuck = refused.length >= 2 || screens.filter(s => s === 'signup').length >= 2;
    add(stuck ? 'urgent' : 'watch', 'stuck-at-door', (refused.length ? 'refused ' + refused.length + 'x' + (reasons.length ? ' ("' + reasons.join('", "') + '")' : '') : 'opened the sign-up screen and never got in')
      + (screens.includes('signup') ? ', was on Create account' : '') + (reset ? ', asked for a password reset' : '') + ', never signed in', refused.length || 1, [], reasons.map(shape).join(','));
  }
  // Gave up: launched more than twice in the window and never got past the sign-in screen.
  if (!ok && !refused.length && row.email == null && of('launch').length >= 3 && screens.length >= 3)
    add('watch', 'stuck-at-door', 'opened the app ' + of('launch').length + 'x and stayed on the sign-in screen', of('launch').length, [], 'loop');
  return out;
}

export async function runWatch(q, since) {
  const now = Date.now();
  const problems = [];
  const errors = [];
  const emails = {};
  try { (await q`SELECT id, email FROM providers`).forEach(r => { emails[r.id] = maskEmail(r.email); }); } catch (e) { errors.push('providers: ' + e.message); }
  const who = id => emails[id] || ('account …' + String(id || '').slice(-4));
  const sinceTs = new Date(since).toISOString();
  let devices = 0, accounts = new Set();

  // 1. Every app and browser log that changed since `since`.
  try {
    await ensureAppLaunchTable();
    const rows = await q`SELECT device_key, email, platform, build, events FROM app_launch_logs WHERE updated_at > ${sinceTs}`;
    devices = rows.length;
    for (const r of rows) { if (r.email) accounts.add(String(r.email).toLowerCase()); problems.push(...deviceProblems(r, since)); }
  } catch (e) { errors.push('app logs: ' + e.message); }

  // 2. Device health reports that arrived since `since` (saves not reaching the account, storage broken).
  try {
    await ensureDeviceReportsTable();
    const rows = await q`SELECT provider_id, device_key, report, updated_at FROM device_reports WHERE updated_at > ${sinceTs}`;
    const live = buildDate(APP_BUILD);
    for (const r of rows) {
      const p = r.report || {}, acct = who(r.provider_id), dev = String(r.device_key).slice(-4), where = (p.platform || '?') + ' ' + (p.kind || '');
      const add = (level, kind, detail) => problems.push({ level, kind, account: acct, device: dev, where, detail, count: 1, last: new Date(r.updated_at).getTime(), key: kind + '|' + acct + '|' + dev });
      if ((p.unsent || 0) >= 5) add('fix', 'not-saving', p.unsent + ' changes on this device not yet saved to the account');
      if ((p.memOnly || 0) > 0 || p.idbWorks === false) add('fix', 'storage', 'device storage not working' + ((p.memOnly || 0) > 0 ? ', ' + p.memOnly + ' items held only in memory' : '') + storageWhy(p));
      if (p.reloadFails) add('fix', 'reload-fails', 'screens failing to reload: ' + String(p.reloadFails).slice(0, 100));
      if ((p.evPollFails || 0) >= 3) add('fix', 'submissions', 'client forms and check-ins are not reaching this device (' + p.evPollFails + ' failed checks)');
      if ((p.storageKB || 0) > 4300) add('watch', 'storage-full', 'device storage nearly full (' + p.storageKB + ' KB of about 5000)');
      if (live && buildDate(p.build) && live - buildDate(p.build) > 5 * 86400000) add('watch', 'old-build', 'still on build ' + p.build);
    }
  } catch (e) { errors.push('device reports: ' + e.message); }

  // 3. Failed sign-ins by email (rows are cleared on a successful sign-in, so these are still out).
  try {
    const rows = await q`SELECT lower(email) AS email, count(*)::int AS n, max(ts) AS last FROM login_attempts
      WHERE ts > ${sinceTs} GROUP BY lower(email) HAVING count(*) >= 2 ORDER BY n DESC LIMIT 20`;
    const known = new Set((await q`SELECT lower(email) AS e FROM providers`).map(r => r.e));
    for (const r of rows) problems.push({ level: r.n >= 3 ? 'urgent' : 'watch', kind: 'failed-sign-in', account: maskEmail(r.email), where: 'sign-in',
      detail: r.n + ' failed sign-ins' + (known.has(r.email) ? '' : ' (no account with this email: maybe meant to create one)'), count: r.n,
      last: new Date(r.last).getTime(), key: 'failed-sign-in|' + maskEmail(r.email) });
  } catch (e) { errors.push('sign-ins: ' + e.message); }

  // 4. Sign-ups and sign-ins that went nowhere (lib/signup-rescue.js signup_problems, from build
  // 2026-11-19 on: refused sign-ups, paid but unpaid-looking, paid email with no account, typo at checkout).
  try {
    const t = await q`SELECT to_regclass('public.signup_problems') AS t`;
    if (t && t[0] && t[0].t) {
      const rows = await q`SELECT lower(email) AS email, kind, max(detail) AS detail, count(*)::int AS n, max(at) AS last FROM signup_problems
        WHERE at > ${sinceTs} GROUP BY lower(email), kind ORDER BY last DESC LIMIT 30`;
      for (const r of rows) problems.push({ level: 'urgent', kind: 'signup:' + r.kind, account: maskEmail(r.email) || '(no email)', where: 'create account / sign in',
        detail: String(r.kind) + ': ' + String(r.detail || '').slice(0, 140) + (r.n > 1 ? ' (' + r.n + 'x)' : ''), count: r.n,
        last: new Date(r.last).getTime(), key: 'signup:' + r.kind + '|' + maskEmail(r.email) });
    }
  } catch (e) { errors.push('sign-ups: ' + e.message); }

  // 5. New accounts: created in the window, and accounts 1-48 hours old that have not finished setup.
  const newAccounts = [];
  try {
    await ensureProvidersTable();
    const rows = await q`SELECT p.id, p.email, p.created_at,
        EXISTS (SELECT 1 FROM sessions s WHERE s.provider_id = p.id) AS signed_in,
        EXISTS (SELECT 1 FROM kv WHERE kv.owner = p.id AND kv.k = 'sc_onboarded') AS onboarded
      FROM providers p WHERE p.created_at > now() - interval '48 hours' ORDER BY p.created_at DESC LIMIT 40`;
    for (const r of rows) {
      const ageH = (now - new Date(r.created_at).getTime()) / 3600000;
      newAccounts.push({ account: maskEmail(r.email), created: r.created_at, ageHours: Math.round(ageH * 10) / 10, signedIn: r.signed_in, onboarded: r.onboarded });
      if (ageH >= 1 && !r.onboarded) problems.push({ level: ageH >= 3 ? 'fix' : 'watch', kind: 'setup-stuck', account: maskEmail(r.email), where: 'setup',
        detail: (r.signed_in ? 'signed in ' : 'account made but never signed in, ') + Math.round(ageH) + 'h ago and setup never finished', count: 1,
        last: new Date(r.created_at).getTime(), key: 'setup-stuck|' + maskEmail(r.email) });
    }
  } catch (e) { errors.push('new accounts: ' + e.message); }

  const rank = { urgent: 0, fix: 1, watch: 2 };
  problems.sort((a, b) => rank[a.level] - rank[b.level] || b.last - a.last);
  return { at: new Date(now).toISOString(), since: new Date(since).toISOString(), build: APP_BUILD,
    seen: { devices, accounts: accounts.size }, counts: { urgent: problems.filter(p => p.level === 'urgent').length,
      fix: problems.filter(p => p.level === 'fix').length, watch: problems.filter(p => p.level === 'watch').length },
    problems: problems.slice(0, 120), newAccounts, errors };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const q = sql();
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  let ok = false;
  try { ok = (await monitorKeyOk(req, q, owner)) || (await founderSession(req, q)); } catch (e) { ok = false; }
  if (!ok) { res.status(403).json({ error: 'Owner-only.' }); return; }
  // Default: the last 2 hours (an hourly run with room to spare). At most 7 days back.
  const s = Number(req.query && req.query.since);
  const since = Number.isFinite(s) && s > 0 ? Math.max(s, Date.now() - 7 * 86400000) : Date.now() - 2 * 3600000;
  res.status(200).json(await runWatch(q, since));
}
