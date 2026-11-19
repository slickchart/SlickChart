// Scheduled sender for PROVIDER reminders — the thing that makes her reminder arrive when the app is
// closed. Invoked by Vercel Cron (see vercel.json).
//
// It sends two kinds:
//   • reminders she created herself (sc_reminders), one-off or repeating
//   • consult follow-ups she set when sending a review (sc_pro_vc_invites → followUpAt)
//
// Design notes worth keeping:
//
// STATELESS REPEATS. The cron never writes back to the provider's kv rows — doing so would race her
// app's own sync and is exactly how a merge loses data. Instead a repeating reminder's occurrences
// are DERIVED from its original time plus its interval, and the dedupe key carries the occurrence
// timestamp. So "every week at 9am" needs no stored next-fire date and can never drift or
// double-send, and editing the time simply produces different keys.
//
// CLAIM BEFORE SEND. reminder_log has a unique key, so the first worker to claim an occurrence wins
// and a cron that runs every 15 minutes across a window fires each reminder exactly once. If the
// send then reaches zero devices (a transient push-service failure) the claim is released so the
// next tick retries, rather than the claim silently eating that reminder forever.
//
// A STALE WINDOW. Only occurrences within the last 48 hours fire. Without it, enabling push would
// blast every reminder whose date has ever passed.
import { dbEnabled, sql } from '../lib/db.js';
import { claimReminder, releaseReminder, ensureClientTables } from '../lib/clients.js';
import { pushConfigured, sendPushToAll } from '../lib/push.js';
import { nativePushConfigured, sendNativeToProvider } from '../lib/fcm.js';
import { withCronRun } from '../lib/cron-runs.js';
import {
  ensureProviderPushTable, listReminderOwners, listProviderPushSubs,
  deleteProviderPushSubById, providerClaimKey
} from '../lib/provider-push.js';

const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const STALE_AFTER = 2 * DAY;

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  // Fail CLOSED, same as cron-reminders: without a secret this would be publicly invokable and each
  // call scans kv and the subscription table.
  if (!secret) return false;
  const h = req.headers['authorization'] || '';
  if (h === 'Bearer ' + secret) return true;
  if ((req.query && req.query.key) === secret) return true;
  return false;
}

// Wall-clock parts of an instant in `tz`, and the instant of a wall-clock time there (two passes
// converge across a DST change, same method as lib/square.js zonedWallToUtc).
function _validTz(tz) {
  if (typeof tz !== 'string' || !tz.includes('/') || tz.length > 64) return '';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch (e) { return ''; }
}
function _wallOf(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).filter(x => x.type !== 'literal').map(x => [x.type, +x.value]));
  return { Y: p.year, M: p.month, D: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}
function _wallToUtc(Y, M, D, h, mi, s, tz) {
  const naive = Date.UTC(Y, M - 1, D, h, mi, s); let g = naive;
  for (let i = 0; i < 2; i++) { const w = _wallOf(g, tz); g = naive - (Date.UTC(w.Y, w.M - 1, w.D, w.h, w.mi, w.s) - g); }
  return g;
}
// The latest occurrence at or before `now` of a daily/weekly/monthly reminder first set for `at`,
// at the same wall-clock time in `tz`. Monthly keeps her day of the month (`dom`), clamped to short months.
function _zonedOccurrence(at, rep, tz, now, dom) {
  const w0 = _wallOf(at, tz), n = _wallOf(now, tz);
  if (rep === 'monthly') {
    const day = (dom >= 1 && dom <= 31) ? dom : w0.D;
    const mk = (y, m) => _wallToUtc(y, m, Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate()), w0.h, w0.mi, w0.s, tz);
    let y = n.Y, m = n.M, c = mk(y, m);
    if (c > now) { m -= 1; if (m < 1) { m = 12; y -= 1; } c = mk(y, m); }
    return Math.max(c, at);
  }
  const step = rep === 'daily' ? 1 : 7;
  const dn = x => Math.floor(Date.UTC(x.Y, x.M - 1, x.D) / DAY);
  const d0 = dn(w0), d1 = dn(n);
  let k = Math.floor((d1 - d0) / step), c = at;
  for (let g = 0; g < 3 && k >= 0; g++, k--) {
    const x = new Date((d0 + k * step) * DAY);
    c = _wallToUtc(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate(), w0.h, w0.mi, w0.s, tz);
    if (c <= now) break;
  }
  return Math.max(c, at);
}

