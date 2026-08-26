// Scheduled PRE-VISIT CHECK-IN auto-sender — invoked by Vercel Cron (see vercel.json).
//
// For every provider who has connected their own Square AND has check-in auto-send ON, this looks at
// their upcoming Square appointments and, ~24h before each one, sends the client their pre-visit
// check-in THROUGH THE APP'S MESSAGING SYSTEM (a provider_message written into the client's real
// thread) plus a push, so it lands even when nobody's app is open. It only messages clients who
// actually have the app (they've opened their care space or have a push subscription) — clients who
// aren't in the app are left for the provider's manual "text the check-in" nudge on their home screen.
//
// Provider-driven (reads the provider's Square appointments), so it does NOT depend on the client
// having recently opened their app to sync anything. Each (client, booking) is claimed atomically in
// reminder_log so it sends exactly once even though the cron runs hourly across the 24h window.
import { dbEnabled, sql, getKVValue } from '../lib/db.js';
import { ensureClientTables, listPushSubs, deletePushSub, claimReminder, logEvent } from '../lib/clients.js';
import { getConnection, squareFetch } from '../lib/square.js';
import { pushConfigured, sendPushToAll } from '../lib/push.js';
import { sendNativeToClient, fcmConfigured } from '../lib/fcm.js';

const HOUR = 3600 * 1000;
const CI_TEXT = 'Hi! Just a quick reminder to complete your pre-visit check-in before your visit so I’m all set for you ✨ Tap to open it — it only takes about 2 minutes.';
const DEAD = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SELLER', 'DECLINED', 'NO_SHOW'];

function digits(s) { let d = String(s || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; }

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;                                  // fail closed — never publicly invokable
  const h = req.headers['authorization'] || '';
  if (h === 'Bearer ' + secret) return true;                 // Vercel Cron sends this
  if ((req.query && req.query.key) === secret) return true;   // manual test trigger
  return false;
}

// Does this provider have check-in auto-send on? Defaults ON to match the app default.
async function autoSendOn(providerId) {
  try {
    let v = await getKVValue(providerId, 'sc_checkin_cfg');
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
    if (v && v.autoSend) return v.autoSend.on !== false;
  } catch (e) {}
  return true;
}

export default async function handler(req, res) {
  if (!authorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }

  const now = Date.now();
  const summary = { providers: 0, appts: 0, sent: 0, devices: 0 };
  try {
    await ensureClientTables();
    const q = sql();
    const conns = await q`SELECT provider_id FROM square_connections`;
    for (const row of (conns || [])) {
      const provider = row.provider_id;
      if (!provider) continue;
      if (!(await autoSendOn(provider))) continue;
      let conn = null;
      try { conn = await getConnection(provider); } catch (e) {}
      if (!conn || !conn.token) continue;

      // Upcoming bookings in the next ~26h (a little past 24 so nothing near the edge is missed).
      const startMin = new Date(now).toISOString();
      const startMax = new Date(now + 26 * HOUR).toISOString();
      let bookings = [], locIds = [];
      try { const loc = await squareFetch('/v2/locations', {}, conn.token); locIds = (loc.locations || []).map(l => l.id).filter(Boolean); } catch (e) {}
      const seen = new Set();
      const pull = async (qs) => {
        try { const d = await squareFetch('/v2/bookings?' + qs.toString(), {}, conn.token); for (const b of (d.bookings || [])) { if (b && b.id && !seen.has(b.id)) { seen.add(b.id); bookings.push(b); } } } catch (e) {}
      };
      for (const lid of locIds) await pull(new URLSearchParams({ location_id: lid, start_at_min: startMin, start_at_max: startMax, limit: '100' }));
      await pull(new URLSearchParams({ start_at_min: startMin, start_at_max: startMax, limit: '100' }));
      const live = bookings.filter(b => b && !DEAD.includes(b.status) && b.customer_id && b.start_at);
      if (!live.length) continue;

      // Only appointments inside the ~24h-before window. Dedup makes it fire once, at the first hourly
      // run after the appointment crosses 24h away (or immediately for a same-day booking).
      const due = live.filter(b => { const t = new Date(b.start_at).getTime() || 0; const hrs = (t - now) / HOUR; return hrs > 0 && hrs <= 24; });
      if (!due.length) continue;
      summary.providers++;

      // The provider's own client roster, once, so we can match a Square customer to a SlickChart
      // client record (with a link token) by email or phone without a query per booking.
      let clients = [];
      try { clients = await q`SELECT id, token, email, phone, opened_at FROM clients WHERE provider_id = ${provider} AND deleted_at IS NULL`; } catch (e) { continue; }
      const byEmail = new Map(), byPhone = new Map();
      for (const c of (clients || [])) {
        const em = String(c.email || '').trim().toLowerCase(); if (em && !byEmail.has(em)) byEmail.set(em, c);
        const ph = digits(c.phone); if (ph.length >= 7 && !byPhone.has(ph)) byPhone.set(ph, c);
      }

      // Resolve each due booking's customer contact (one lookup per unique customer).
      const custIds = [...new Set(due.map(b => b.customer_id))];
      const cust = {};
      for (const id of custIds) { try { const cd = await squareFetch('/v2/customers/' + id, {}, conn.token); if (cd.customer) cust[id] = cd.customer; } catch (e) {} }

      for (const b of due) {
        const cu = cust[b.customer_id]; if (!cu) continue;
        const em = String(cu.email_address || '').trim().toLowerCase();
        const ph = digits(cu.phone_number);
        const cl = (em && byEmail.get(em)) || (ph.length >= 7 && byPhone.get(ph)) || null;
        if (!cl || !cl.token) continue;   // not one of their SlickChart clients (or no link) → skip

        // Must actually HAVE the app — opened their care space, or has a push subscription. Clients who
        // aren't in the app are handled by the provider's manual "text the check-in" nudge instead.
        let subs = [];
        try { subs = await listPushSubs(cl.id); } catch (e) {}
        const hasApp = !!cl.opened_at || (subs && subs.length > 0);
        if (!hasApp) continue;

        // Exactly-once per (client, booking).
        const fresh = await claimReminder(cl.id, 'cicron:' + b.id);
        if (!fresh) continue;
        summary.appts++;

        // 1) Send it through the app's messaging system (persists in the client's thread).
        try { await logEvent(provider, cl.id, 'provider_message', { text: CI_TEXT, photos: [], auto: true, checkin: true }); summary.sent++; } catch (e) {}

        // 2) Push so it surfaces even with the app closed. Deep-link the tap to the check-in screen.
        const dlUrl = '/client?s=previsit';
        const payload = { title: 'Pre-visit check-in', body: 'Please take 2 minutes for your check-in before your visit ✨', url: dlUrl, tag: 'checkin:' + b.id, renotify: true, screen: 'previsit' };
        let n = 0;
        if (pushConfigured() && subs.length) { try { n += await sendPushToAll(subs, payload, deletePushSub); } catch (e) {} }
        if (fcmConfigured()) { try { n += await sendNativeToClient(cl.id, payload); } catch (e) {} }
        summary.devices += n;
      }
    }
    res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error('[cron-checkins] failed:', e && e.stack || e);
    res.status(500).json({ error: 'cron failed' });
  }
}
