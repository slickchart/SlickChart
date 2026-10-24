// GET /api/admin/new-providers?days=14   Authorization: Monitor <key>  (or a founder session)
// Every provider who signed up in the last N days (max 30) and how their first days are going, read
// from what the server already holds, so a new provider who "keeps getting kicked out" is diagnosed
// WITHOUT asking her or the founder anything (CLAUDE.md §4d; 2026-10-24, the third new provider in
// three days whose app closed on her).
//
// Per account: when it was made, the plan, every sign-in session (device label, first/last seen,
// signed out or not), what the account has saved (key NAMES and sizes only, never values), each
// device's own health report, and each phone's launch log. Counts and labels only; no client data,
// no notes, no IPs. Emails are masked. Read-only, same owner-made revocable key as push-state.
import { dbEnabled, sql, ensureProvidersTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { ensureAppLaunchTable, maskEmail } from '../../lib/app-launch-log.js';
import { ensureDeviceReportsTable } from '../../lib/device-report.js';

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

const T = v => (v ? new Date(v).toISOString() : null);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const q = sql();
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  let ok = false;
  try { ok = (await monitorKeyOk(req, q, owner)) || (await founderSession(req, q)); } catch (e) { ok = false; }
  if (!ok) { res.status(403).json({ error: 'Owner-only.' }); return; }
  const days = Math.max(1, Math.min(30, parseInt((req.query && req.query.days) || '14', 10) || 14));
  await ensureProvidersTable();
  const provs = await q`SELECT id, email, verified, created_at FROM providers
                        WHERE created_at > now() - make_interval(days => ${days}) ORDER BY created_at DESC LIMIT 40`;
  const out = [];
  for (const p of provs) {
    const pid = String(p.id);
    const one = { account: maskEmail(p.email), created: T(p.created_at), verified: !!p.verified };
    try { const s = await q`SELECT status, cancel_at_period_end FROM subscriptions WHERE lower(email) = lower(${p.email})`; one.plan = s.length ? s[0].status + (s[0].cancel_at_period_end ? ' (cancelling)' : '') : 'none'; } catch (e) { one.plan = '?'; }
    try {
      const s = await q`SELECT device, created_at, last_seen_at, revoked FROM sessions WHERE provider_id = ${pid} ORDER BY created_at DESC LIMIT 20`;
      one.sessions = s.map(r => ({ device: r.device, signedIn: T(r.created_at), lastSeen: T(r.last_seen_at), signedOut: !!r.revoked }));
    } catch (e) { one.sessions = '?'; }
    try {
      const k = await q`SELECT k, length(v) AS n, updated_at FROM kv WHERE owner = ${pid} ORDER BY updated_at DESC LIMIT 120`;
      one.saved = { keys: k.length, onboarded: k.some(r => r.k === 'sc_onboarded'), lastSave: k.length ? T(k[0].updated_at) : null,
        names: k.slice(0, 60).map(r => String(r.k).slice(0, 40) + ':' + (Number(r.n) || 0)) };
    } catch (e) { one.saved = '?'; }
    try {
      await ensureDeviceReportsTable();
      const d = await q`SELECT device_key, report, updated_at FROM device_reports WHERE provider_id = ${pid} ORDER BY updated_at DESC LIMIT 12`;
      one.devices = d.map(r => { const rep = { ...(r.report || {}) }; delete rep.email; return { device: String(r.device_key).slice(-6), updated: T(r.updated_at), ...rep }; });
    } catch (e) { one.devices = '?'; }
    try {
      await ensureAppLaunchTable();
      const l = await q`SELECT device_key, platform, os, build, events, updated_at FROM app_launch_logs WHERE provider_id = ${pid} ORDER BY updated_at DESC LIMIT 8`;
      one.launches = l.map(r => ({ device: String(r.device_key).slice(-6), platform: r.platform, os: r.os, build: r.build, updated: T(r.updated_at), events: r.events || [] }));
    } catch (e) { one.launches = '?'; }
    out.push(one);
  }
  res.status(200).json({ days, providers: out });
}
