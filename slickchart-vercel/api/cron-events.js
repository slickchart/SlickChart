// Event-based automation sender — invoked by Vercel Cron (see vercel.json). Handles the two
// event triggers that can be evaluated reliably from synced data:
//   • "On client's birthday"                 → fires once a year, in the client's morning
//   • "Client hasn't visited in 60/90 days"   → fires once, shortly after the gap crosses the threshold
//
// The appointment-relative triggers ("24h after appointment", "before appointment 24h reminder", etc.)
// are NOT handled here — those depend on appointment-completion data we don't track server-side, and the
// day-before appointment reminder is already covered by api/cron-reminders. Date-scheduled automations
// are sent by api/cron-automations. This job only touches ON, event-triggered automations with a message.
//
// Data comes from the provider's own KV blobs (the same store the date cron reads): `sc_autos` for the
// automations and `sc_clients` for the client charts (which carry birthday + last-visit). Each send is
// claimed atomically (reminder_log) so overlapping/hourly runs can't double-send.
import { dbEnabled, sql, ensureTable } from '../lib/db.js';
import { ensureClientTables, claimReminder, logEvent, listPushSubs, deletePushSub } from '../lib/clients.js';
import { pushConfigured, sendPushToAll } from '../lib/push.js';
import { sendNativeToClient, fcmConfigured } from '../lib/fcm.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// "Hasn't visited" fires only while the gap sits within this window past the threshold, so a one-time
// deploy can't blast every long-dormant client — only those who cross the line get the nudge, once.
const NOVISIT_WINDOW = 3 * DAY;
// "X after service" fires only while elapsed sits within this span past the delay — wide enough that a
// client-local morning always falls inside it (and to tolerate a cron gap), narrow enough that it's
// still "around then". Claim-once keeps it to a single send.
const AFTER_WINDOW = 2 * DAY;
// Local morning window (client's timezone) for a friendly send time. Claim-once dedups within it.
const MORNING_LO = 8, MORNING_HI = 11;

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;                                   // fail closed
  const h = req.headers['authorization'] || '';
  if (h === 'Bearer ' + secret) return true;                   // Vercel Cron
  if ((req.query && req.query.key) === secret) return true;    // manual test trigger
  return false;
}

// Local calendar date (YYYY-MM-DD), month-day (MM-DD) and hour in a given IANA timezone.
function localParts(tz, ms) {
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
    });
    const p = f.formatToParts(new Date(ms)).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
    return { year: p.year, date: p.year + '-' + p.month + '-' + p.day, md: p.month + '-' + p.day, hour: parseInt(p.hour, 10) % 24 };
  } catch (e) { return { year: '', date: '', md: '', hour: -1 }; }
}

// Birthday → "MM-DD" (ignoring year). Accepts YYYY-MM-DD, MM/DD/YYYY, MM-DD, or a parseable date string.
function birthdayMD(s) {
  s = String(s || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/); if (m) return String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
  const d = new Date(s + (/\d{4}/.test(s) ? '' : ' 2000'));
  if (!isNaN(d.getTime())) return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return '';
}

