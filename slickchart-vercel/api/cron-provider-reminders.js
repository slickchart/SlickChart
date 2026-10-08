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
  let cur = at;
  if (rep === 'monthly') {
    // Computed from the ORIGINAL day-of-month and clamped to the target month's length, NOT by
    // stepping setMonth() repeatedly: Jan 31 + 1 month rolls to Mar 3, and the drift accumulates
    // until the occurrence lands days away from the real date and falls outside the live window —
    // i.e. a reminder set on the 31st silently stops firing forever. Verified by occ.mjs.
    // UTC throughout, so the day is derived on the same basis as the stored instant and the reminder
    // keeps arriving at the same local time each month.
    const d0 = new Date(at);
    const day = d0.getUTCDate(), hh = d0.getUTCHours(), mm = d0.getUTCMinutes(), ss = d0.getUTCSeconds();
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

export default async function handler(req, res) {
  if (!authorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }
  if (!pushConfigured()) { res.status(200).json({ ok: false, reason: 'push not configured' }); return; }
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
        const subs = await listProviderPushSubs(o.owner);
        if (!subs.length) continue;
        const claimOwner = providerClaimKey(o.owner);
        for (const d of due) {
          let claimed = false;
          try { claimed = await claimReminder(claimOwner, d.rkey); } catch (e) { continue; }
          if (!claimed) continue;
          out.claimed++;
          let delivered = 0;
          try {
            delivered = await sendPushToAll(subs, { title: d.title, body: d.body, url: d.url },
              (id) => deleteProviderPushSubById(id));
          } catch (e) { delivered = 0; }
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