// The most recent occurrence at or before `now`, or 0 if there is none in the live window.
// Repeats are derived, never stored. Monthly steps by calendar month so "the 1st" stays the 1st.
export function dueOccurrence(rem, now) {
  const at = Number(rem && rem.at) || 0;
  if (!at) return 0;
  const rep = String((rem && rem.repeat) || '');
  if (at > now) return 0;
  if (rep !== 'daily' && rep !== 'weekly' && rep !== 'monthly') {
    return (now - at <= STALE_AFTER) ? at : 0;     // one-off
  }
  // Her time zone (the app stamps it on save): repeats then keep her WALL-CLOCK time. A fixed 24 h
  // step moved "every day at 9am" to 8am for the whole winter once the clocks went back.
  const tz = _validTz(rem && rem.tz);
  if (tz) {
    let occ = 0; try { occ = _zonedOccurrence(at, rep, tz, now, Number(rem && rem.dom)); } catch (e) { occ = 0; }
    if (occ) { if (occ > now) return 0; return (now - occ <= STALE_AFTER) ? occ : 0; }
  }
  let cur = at;
  if (rep === 'monthly') {
    // Computed from the ORIGINAL day-of-month and clamped to the target month's length, NOT by
    // stepping setMonth() repeatedly: Jan 31 + 1 month rolls to Mar 3, and the drift accumulates
    // until the occurrence lands days away from the real date and falls outside the live window —
    // i.e. a reminder set on the 31st silently stops firing forever. Verified by occ.mjs.
    // UTC throughout, so the day is derived on the same basis as the stored instant and the reminder
    // keeps arriving at the same local time each month.
    const d0 = new Date(at);
    // domUtc: the day she first picked, kept by the app when Done moves a reminder past a short month.
    const du = Number(rem && rem.domUtc);
    const day = (du >= 1 && du <= 31) ? du : d0.getUTCDate(), hh = d0.getUTCHours(), mm = d0.getUTCMinutes(), ss = d0.getUTCSeconds();
    const mk = (y, m) => {
      const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();   // last day of that month
      return Date.UTC(y, m, Math.min(day, dim), hh, mm, ss);
    };
    const n = new Date(now);
    let y = n.getUTCFullYear(), m = n.getUTCMonth();
    let cand = mk(y, m);
    if (cand > now) { m -= 1; if (m < 0) { m = 11; y -= 1; } cand = mk(y, m); }
    cur = Math.max(cand, at);
    if (cur > now) return 0;
  } else {
    const step = rep === 'daily' ? DAY : 7 * DAY;
    const n = Math.floor((now - at) / step);
    cur = at + n * step;
  }
  return (now - cur <= STALE_AFTER) ? cur : 0;
}

function firstName(clients, cid) {
  try {
    const c = clients && clients[cid];
    const n = String((c && c.name) || '').trim();
    return n ? n.split(' ')[0] : '';
  } catch (e) { return ''; }
}

async function handler(req, res) {
  if (!authorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }
  const webOn = pushConfigured(), nativeOn = nativePushConfigured();
  if (!webOn && !nativeOn) { res.status(200).json({ ok: false, reason: 'push not configured' }); return; }
  const out = { owners: 0, sent: 0, claimed: 0, released: 0, errors: [] };
  try {
    await ensureClientTables();
    await ensureProviderPushTable();
    const now = Date.now();
    const owners = await listReminderOwners();
    out.owners = owners.length;
    for (const o of owners) {
      try {
        const notif = (o.notif && typeof o.notif === 'object') ? o.notif : {};
        const due = [];

        // 1. her own reminders
        const list = Array.isArray(o.reminders) ? o.reminders : [];
        list.forEach(r => {
          if (!r || !r.id || r.done) return;
          if (r.off) return;
          const occ = dueOccurrence(r, now);
          if (!occ) return;
          const who = r.clientId ? firstName(o.clients, r.clientId) : '';
          due.push({
            rkey: 'rem:' + r.id + ':' + occ,
            title: String(r.title || 'Reminder').slice(0, 80),
            body: (String(r.note || '').slice(0, 140)) || (who ? ('About ' + who) : 'Tap to open SlickChart'),
            url: r.clientId ? ('/slickchart?n=client&c=' + encodeURIComponent(r.clientId)) : '/slickchart'
          });
        });

        // 2. consult follow-ups (her own toggle governs these, like every other alert)
        if (notif.consultFollowUp !== false) {
          const inv = (o.invites && typeof o.invites === 'object') ? o.invites : {};
          Object.keys(inv).forEach(cid => {
            const v = inv[cid];
            if (!v || !v.followUpAt || v.followUpDone) return;
            const occ = dueOccurrence({ at: v.followUpAt }, now);
            if (!occ) return;
            const who = firstName(o.clients, cid) || 'your client';
            due.push({
              rkey: 'vcfu:' + cid + ':' + occ,
              title: 'Follow-up due: ' + who,
              body: 'You said you’d check in on their consult today.',
              url: '/slickchart?n=client&c=' + encodeURIComponent(cid)
            });
          });
        }

        if (!due.length) continue;
        const subs = webOn ? await listProviderPushSubs(o.owner) : [];
        const claimOwner = providerClaimKey(o.owner);
        for (const d of due) {
          let claimed = false;
          try { claimed = await claimReminder(claimOwner, d.rkey); } catch (e) { continue; }
          if (!claimed) continue;
          out.claimed++;
          let delivered = 0;
          if (subs.length) {
            try {
              delivered += (await sendPushToAll(subs, { title: d.title, body: d.body, url: d.url },
                (id) => deleteProviderPushSubById(id))) || 0;
            } catch (e) {}
          }
          // Her phones in the iPhone/Android app. sendNativeToProvider looks up only this owner's tokens.
          if (nativeOn) {
            try { delivered += (await sendNativeToProvider(o.owner, { title: d.title, body: d.body, url: d.url, tag: d.rkey })) || 0; } catch (e) {}
          }
          if (delivered > 0) out.sent += delivered;
          else { try { await releaseReminder(claimOwner, d.rkey); out.released++; } catch (e) {} }
        }
      } catch (e) { out.errors.push(String((e && e.message) || e).slice(0, 120)); }
    }
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    console.error('[cron-provider-reminders] failed:', e && e.stack || e);
    res.status(500).json({ error: 'failed' });
  }
}

// Every run is recorded (lib/cron-runs.js) so the daily health sweep can tell a job that stopped.
export default withCronRun('cron-provider-reminders', handler);
