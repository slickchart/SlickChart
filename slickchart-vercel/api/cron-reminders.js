// Scheduled reminder sender — invoked by Vercel Cron (see vercel.json). Walks every
// client's synced prefs and sends web-push reminders that are due right now:
//   • 24-hour appointment reminder   (toggle: appointmentReminder)
//   • morning-of appointment reminder (toggle: appointmentDay, ~8am client-local)
//   • daily homecare nudge            (toggle: homecareReminder, ~8am client-local)
//
// Reminders are driven by data the CLIENT computed and synced (its resolved timezone and
// its parsed next-appointment timestamp), so the server never has to guess-parse a display
// string. Each reminder-instance is claimed atomically (reminder_log) so it fires once even
// though the cron runs every hour across the send window. Everything is best-effort and
// gated on the client's own notification toggles + quiet hours.
import { dbEnabled } from '../lib/db.js';
import {
  ensureClientTables, listAllClientPrefs, listPushSubs, deletePushSub, claimReminder
} from '../lib/clients.js';
import { pushConfigured, sendPushToAll } from '../lib/push.js';

const HOUR = 3600 * 1000;

// Local wall-clock hour + calendar date for a moment, in a given IANA timezone.
function localParts(tz, ms) {
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const p = f.formatToParts(new Date(ms)).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
    return { date: p.year + '-' + p.month + '-' + p.day, hour: parseInt(p.hour, 10) % 24, min: parseInt(p.minute, 10) };
  } catch (e) {
    return { date: '', hour: -1, min: 0 };
  }
}

// True if `min`-of-day falls inside the client's configured quiet hours (handles overnight wrap).
function inQuiet(notif, hour, min) {
  if (!notif || !notif.quietStart || !notif.quietEnd) return false;
  const cur = hour * 60 + min;
  const [sh, sm] = String(notif.quietStart).split(':').map(Number);
  const [eh, em] = String(notif.quietEnd).split(':').map(Number);
  const start = sh * 60 + sm, end = eh * 60 + em;
  return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return true; // no secret set → allow (Vercel Cron still only calls from its own infra)
  const h = req.headers['authorization'] || '';
  if (h === 'Bearer ' + secret) return true;                 // Vercel Cron sends this when CRON_SECRET is set
  if ((req.query && req.query.key) === secret) return true;   // manual test trigger
  return false;
}

export default async function handler(req, res) {
  if (!authorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }
  if (!pushConfigured()) { res.status(200).json({ ok: false, reason: 'push not configured' }); return; }

  const now = Date.now();
  const summary = { checked: 0, appt24: 0, apptDay: 0, homecare: 0, devices: 0 };
  try {
    await ensureClientTables();
    const rows = await listAllClientPrefs();
    for (const row of rows) {
      const prefs = row.prefs || {};
      const notif = prefs.notif || {};
      const rem = prefs.reminders || {};
      if (notif.enabled === false) continue;         // client turned notifications off
      if (!rem.tz) continue;                          // no timezone synced yet → can't place local time
      summary.checked++;

      const nowL = localParts(rem.tz, now);
      if (nowL.hour < 0) continue;
      if (inQuiet(notif, nowL.hour, nowL.min)) continue;

      const due = [];

      // 24-hour appointment reminder: appointment is between ~23h and ~25h away.
      if (notif.appointmentReminder !== false && rem.apptAt) {
        const dt = rem.apptAt - now;
        if (dt > 23 * HOUR && dt <= 25 * HOUR) {
          due.push({
            rkey: 'appt24:' + rem.apptAt,
            title: 'Appointment tomorrow',
            body: (rem.treatment ? rem.treatment + ' ' : 'Your appointment ') + (rem.apptLabel ? '· ' + rem.apptLabel : '') + '. See you then!'
          });
        }
      }
      // Morning-of reminder: appointment is later today (client-local) and it's the 8 o'clock hour.
      if (notif.appointmentDay !== false && rem.apptAt && nowL.hour === 8) {
        const apptL = localParts(rem.tz, rem.apptAt);
        if (apptL.date === nowL.date && rem.apptAt > now) {
          due.push({
            rkey: 'apptday:' + apptL.date,
            title: 'Appointment today',
            body: (rem.treatment ? rem.treatment + ' ' : 'Your appointment ') + (rem.apptLabel ? '· ' + rem.apptLabel : '') + '. Looking forward to seeing you!'
          });
        }
      }
      // Daily homecare nudge at ~8am local, for clients who have a homecare routine.
      if (notif.homecareReminder !== false && rem.hasHomecare && nowL.hour === 8) {
        due.push({
          rkey: 'homecare:' + nowL.date,
          title: 'Homecare reminder',
          body: 'A little reminder to keep up with your routine today ✨'
        });
      }

      if (!due.length) continue;
      const subs = await listPushSubs(row.client_id);
      if (!subs.length) continue;

      for (const r of due) {
        // Claim first so overlapping cron runs can't double-send; only then push.
        const fresh = await claimReminder(row.client_id, r.rkey);
        if (!fresh) continue;
        const sent = await sendPushToAll(subs, { title: r.title, body: r.body, url: '/client', tag: r.rkey, renotify: true }, deletePushSub);
        summary.devices += sent;
        if (r.rkey.startsWith('appt24')) summary.appt24++;
        else if (r.rkey.startsWith('apptday')) summary.apptDay++;
        else summary.homecare++;
      }
    }
    res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error('[cron-reminders] failed:', e && e.stack || e);
    res.status(500).json({ error: (e && e.message) || 'cron failed' });
  }
}
