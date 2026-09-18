// PUBLIC (no auth): someone books through a provider's public link — slickchart.app/book/<slug>.
//
// The person booking is usually NOT a client yet, which is the whole point: this is the link a
// provider puts on her website and in her Instagram bio. So we find-or-create a client record for
// her account and log a normal `booking` event — from there it is indistinguishable from an existing
// client booking from their own app, and it lands in Booking Requests with the confirm / suggest /
// decline flow that already works.
//
// ISOLATION (CLAUDE.md §0): the provider comes from the SLUG, never from the request body. The reply
// is the same whether or not that email was already on file — a public form that said "welcome back"
// would let anyone test whether a given person is one of her clients, one address at a time. Nothing
// about her, her clients or her calendar is returned beyond what the page already showed.
import { dbEnabled, sql } from '../lib/db.js';
import { getProviderBySlug } from '../lib/consult.js';
import { ensureClientTables, upsertClient, logEvent, genToken } from '../lib/clients.js';
import { getBookingConfig, getServices, getHours, openSlots, toMins, isoDay, DAY_KEYS,
         pickService, serviceMins, serviceDeposit, depositLinkFor } from '../lib/booking.js';
import { sendEmail, trustedOrigin, bookingGuestEmailHtml, bookingGuestEmailText,
         bookingProviderEmailHtml, bookingProviderEmailText } from '../lib/email.js';
import { getKVValue } from '../lib/db.js';

