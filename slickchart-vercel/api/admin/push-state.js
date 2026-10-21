// GET /api/admin/push-state  Authorization: Monitor <key>   — the founder's OWN notification setup.
// POST /api/admin/push-state?send=1                          — also send her a test notification.
//
// Why (2026-10-21): finding a missing sign-up push took Ashley six rounds of "push this live, run the
// test, send a screenshot". She asked for a better way and said Claude may read her own provider-app
// notification setup directly. So Claude reads it with the SAME owner-made, revocable, read-only key
// the daily feedback brief already uses (api/feedback.js monitorKeyOk: scoped k:'fbmon', OWNER_EMAIL,
// nonce must match the one row in feedback_monitor; making a new key or switching it off in Feedback
// Inbox kills it at once). Not a session: verifyToken refuses a scoped token everywhere else.
//
// What it can reach, and nothing more (CLAUDE.md §0):
//   • ONLY the founder's own accounts, resolved exactly as the sign-up alert resolves them
//     (FOUNDER_EMAILS -> providers.email, plus founder_accounts). Nothing in the request picks one.
//   • Device kind, when it last opened the app, the last 6 characters of its address, Google's answer,
//     and the already-masked notify_log rows. No tokens, no client or provider data.
//   • send=1 sends the founder a test notification on her own devices.
import { dbEnabled, sql } from '../../lib/db.js';
import { monitorKeyOk } from '../feedback.js';
import { pushFoundersReport, founderPushConfigured, nativePushConfigured, founderAccounts } from '../../lib/fcm.js';
import { recentNotifies } from '../../lib/notify-log.js';
import { listDeviceReports } from '../../lib/device-report.js';

function fmt(ms) {
  const n = Number(ms) || 0;
  if (!n) return '';
  try { return new Date(n).toLocaleString('en-US', { timeZone: process.env.FOUNDER_TZ || 'America/Los_Angeles' }); } catch (e) { return ''; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const q = sql();
  let okKey = false;
  try { okKey = await monitorKeyOk(req, q, owner); } catch (e) { okKey = false; }
  if (!okKey) { res.status(403).json({ error: 'This key is switched off. Copy a new one from Feedback Inbox.' }); return; }
  try {
    const out = { nativeConfigured: nativePushConfigured(), anyConfigured: founderPushConfigured() };
    if (req.method === 'POST' && String((req.query && req.query.send) || '') === '1') {
      const r = await pushFoundersReport({ title: '✅ Test push', body: 'Checking your SlickChart notifications 🎉', url: '/slickchart', tag: 'push-state' });
      out.send = {
        sent: r.sent || 0, devices: r.devices || 0, accounts: (r.providerIds || []).length, error: r.error || '',
        results: (r.results || []).map(x => ({ platform: x.platform, shape: x.shape, ok: x.ok, gone: x.gone, error: x.error, lastOpened: fmt(x.updatedAt) }))
      };
    }
    const fa = await founderAccounts();
    const emails = fa.emails;
    const ids = new Set(fa.byEmail.concat(fa.bySession)); const accounts = [];
    for (const id of fa.byEmail) accounts.push({ via: 'founder email', ref: id.slice(-4) });
    for (const id of fa.bySession) accounts.push({ via: 'signed in as founder', ref: id.slice(-4) });
    out.founderEmails = emails.length;
    out.accounts = accounts;
    const idList = Array.from(ids);
    try {
      const rows = await q`SELECT token, platform, owner_id, created_at, updated_at FROM native_push_tokens
        WHERE owner_kind = 'provider' AND owner_id = ANY(${idList}::text[]) ORDER BY updated_at DESC NULLS LAST`;
      out.phoneApps = (rows || []).map(r => ({ platform: r.platform || '', account: String(r.owner_id).slice(-4), addressEnds: String(r.token || '').slice(-6), firstLinked: fmt(r.created_at), lastOpened: fmt(r.updated_at) }));
    } catch (err) { out.phoneAppsNote = 'unreadable'; }
    try {
      const w = await q`SELECT provider_id, created_at FROM provider_push_subscriptions WHERE provider_id = ANY(${idList}::text[])`;
      out.browsers = (w || []).map(r => ({ account: String(r.provider_id).slice(-4), linked: fmt(r.created_at) }));
    } catch (err) { out.browsers = []; }
    // Every device she has actually USED, from its own health report, and whether it is on the alert
    // list. A phone opened recently whose address is not on the list is exactly the silent failure
    // behind four rounds of "my sign-up push stopped" (2026-10-21), so it is spelled out in `problems`.
    out.devices = []; out.problems = [];
    const linkedEnds = new Set((out.phoneApps || []).map(a => a.addressEnds));
    for (const id of idList) {
      let reps = [];
      try { reps = await listDeviceReports(id); } catch (err) { reps = []; }
      for (const r of reps || []) {
        const rep = r.report || {};
        const at = new Date(r.updated_at).getTime() || 0;
        const d = { account: id.slice(-4), platform: rep.platform || '', kind: rep.kind || '', build: rep.build || '', lastSeen: fmt(at),
          pushPerm: rep.pushPerm || '', pushPost: rep.pushPost || '', pushEnds: rep.pushEnds || '',
          onAlertList: rep.native ? (rep.pushEnds ? linkedEnds.has(rep.pushEnds) : false) : null };
        out.devices.push(d);
        if (rep.native && Date.now() - at < 3 * 86400000 && !d.onAlertList) {
          out.problems.push(d.platform + ' app used ' + d.lastSeen + ' is NOT on the alert list (permission ' + (d.pushPerm || '?') + ', last save ' + (d.pushPost || 'none') + ', build ' + d.build + ')');
        }
      }
    }
    if (out.nativeConfigured && !(out.phoneApps || []).length) out.problems.push('no phone app is linked for alerts at all');
    try { out.recentAlerts = await recentNotifies(20); } catch (err) { out.recentAlerts = []; }
    res.status(200).json(out);
  } catch (e) {
    console.error('[admin/push-state] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
