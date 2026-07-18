// Scheduled reminder sender — invoked by Vercel Cron (see vercel.json). Walks every
// client's synced prefs and sends web-push reminders that are due right now:
//   • day-before appointment reminder (toggle: appointmentReminder, client-local morning)
//   • morning-of appointment reminder (toggle: appointmentDay, client-local morning)
//   • daily homecare nudge            (toggle: homecareReminder, client-local morning)
// "Morning" = 7–11am local. This works whether the cron runs hourly (fires once, deduped)
// or once a day (schedule that daily run inside the morning window — see vercel.json).
//
// Reminders are driven by data the CLIENT computed and synced (its resolved timezone and
// its parsed next-appointment timestamp), so the server never has to guess-parse a display
// string. Each reminder-instance is claimed atomically (reminder_log) so it fires once even
// though the cron runs every hour across the send window. Everything is best-effort and
// gated on the client's own notification toggles + quiet hours.
import { dbEnabled, sql } from '../lib/db.js';
import {
  ensureClientTables, listAllClientPrefs, listPushSubs, deletePushSub, claimReminder,
  logEvent, clearHealStartById
} from '../lib/clients.js';
import { pushConfigured, sendPushToAll } from '../lib/push.js';
import { sendNativeToClient, fcmConfigured } from '../lib/fcm.js';

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
  // Fail CLOSED: without a configured secret this endpoint would be publicly invokable and each
  // call scans the prefs table + queries push subs, so refuse rather than allow. Set CRON_SECRET
  // (Vercel Cron auto-sends it as a Bearer token) to enable the job.
  if (!secret) return false;
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
  const summary = { checked: 0, apptBefore: 0, apptDay: 0, homecare: 0, aftercare: 0, devices: 0 };
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

      // Day-based reminders fire during the client's local morning window. This works the
      // same whether the cron runs hourly (fires once, at the first morning hit — deduped)
      // or once a day (the single daily run should be scheduled for this window; see
      // vercel.json). It avoids tying the appointment reminder to an exact hours-away
      // window, which a once-daily cron would almost always miss.
      const MORNING_LO = 7, MORNING_HI = 11;
      const inMorning = nowL.hour >= MORNING_LO && nowL.hour <= MORNING_HI;
      const due = [];

      if (rem.apptAt) {
        const apptL = localParts(rem.tz, rem.apptAt);
        // Tomorrow's local calendar date by incrementing the day component (DST-safe — a fixed
        // +24h of milliseconds can skip a calendar day across a spring-forward boundary).
        const _dp = String(nowL.date || '').split('-').map(Number);
        const tomorrow = (_dp.length === 3 && _dp.every(n => !isNaN(n)))
          ? new Date(Date.UTC(_dp[0], _dp[1] - 1, _dp[2] + 1)).toISOString().slice(0, 10)
          : '';
        // Day-before reminder: appointment is on tomorrow's local calendar day.
        if (notif.appointmentReminder !== false && inMorning && apptL.date && apptL.date === tomorrow) {
          due.push({
            rkey: 'apptbefore:' + apptL.date + ':' + rem.apptAt,
            title: 'Appointment tomorrow',
            body: (rem.treatment ? rem.treatment + ' ' : 'Your appointment ') + (rem.apptLabel ? '· ' + rem.apptLabel : '') + '. See you then!'
          });
        }
        // Morning-of reminder: appointment is today (client-local). Allow a few hours' grace on the
        // "hasn't passed" check so an early appointment (at or before the 7am window start) still
        // gets its morning-of reminder at the first morning run, while ones that passed hours ago don't.
        if (notif.appointmentDay !== false && inMorning && apptL.date === nowL.date && rem.apptAt > now - 3 * HOUR) {
          due.push({
            rkey: 'apptday:' + apptL.date,
            title: 'Appointment today',
            body: (rem.treatment ? rem.treatment + ' ' : 'Your appointment ') + (rem.apptLabel ? '· ' + rem.apptLabel : '') + '. Looking forward to seeing you!'
          });
        }
      }
      // Daily homecare nudge in the local morning, for clients who have a homecare routine.
      if (notif.homecareReminder !== false && rem.hasHomecare && inMorning) {
        due.push({
          rkey: 'homecare:' + nowL.date,
          title: 'Homecare reminder',
          body: 'A little reminder to keep up with your routine today ✨'
        });
      }

      // Tattoo aftercare drip — timed healing messages measured from the session-completion
      // timestamp the provider set (clients.heal_started_at). Each stage fires once, in the
      // client's local morning, only within its own window (so a late start can't backfire an
      // earlier stage and a stale timestamp can't re-trigger).
      const healStart = Number(row.heal_started_at) || 0;
      if (healStart) {
        const DAY = 24 * HOUR;
        const elapsed = now - healStart;
        if (elapsed >= 45 * DAY) {
          try { await clearHealStartById(row.client_id); } catch (e) {}   // series complete — retire it
        } else if (row.provider_id && notif.aftercareReminder !== false && inMorning) {
          const STAGES = [
            { key: 'd1', lo: 1 * DAY, hi: 3 * DAY,
              title: 'Time to unwrap 🩹',
              body: 'Day 1: gently remove your bandage, wash with lukewarm water & fragrance-free soap, pat dry, then a thin layer of aftercare.',
              msg: 'Day 1 — you can take your bandage off now 🩹 Wash gently with lukewarm water and a fragrance-free soap, pat dry with a clean paper towel, then apply a thin layer of aftercare. Don’t re-bandage unless I gave you second-skin. Your full aftercare guide is in the app.' },
            { key: 'd3', lo: 3 * DAY, hi: 30 * DAY,
              title: 'The peeling phase 🌀',
              body: 'Around day 3: flaking and itching are normal — don’t pick or scratch. Keep it lightly moisturized.',
              msg: 'Day 3 check-in — you’re heading into the peeling & itching phase 🌀 Flaking like a sunburn is normal, and a little ink coming off in the wash is fine. Don’t pick or scratch, just tap or moisturize. Message me if it turns hot, swollen, or oozy.' },
            { key: 'm1', lo: 30 * DAY, hi: 45 * DAY,
              title: 'Send me a healed photo 📸',
              body: 'It’s been about a month — I’d love to see how your tattoo healed! Open the app to send a photo.',
              msg: 'It’s been about a month — I’d love to see how your tattoo healed! Send me a photo when you get a chance 📸 And if you spotted any soft spots, let’s book a touch-up.' },
          ];
          for (const st of STAGES) {
            if (elapsed >= st.lo && elapsed < st.hi) {
              due.push({ rkey: 'heal-' + st.key + ':' + healStart, title: st.title, body: st.body, healMsg: st.msg, isHeal: true });
            }
          }
        }
      }

      if (!due.length) continue;
      const subs = await listPushSubs(row.client_id);
      // A reminder reaches the client on EITHER channel — browser web-push and/or their native
      // app. A native-only install has no web-push subscription, so don't skip on empty `subs`
      // alone; check for a native token too before deciding there's no one to notify.
      let hasNative = false;
      if (fcmConfigured()) {
        try { const q = sql(); const nt = await q`SELECT 1 FROM native_push_tokens WHERE owner_kind='client' AND owner_id=${row.client_id} LIMIT 1`; hasNative = !!(nt && nt.length); } catch (e) {}
      }
      if (!subs.length && !hasNative) continue;

      for (const r of due) {
        // Claim first so overlapping cron runs can't double-send; only then push.
        const fresh = await claimReminder(row.client_id, r.rkey);
        if (!fresh) continue;
        // Aftercare drip also lands in the client's real message thread (as if the artist sent it),
        // so the healing guidance persists in-app, not just as a transient push.
        if (r.isHeal && row.provider_id) {
          try { await logEvent(row.provider_id, row.client_id, 'provider_message', { text: r.healMsg, photos: [], auto: true }); } catch (e) {}
        }
        const sent = await sendPushToAll(subs, { title: r.title, body: r.body, url: '/client', tag: r.rkey, renotify: true }, deletePushSub);
        let nativeSent = 0;
        if (hasNative) { try { nativeSent = await sendNativeToClient(row.client_id, { title: r.title, body: r.body, url: '/client', tag: r.rkey }); } catch (e) {} }
        summary.devices += sent + nativeSent;
        if (r.rkey.startsWith('apptbefore')) summary.apptBefore++;
        else if (r.rkey.startsWith('apptday')) summary.apptDay++;
        else if (r.isHeal) summary.aftercare++;
        else summary.homecare++;
      }
    }
    res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error('[cron-reminders] failed:', e && e.stack || e);
    console.error('[cron-reminders] failed:', e && e.message); res.status(500).json({ error: 'cron failed' });
  }
}
