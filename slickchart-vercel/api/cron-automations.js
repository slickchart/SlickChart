// Scheduled automation sender — invoked by Vercel Cron (see vercel.json). Delivers each provider's
// date-scheduled automations ("send this message to all my clients on <date> at <time>") to every one
// of that provider's clients, once, when the scheduled moment has arrived.
//
// How it works:
//   • Providers' automations sync to the KV store under key `sc_autos` (persistAutos → /api/store).
//   • Each date-triggered automation carries an absolute `sendAt` (epoch ms, computed client-side from
//     the provider's local date+time, so the server never has to guess a timezone) and an optional
//     `repeatEvery` (week/month/year) for recurring campaigns.
//   • For every automation whose occurrence is due (now within [occ, occ+GRACE]), we deliver the
//     message to each client via logEvent('provider_message') — the same path the tattoo aftercare
//     drip uses, so it lands in the client's real thread — plus a best-effort push.
//   • Each (client, automation-occurrence) is claimed atomically (reminder_log) so overlapping/hourly
//     cron runs can't double-send.
//
// Only automations that are ON, have a real `sendAt`, and a non-empty message are sent. Event-triggered
// automations (birthday / "X hours after service" / "hasn't visited in 90 days") are NOT handled here —
// they need per-client event evaluation and are left for a future job; they carry no `sendAt`, so they
// are skipped safely.
import { dbEnabled, sql, ensureTable } from '../lib/db.js';
import { ensureClientTables, listClients, claimReminder, logEvent, listPushSubs, deletePushSub } from '../lib/clients.js';
import { pushConfigured, sendPushToAll } from '../lib/push.js';
import { sendNativeToClient, fcmConfigured } from '../lib/fcm.js';

const HOUR = 3600 * 1000;
// Fire an occurrence only within this window after its scheduled time. Keeps a long-dormant or
// past-dated automation from suddenly blasting every client, while still tolerating an hourly cron
// (and a cron outage of up to ~2 days). Claim-once dedups within the window.
const GRACE = 48 * HOUR;

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;                                   // fail closed
  const h = req.headers['authorization'] || '';
  if (h === 'Bearer ' + secret) return true;                   // Vercel Cron
  if ((req.query && req.query.key) === secret) return true;    // manual test trigger
  return false;
}

// The occurrence timestamp that should fire right now (within GRACE), or null. Handles one-shot and
// week/month/year recurrence. `base` is the first scheduled moment (epoch ms).
function dueOccurrence(auto, now) {
  const base = Number(auto.sendAt) || 0;
  if (!base) return null;
  const rep = String(auto.repeatEvery || '').toLowerCase();
  // 'once' / '' → one-shot. (The editor's repeat values are once/weekly/monthly/annually.)
  if (!rep || rep === 'once') return (now >= base && now < base + GRACE) ? base : null;
  const advance = (t) => {
    if (rep.includes('week')) return t + 7 * 24 * HOUR;
    if (rep.includes('month')) { const d = new Date(t); d.setMonth(d.getMonth() + 1); return d.getTime(); }
    if (rep.includes('year') || rep.includes('annual')) { const d = new Date(t); d.setFullYear(d.getFullYear() + 1); return d.getTime(); }
    if (rep.includes('day')) return t + 24 * HOUR;
    return t + 7 * 24 * HOUR;
  };
  let occ = base, guard = 0;
  while (occ < now && guard++ < 6000) {
    const next = advance(occ);
    if (next <= occ || next > now) break;
    occ = next;
  }
  return (now >= occ && now < occ + GRACE) ? occ : null;
}

export default async function handler(req, res) {
  if (!authorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }

  const now = Date.now();
  const summary = { providers: 0, automations: 0, messages: 0, devices: 0 };
  try {
    await ensureClientTables();
    await ensureTable();                // kv table
    const q = sql();
    const rows = await q`SELECT owner, v FROM kv WHERE k = 'sc_autos'`;
    for (const row of rows) {
      const owner = row.owner;
      let autos = [];
      try { autos = JSON.parse(row.v || '[]'); } catch (e) { autos = []; }
      if (!Array.isArray(autos) || !autos.length) continue;

      const due = [];
      for (const a of autos) {
        if (!a || a.on === false) continue;
        const msg = String(a.msg || '').trim();
        if (!msg) continue;                          // event-triggered / no-message autos are skipped
        const occ = dueOccurrence(a, now);
        if (occ == null) continue;
        const autoId = a.id || (String(a.name || 'auto') + ':' + (a.sendAt || ''));
        // Optional recipient list: [] / missing → all clients; non-empty → only those client ids.
        const clientIds = Array.isArray(a.clientIds) ? a.clientIds.map(String).filter(Boolean) : null;
        due.push({ autoId, occ, msg, clientIds });
      }
      if (!due.length) continue;

      let clients = [];
      try { clients = await listClients(owner); } catch (e) { clients = []; }
      if (!clients || !clients.length) continue;
      summary.providers++;

      for (const d of due) {
        summary.automations++;
        const targetSet = (d.clientIds && d.clientIds.length) ? new Set(d.clientIds) : null;
        for (const c of clients.slice(0, 2000)) {
          const cid = c && c.id;
          if (!cid) continue;
          if (targetSet && !targetSet.has(cid)) continue;   // recipient-limited automation
          const rkey = 'auto:' + owner + ':' + d.autoId + ':' + d.occ;
          // Claim first so overlapping cron runs can't double-send to this client.
          let fresh = false;
          try { fresh = await claimReminder(cid, rkey); } catch (e) { fresh = false; }
          if (!fresh) continue;
          const first = (String(c.name || '').trim().split(/\s+/)[0]) || 'there';
          const text = d.msg.replace(/\{client_name\}/gi, first);
          try { await logEvent(owner, cid, 'provider_message', { text, photos: [], auto: true }); summary.messages++; } catch (e) {}
          // Best-effort push on either channel.
          if (pushConfigured()) {
            try { const subs = await listPushSubs(cid); if (subs && subs.length) { summary.devices += await sendPushToAll(subs, { title: 'New message', body: text.slice(0, 140), url: '/client', tag: rkey, renotify: true }, deletePushSub); } } catch (e) {}
          }
          if (fcmConfigured()) {
            try { summary.devices += await sendNativeToClient(cid, { title: 'New message', body: text.slice(0, 140), url: '/client', tag: rkey }); } catch (e) {}
          }
        }
      }
    }
    res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error('[cron-automations] failed:', e && e.stack || e);
    res.status(500).json({ error: 'cron failed' });
  }
}

// Exported for local unit tests of the scheduling logic (no DB needed).
export { dueOccurrence };