// Last-visit label → epoch ms (start of that day), or 0 if not datable / a placeholder like "—".
function lastVisitMs(s) {
  s = String(s || '').trim();
  if (!s || /^[—\-–]$/.test(s) || /never|not yet|no visit/i.test(s)) return 0;
  const d = new Date(/\d{4}/.test(s) ? s : (s + ' ' + new Date().getFullYear()));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// Classify an automation's trigger into an event kind we can evaluate, or null.
function classify(a) {
  const t = String((a && a.trigger) || '').toLowerCase();
  const n = String((a && a.name) || '').toLowerCase();
  if (/birthday/.test(t) || /birthday/.test(n)) return { kind: 'birthday' };
  const nv = t.match(/hasn.?t visited in (\d+)\s*days?/) || t.match(/(\d+)\s*days?\s*(?:since|no visit|inactive)/);
  if (nv) return { kind: 'novisit', days: parseInt(nv[1], 10) || 90 };
  // "X hours/days/weeks after <service>" — fires that long after the provider marks the visit complete
  // (session summary / payment / explicit mark). An empty/appointment/visit/service target = any service;
  // a named target (e.g. "chemical peel") only fires when the completed service matches.
  const af = t.match(/(\d+)\s*(hour|day|week)s?\s*after\s*(.*)$/);
  if (af && !/before/.test(t)) {
    const num = parseInt(af[1], 10) || 0;
    const unit = af[2];
    const mult = unit === 'hour' ? HOUR : unit === 'week' ? 7 * DAY : DAY;
    let tx = String(af[3] || '').trim().toLowerCase();
    if (!tx || /^(their\s+)?(appointment|appt|service|visit)s?$/.test(tx)) tx = '';
    if (num > 0) return { kind: 'after', ms: num * mult, treatment: tx };
  }
  return null;
}

export default async function handler(req, res) {
  if (!authorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }

  const now = Date.now();
  const summary = { providers: 0, automations: 0, birthdays: 0, novisits: 0, afters: 0, devices: 0 };
  try {
    await ensureClientTables();
    await ensureTable();                       // kv table
    const q = sql();
    const autoRows = await q`SELECT owner, v FROM kv WHERE k = 'sc_autos'`;
    if (!autoRows.length) { res.status(200).json({ ok: true, ...summary }); return; }
    // Pull every provider's client charts once, keyed by owner.
    const clientRows = await q`SELECT owner, v FROM kv WHERE k = 'sc_clients'`;
    const chartsByOwner = {};
    for (const row of clientRows) { try { chartsByOwner[row.owner] = JSON.parse(row.v || '{}') || {}; } catch (e) { chartsByOwner[row.owner] = {}; } }

    for (const row of autoRows) {
      const owner = row.owner;
      let autos = [];
      try { autos = JSON.parse(row.v || '[]'); } catch (e) { autos = []; }
      if (!Array.isArray(autos) || !autos.length) continue;
      const charts = chartsByOwner[owner] || {};
      const clientIds = Object.keys(charts);
      if (!clientIds.length) continue;

      let providerCounted = false;
      for (const a of autos) {
        if (!a || a.on === false) continue;
        if (a.sendAt) continue;                                  // date-scheduled → handled by cron-automations
        const msg = String(a.msg || '').trim();
        if (!msg) continue;
        const ev = classify(a);
        if (!ev) continue;
        const autoId = a.id || (String(a.name || 'auto') + ':event');
        const tz = a.tz || 'UTC';
        const nowL = localParts(tz, now);
        if (nowL.hour < MORNING_LO || nowL.hour > MORNING_HI) continue;   // only send in the client-local morning
        const targetSet = (Array.isArray(a.clientIds) && a.clientIds.length) ? new Set(a.clientIds.map(String)) : null;

        for (const cid of clientIds) {
          if (targetSet && !targetSet.has(cid)) continue;
          const c = charts[cid] || {};
          let rkey = null;
          if (ev.kind === 'birthday') {
            const md = birthdayMD(c.birthday);
            if (!md || md !== nowL.md) continue;
            rkey = 'evt:bday:' + owner + ':' + autoId + ':' + nowL.year + ':' + cid;
          } else if (ev.kind === 'novisit') {
            const lv = lastVisitMs(c.lastVisit);
            if (!lv) continue;
            const gap = now - lv;
            if (gap < ev.days * DAY || gap >= ev.days * DAY + NOVISIT_WINDOW) continue;   // only just-crossed
            // Key on the visit day so a future visit (new lastVisit) can re-arm the same nudge.
            rkey = 'evt:nov' + ev.days + ':' + owner + ':' + autoId + ':' + cid + ':' + Math.round(lv / DAY);
          } else if (ev.kind === 'after') {
            const svcAt = Number(c.lastServiceAt) || 0;
            if (!svcAt) continue;                                // no completed visit stamped yet
            if (ev.treatment) {                                  // treatment-specific → the done service must match
              const done = String(c.lastServiceTreatment || c.treatment || '').toLowerCase();
              if (!done.includes(ev.treatment)) continue;
            }
            const elapsed = now - svcAt;
            if (elapsed < ev.ms || elapsed >= ev.ms + AFTER_WINDOW) continue;
            // Key on the service time so a later visit re-arms the same "after service" drip.
            rkey = 'evt:aft' + ev.ms + ':' + owner + ':' + autoId + ':' + cid + ':' + Math.round(svcAt / HOUR);
          }
          if (!rkey) continue;

          let fresh = false;
          try { fresh = await claimReminder(cid, rkey); } catch (e) { fresh = false; }
          if (!fresh) continue;

          if (!providerCounted) { summary.providers++; providerCounted = true; }
          const first = (String(c.name || '').trim().split(/\s+/)[0]) || 'there';
          const biz = String(c.studio || c.businessName || '').trim();
          const txName = (ev.kind === 'after' && c.lastServiceTreatment) ? c.lastServiceTreatment : (c.treatment || 'your treatment');
          const text = msg
            .replace(/\{client_name\}/gi, first)
            .replace(/\{business_name\}/gi, biz || 'us')
            .replace(/\{treatment_name\}/gi, String(txName))
            .replace(/\{appointment_date\}/gi, 'your next visit');
          try { await logEvent(owner, cid, 'provider_message', { text, photos: [], auto: true }); } catch (e) {}
          if (ev.kind === 'birthday') summary.birthdays++; else if (ev.kind === 'novisit') summary.novisits++; else summary.afters++;

          const title = ev.kind === 'birthday' ? 'A birthday note 🎂' : 'A note from your provider';
          if (pushConfigured()) {
            try { const subs = await listPushSubs(cid); if (subs && subs.length) summary.devices += await sendPushToAll(subs, { title, body: text.slice(0, 140), url: '/client', tag: rkey, renotify: true }, deletePushSub); } catch (e) {}
          }
          if (fcmConfigured()) {
            try { summary.devices += await sendNativeToClient(cid, { title, body: text.slice(0, 140), url: '/client', tag: rkey }); } catch (e) {}
          }
        }
        summary.automations++;
      }
    }
    res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error('[cron-events] failed:', e && e.stack || e);
    res.status(500).json({ error: 'cron failed' });
  }
}

// Exported for local unit tests of the pure evaluation logic (no DB needed).
export { classify, birthdayMD, lastVisitMs, localParts };