const _hits = new Map();
function burstOk(key, limit, windowMs) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { _hits.set(key, arr); return false; }
  arr.push(now);
  _hits.set(key, arr);
  if (_hits.size > 5000) { for (const k of _hits.keys()) { if (k !== key) _hits.delete(k); if (_hits.size <= 4000) break; } }
  return true;
}
function norm(s) { return String(s || '').trim().toLowerCase(); }
function initialsOf(n) {
  const p = String(n || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const b = req.body || {};
  const slug = norm(b.slug);
  const name = String(b.name || '').trim().slice(0, 120);
  const email = String(b.email || '').trim().slice(0, 160);
  const phone = String(b.phone || '').trim().slice(0, 40);
  const service = String(b.service || '').trim().slice(0, 120);
  const date = isoDay(b.date);
  const time = String(b.time || '').trim().slice(0, 20);
  const note = String(b.note || '').trim().slice(0, 1000);

  if (!slug) { res.status(400).json({ error: 'Missing link.' }); return; }
  if (!name) { res.status(400).json({ error: 'Please add your name.' }); return; }
  if (!email || !/.+@.+\..+/.test(email)) { res.status(400).json({ error: 'Please add a valid email.' }); return; }
  if (!date || toMins(time) == null) { res.status(400).json({ error: 'Please pick a day and a time.' }); return; }

  const ip = String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim() || 'ip';
  if (!burstOk('bk:' + ip, 6, 60000) || !burstOk('bkslug:' + slug, 30, 60000)) {
    res.status(429).json({ error: 'Too many requests — please try again in a minute.' });
    return;
  }

  try {
    const prov = await getProviderBySlug(slug);
    if (!prov) { res.status(404).json({ error: 'This booking link is not active.' }); return; }
    const cfg = await getBookingConfig(prov.id);
    if (!cfg.on) { res.status(404).json({ error: 'This booking link is not active.' }); return; }

    // The time has to be one she actually offers — a request is not a free-text field into her diary.
    const hours = await getHours(prov.id);
    if (!hours) { res.status(409).json({ error: 'This provider has not set their hours yet.' }); return; }
    const services = await getServices(prov.id, cfg);
    const svc = pickService(services, service);
    const mins = serviceMins(svc, cfg);
    const within = (function () {
      const d = new Date(date + 'T12:00:00');
      if (isNaN(d)) return false;
      const h = hours[DAY_KEYS[d.getDay()]];
      if (!h || !h.open) return false;
      const t = toMins(time), o = toMins(h.start), c = toMins(h.end);
      // The whole appointment has to finish inside her hours, not merely start inside them.
      return t != null && o != null && c != null && t >= o && (t + mins) <= c;
    })();
    if (!within) { res.status(409).json({ error: 'That time is outside their hours. Please pick another.' }); return; }

    // Not in the past, not beyond how far ahead she takes bookings.
    const at = new Date(date + 'T00:00:00');
    at.setHours(Math.floor(toMins(time) / 60), toMins(time) % 60, 0, 0);
    if (at.getTime() < Date.now() + cfg.leadHours * 3600000) { res.status(409).json({ error: 'That time has passed or is too soon. Please pick another.' }); return; }
    if (at.getTime() > Date.now() + cfg.horizonDays * 86400000) { res.status(409).json({ error: 'That is further ahead than they take bookings.' }); return; }

    // Instant mode promises the slot is genuinely free, so re-check it at submit time rather than
    // trusting what the page showed a few minutes ago. If we cannot be certain (see busyRanges),
    // take it as a request instead of risking a double booking.
    let confirmed = false;
    if (cfg.mode === 'instant') {
      const slots = await openSlots(prov.id, date, cfg, hours, svc.name);
      if (slots === null) confirmed = false;
      else if (slots.indexOf(time) < 0) { res.status(409).json({ error: 'Sorry — that time was just taken. Please pick another.', code: 'taken' }); return; }
      else confirmed = true;
    }

    const treatment = svc.name;

    await ensureClientTables();
    const q = sql();
    // Find-or-create, scoped to THIS provider. Matching on email keeps a returning person on their
    // own chart instead of creating a duplicate every time they book.
    let clientId = '';
    try {
      const rows = await q`SELECT id FROM clients WHERE provider_id = ${prov.id} AND lower(email) = ${norm(email)} AND deleted_at IS NULL LIMIT 1`;
      if (rows[0] && rows[0].id) clientId = rows[0].id;
    } catch (e) {}
    if (!clientId) clientId = 'c_' + genToken().slice(0, 10);
    await upsertClient(prov.id, {
      id: clientId, name, email, phone,
      data: { profile: { email, phone }, initials: initialsOf(name), source: 'booking-link' }
    });

    let lbl = date;
    try { lbl = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) {}
    await logEvent(prov.id, clientId, 'booking', {
      treatment, date, dateLabel: lbl, time, dur: mins,
      note, via: 'booking-link', autoConfirmed: confirmed
    });

    const when = lbl + ' at ' + time;

    // A deposit, if she asks for one and has Square to take it. Never fatal: a link we could not mint
    // must not cost her the appointment — she can chase it herself.
    let depositUrl = '', depositAmount = serviceDeposit(svc, cfg);
    if (depositAmount > 0) {
      try { depositUrl = await depositLinkFor(prov.id, { amount: depositAmount, serviceName: treatment, email, clientId }); }
      catch (e) { depositUrl = ''; }
    }
    const depositLabel = depositUrl
      ? (cfg.depositLabel || ('A $' + depositAmount + ' deposit holds this appointment.'))
      : '';

    // Emails. Both are optional — a provider on Square already gets confirmations from Square and
    // would otherwise receive two of everything (Ashley's note). Neither failure affects the booking:
    // it is already recorded, and an email that did not send must not turn a successful booking into
    // an error on the person's screen.
    let biz = {};
    try { const raw = await getKVValue(prov.id, 'sc_bizinfo'); if (raw) biz = JSON.parse(raw) || {}; } catch (e) {}
    const bizName = String(biz.name || prov.name || 'Your appointment').trim();
    const addr = [biz.address, biz.city, biz.state].filter(Boolean).join(', ');
    if (cfg.emailGuest !== false) {
      try {
        await sendEmail({
          to: email,
          replyTo: prov.email || undefined,   // answering reaches HER, not our support inbox
          subject: (confirmed ? 'Booked: ' : 'Request sent: ') + when + ' — ' + bizName,
          html: bookingGuestEmailHtml({ bizName, name, when, treatment, confirmed, note: cfg.note, depositUrl, depositLabel, address: addr, phone: biz.phone }),
          text: bookingGuestEmailText({ bizName, name, when, treatment, confirmed, note: cfg.note, depositUrl, depositLabel, address: addr, phone: biz.phone })
        });
      } catch (e) { console.error('[book-request] guest email failed:', e && e.message); }
    }
    if (cfg.emailMe !== false && prov.email) {
      try {
        await sendEmail({
          to: prov.email,
          replyTo: email,                      // so she can just hit reply to reach them
          subject: (confirmed ? 'Booked: ' : 'Booking request: ') + name + ' — ' + when,
          html: bookingProviderEmailHtml({ name, email, phone, when, treatment, confirmed, note, link: trustedOrigin() + '/slickchart' }),
          text: bookingProviderEmailText({ name, email, phone, when, treatment, confirmed, note, link: trustedOrigin() + '/slickchart' })
        });
      } catch (e) { console.error('[book-request] provider email failed:', e && e.message); }
    }

    res.status(200).json({ ok: true, confirmed, when, treatment, depositUrl, depositLabel });
  } catch (e) {
    console.error('[book-request] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
