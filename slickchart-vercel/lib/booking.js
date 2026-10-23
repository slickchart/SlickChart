// Public booking link — the shared logic behind slickchart.app/book/<slug>.
//
// A provider asked for something she can put on her website and her Instagram bio, so a stranger can
// book her without being a client first. Almost none of this is new machinery: the public slug, the
// branded no-login page and the request→confirm flow already existed for virtual consults and for
// clients booking from their own app. This is the part that joins them up.
//
// TWO MODES, and the provider chooses (settings → sc_booking_page.mode):
//   'request'  — they ask for a day and time inside her posted hours; it lands in Booking Requests
//                and she confirms, suggests another time, or declines. NOTHING about her real
//                schedule is public: a stranger cannot see who she has booked or how full she is.
//   'instant'  — the page shows genuinely free times and books straight in. Better for the person
//                booking, but it necessarily reveals when she is busy. That trade is hers to make,
//                so the setting says so in plain words rather than hiding it.
//
// ISOLATION (CLAUDE.md §0): everything here is keyed on a providerId resolved from the SLUG, never
// from anything a caller sends. Nothing returns a provider's client list, a client's details, or
// even whether a given email is already on file — a public form that answered that question would
// be an enumeration oracle for her client list. Free/busy is reduced to start+end times before it
// leaves this module; the appointments it was computed from never go over the wire.
import { sql, getKVValue } from './db.js';
import { getConnection, squareFetch, listBookableServices, matchSquareService, resolveLocationId, resolveLocationTz, zonedDayRange, zonedDateKey, zonedMinutes } from './square.js';
import { getGoogleConnection, googleBusyMinutes } from './google-cal.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const DEFAULT_CONFIG = {
  on: false,
  mode: 'request',
  slotMins: 60,         // default appointment length, when a service doesn't set its own
  bufferMins: 0,        // breathing room she keeps between appointments
  leadHours: 12,        // no same-hour surprises; she needs notice
  horizonDays: 60,      // how far ahead the page will let someone book
  services: [],         // [{name, mins, deposit}]; empty means "use her service menu"
  note: '',
  requirePhone: true,
  // Square sends its own booking confirmations, so a provider using it would get two of everything.
  // Both of these are hers to switch off rather than something we decide for her.
  emailGuest: true,     // confirmation to the person booking
  emailMe: true,        // her own copy, which carries their email and phone (a push does not)
  depositOn: false,
  depositAmount: 0,     // dollars; a service can override with its own
  depositLabel: '',
  // Her OWN Square booking page (Jaimie, 2026-10-22: she takes prepayment for every service there
  // and books several services at once). When set, the Book button in her clients' app and her
  // /book/<slug> link send people there instead of SlickChart's request form.
  squareUrl: ''
};

// Only a Square booking address is accepted, https, on Square's own hosts. Her /book/<slug> link
// forwards to it, so an arbitrary address would turn slickchart.app into an open redirect.
export function normalizeSquareBookingUrl(u) {
  try {
    let v = String(u || '').trim();
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    const x = new URL(v);
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return '';
    x.protocol = 'https:';
    if (x.username || x.password || x.port) return '';
    const h = x.hostname.toLowerCase();
    const ok = ['squareup.com', 'square.site', 'square.online', 'squareupsandbox.com'].some(d => h === d || h.endsWith('.' + d));
    if (!ok) return '';
    return x.href.slice(0, 500);
  } catch (e) { return ''; }
}

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return (isFinite(n) && n >= lo && n <= hi) ? n : dflt;
}

// The provider's booking-page settings, normalised so the public page can trust every field.
export async function getBookingConfig(providerId) {
  const cfg = Object.assign({}, DEFAULT_CONFIG);
  try {
    const raw = await getKVValue(providerId, 'sc_booking_page');
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') {
      cfg.on = !!o.on;
      cfg.mode = (o.mode === 'instant') ? 'instant' : 'request';
      cfg.slotMins = clampInt(o.slotMins, 15, 480, DEFAULT_CONFIG.slotMins);
      cfg.bufferMins = clampInt(o.bufferMins, 0, 240, DEFAULT_CONFIG.bufferMins);
      cfg.leadHours = clampInt(o.leadHours, 0, 720, DEFAULT_CONFIG.leadHours);
      cfg.horizonDays = clampInt(o.horizonDays, 1, 365, DEFAULT_CONFIG.horizonDays);
      cfg.note = String(o.note || '').slice(0, 400);
      cfg.requirePhone = o.requirePhone !== false;
      cfg.emailGuest = o.emailGuest !== false;
      cfg.emailMe = o.emailMe !== false;
      cfg.depositOn = !!o.depositOn;
      cfg.depositAmount = Math.max(0, Math.min(10000, Math.round((parseFloat(o.depositAmount) || 0) * 100) / 100));
      cfg.depositLabel = String(o.depositLabel || '').slice(0, 200);
      cfg.squareUrl = normalizeSquareBookingUrl(o.squareUrl);
      // Services were names only to begin with. Both shapes are accepted, for ever — a provider who
      // set hers up before durations existed must not have her list silently emptied.
      if (Array.isArray(o.services)) {
        cfg.services = o.services.map(function (x) {
          const name = String((x && x.name) || x || '').trim();
          if (!name) return null;
          const out = { name: name.slice(0, 120) };
          const mins = clampInt(x && x.mins, 5, 480, 0);
          if (mins) out.mins = mins;
          // An explicit 0 means "no deposit on THIS one, whatever my usual is" and has to survive;
          // only an absent value falls back to her usual amount.
          const rawDep = (x && x.deposit != null && x.deposit !== '') ? parseFloat(x.deposit) : NaN;
          if (isFinite(rawDep)) out.deposit = Math.max(0, Math.min(10000, Math.round(rawDep * 100) / 100));
          return out;
        }).filter(Boolean).slice(0, 40);
      }
    }
  } catch (e) { /* unreadable settings must never take the page down — defaults are safe (off) */ }
  return cfg;
}

// Her opening hours, in the same per-day shape the app stores.
export async function getHours(providerId) {
  try {
    const raw = await getKVValue(providerId, 'sc_availability');
    const a = raw ? JSON.parse(raw) : null;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
    const out = {};
    let any = false;
    DAY_KEYS.forEach(d => {
      const v = a[d];
      if (v && typeof v === 'object') { out[d] = { open: !!v.open, start: String(v.start || '09:00'), end: String(v.end || '17:00') }; if (v.open) any = true; }
      else out[d] = { open: false, start: '09:00', end: '17:00' };
    });
    return any ? out : null;
  } catch (e) { return null; }
}

// SQUARE OWNS THE SERVICE CATALOG (Ashley's decision, 2026-10-12).
//
// She reported that the services offered on her client's "Request appointment" screen "do not match
// the service catalog". They came from `sc_service_menu`, the app's own menu, which nothing keeps in
// step with Square — so a client could request a treatment that does not exist in the catalog she
// actually books out of. Her two test requests came through as "New client", which is a name from
// that stale menu, not from her Square services.
//
// Cached per provider for a minute: the client booking screen asks for the menu once and then for
// availability per date, and a catalog walk on every one of those would be slow for no gain. The key
// is the PROVIDER ID, so one account's catalog can never be served to another (CLAUDE.md 0.1), and
// the value is only service names and durations, which her own booking page already shows publicly.
const _svcCache = new Map();
const SVC_TTL_MS = 60000;
export async function squareServices(providerId) {
  if (!providerId) return null;
  try {
    const hit = _svcCache.get(providerId);
    if (hit && (Date.now() - hit.at) < SVC_TTL_MS) return hit.list;
    let list = null;
    const conn = await getConnection(providerId);
    if (conn && conn.token) {
      const svc = await listBookableServices(conn.token);
      if (Array.isArray(svc) && svc.length) {
        list = svc.map(s => ({ name: String(s.name || '').trim(), mins: s.durationMinutes || 60 }))
                  .filter(s => s.name);
      }
    }
    if (_svcCache.size > 500) _svcCache.clear();   // bounded; it is a cache, not a store
    _svcCache.set(providerId, { at: Date.now(), list });
    return list;
  } catch (e) {
    // A Square outage must never empty her booking page. Fall through to the stored menu.
    return null;
  }
}

// HER REAL CATALOG, and nothing invented. [{name, mins?, deposit?}], possibly EMPTY.
//
// Ashley, 2026-10-12: "for providers who only use the app (no square integration) it should still be
// reading that service catalog only as well." So there are exactly two sources of truth and no third:
// Square's catalog when Square is connected, and the provider's own service menu when it is not. A
// made-up list is what put "Appointment" and "New client" in front of her clients as if she offered
// them. If a provider has listed nothing, the honest answer is an empty list and the screen says so.
export async function listServices(providerId, cfg) {
  const sq = await squareServices(providerId);
  if (sq && sq.length) return sq;
  // No Square: her own menu is the catalog. cfg.services is the same menu as curated for her public
  // booking page, so it is read first only when she has actually curated one.
  if (cfg && cfg.services && cfg.services.length) return cfg.services;
  try {
    const raw = await getKVValue(providerId, 'sc_service_menu');
    const a = raw ? JSON.parse(raw) : null;
    if (Array.isArray(a)) {
      const names = a.map(s => String((s && s.name) || '').trim()).filter(Boolean).slice(0, 40).map(n => ({ name: n }));
      if (names.length) return names;
    }
  } catch (e) {}
  return [];
}

// The PUBLIC booking page cannot render an empty service dropdown, so this is the one place allowed
// to substitute a neutral label, and only when the provider has genuinely listed nothing anywhere.
// Everything client-facing uses listServices() and shows an honest empty state instead.
export async function getServices(providerId, cfg) {
  const list = await listServices(providerId, cfg);
  return list.length ? list : [{ name: 'Appointment' }];
}
// The one she picked, matched by name. Falls back to the first, so a stale name from a cached page
// can never book a service that no longer exists.
export function pickService(services, name) {
  const want = String(name || '').trim();
  return (services || []).find(s => s.name === want) || (services || [])[0] || { name: 'Appointment' };
}
// How long this service takes, and what it needs up front.
export function serviceMins(svc, cfg) { return (svc && svc.mins) || (cfg && cfg.slotMins) || 60; }
export function serviceDeposit(svc, cfg) {
  if (!cfg || !cfg.depositOn) return 0;
  const own = (svc && svc.deposit != null) ? svc.deposit : null;
  const d = (own != null) ? own : (cfg.depositAmount || 0);
  return d > 0 ? d : 0;
}

// ── time helpers ────────────────────────────────────────────────────────────────────────────────
// Minutes since midnight, from either "14:30" or "2:30 PM" — both shapes exist in stored data.
export function toMins(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}
export function fromMins(n) {
  const h = Math.floor(n / 60), mi = n % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  let hh = h % 12; if (hh === 0) hh = 12;
  return hh + ':' + String(mi).padStart(2, '0') + ' ' + ap;
}
export function isoDay(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || '')) ? String(dateStr) : '';
}
function dayKeyOf(dateISO) {
  const d = new Date(dateISO + 'T12:00:00');
  return isNaN(d) ? '' : DAY_KEYS[d.getDay()];
}

// ── free / busy ─────────────────────────────────────────────────────────────────────────────────
// Everything already on her calendar for one day, as {start,end} minute ranges.
//
// Returns null — deliberately — when we CANNOT be sure we saw everything. The only sources are her
// SlickChart appointments (synced to the account) and, if she has connected it, Square. If the
// Square call fails we do not quietly fall back to "just the SlickChart ones": that would publish
// times she is actually booked and hand her a double booking. A caller that gets null must fall
// back to taking a request instead of showing slots.
// Her time zone: Square's location when she has Square, else the one her app saved (sc_bizinfo.tz),
// else the zone her automations were set in. Null only when nothing says, and then UTC as before.
export async function providerTz(providerId, conn) {
  try { if (conn && conn.token) { const tz = await resolveLocationTz(conn.token, conn.locationId); if (tz) return tz; } } catch (e) {}
  try { const raw = await getKVValue(providerId, 'sc_bizinfo'); const b = raw ? JSON.parse(raw) : null; if (b && typeof b.tz === 'string' && b.tz.includes('/')) return b.tz; } catch (e) {}
  try { const raw = await getKVValue(providerId, 'sc_autos'); const a = raw ? JSON.parse(raw) : []; const hit = Array.isArray(a) && a.find(x => x && typeof x.tz === 'string' && x.tz.includes('/')); if (hit) return hit.tz; } catch (e) {}
  return null;
}
export async function busyRanges(providerId, dateISO, defaultMins, bufferMins) {
  const out = [];
  const dur = Math.max(5, parseInt(defaultMins, 10) || 60);
  // Her buffer is padded onto BOTH ends of everything already booked, so a new appointment can never
  // land flush against an existing one from either side. One number, applied symmetrically, rather
  // than a "before" and an "after" she'd have to reason about.
  const pad = Math.max(0, parseInt(bufferMins, 10) || 0);

  // 1. Appointments made in the app.
  try {
    const raw = await getKVValue(providerId, 'sc_manual_appts');
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      arr.forEach(a => {
        if (!a || isoDay(a.date) !== dateISO) return;
        const s = toMins(a.time);
        if (s == null) return;
        out.push({ start: s - pad, end: s + (parseInt(a.dur, 10) > 0 ? parseInt(a.dur, 10) : dur) + pad });
      });
    }
  } catch (e) { return null; }   // her own calendar is unreadable — do not guess

  // 2. Bookings that live in Square, if she uses it.
  let conn = null;
  try { conn = await getConnection(providerId); } catch (e) { return null; }
  const tz = await providerTz(providerId, conn);
  if (conn && conn.token) {
    try {
      // Her day in her zone (this asked Square for the UTC day and read hours on the server's clock).
      const dr = zonedDayRange(dateISO, tz);
      const startAt = dr.start.toISOString();
      const endAt = new Date(dr.end.getTime() + 1000).toISOString();
      const qs = new URLSearchParams({ start_at_min: startAt, start_at_max: endAt, limit: '200' });
      if (conn.locationId) qs.set('location_id', conn.locationId);
      const d = await squareFetch('/v2/bookings?' + qs.toString(), {}, conn.token);
      (d && d.bookings || []).forEach(b => {
        const st = String(b.status || '').toUpperCase();
        if (st === 'CANCELLED_BY_CUSTOMER' || st === 'CANCELLED_BY_SELLER' || st === 'DECLINED' || st === 'NO_SHOW') return;
        const t = Date.parse(b.start_at || '');
        if (!t) return;
        if (zonedDateKey(t, tz) !== dateISO) return;
        const s = zonedMinutes(t, tz);
        let mins = 0;
        (b.appointment_segments || []).forEach(seg => { mins += parseInt(seg.duration_minutes, 10) || 0; });
        out.push({ start: s - pad, end: s + (mins > 0 ? mins : dur) + pad });
      });
    } catch (e) {
      return null;   // she has Square but we could not read it — never publish a half-informed slot list
    }
  }

  // 3. Her own life, from Google Calendar, if she connected it. This is the half of "calendar sync"
  // providers actually buy: a dentist appointment in Google has to stop a client booking that slot.
  //
  // Same rule as the two sources above, and for the same reason: if she HAS a connection and we
  // cannot read it, return null rather than publishing a slot list that does not know about her
  // morning. A double-booking costs her a client; "request a time instead" costs a few seconds.
  // An absent connection is not a failure and simply contributes nothing.
  try {
    const gconn = await getGoogleConnection(providerId);
    if (gconn) {
      const gbusy = await googleBusyMinutes(providerId, dateISO, null, tz);
      gbusy.forEach(b => { out.push({ start: b.start - pad, end: b.end + pad }); });
    }
  } catch (e) { return null; }

  // 4. Times already given away INSTANTLY by her booking link that her app has not filed into her
  // appointments yet. Without this the slot stayed open and a second person was told "Booked" too.
  try {
    const q = sql();
    const rows = await q`SELECT payload FROM client_events WHERE provider_id = ${providerId} AND kind = 'booking'
      AND payload->>'date' = ${dateISO} AND payload->>'autoConfirmed' = 'true'`;
    (rows || []).forEach(r => {
      const p = r.payload || {};
      const st = toMins(p.time);
      if (st == null) return;
      out.push({ start: st - pad, end: st + (parseInt(p.dur, 10) > 0 ? parseInt(p.dur, 10) : dur) + pad });
    });
  } catch (e) { /* no event table yet: nothing booked through the link */ }

  return out;
}

// The times someone can actually pick for one day. [] means nothing free; null means we could not
// tell (see busyRanges) and the caller should take a request instead.
// ── Her SQUARE rules win, when she has Square ───────────────────────────────────────────────────
// Ashley, 2026-10-12: "it also follows my square booking rules such as how for every treatment it
// auto-blocks one hour after, which means that on tues, thurs, saturday i only book facials at 10,
// 12, 2, and 4."
//
// The grid in openSlots below cannot produce that, and never could. It steps by the service length
// and pads only around appointments that ALREADY exist, so an empty Tuesday offers 10, 11, 12, 1, 2.
// The hour she blocks after every treatment is a SQUARE setting. So are per-service buffers, team
// member availability, and her booking notice window (the 24-hour rule that explained her "missing"
// slot on 2026-10-11). None of it is mirrored here, and mirroring it would mean asking her to
// configure the same rules twice and then keeping two copies in step forever.
//
// So: when Square is connected and the service matches one of her Square services, ASK SQUARE.
// /v2/bookings/availability/search is the same call the provider app's own Book in Square sheet
// uses, and it applies every one of those rules plus everything already booked. Returns null for
// anything it cannot answer — no Square, no matching service, an API failure — and the caller falls
// back to the computed grid, which is still the right answer for a provider with no Square at all.
export async function squareOpenSlots(providerId, dateISO, serviceName) {
  const day = isoDay(dateISO);
  if (!day) return null;
  let conn = null;
  try { conn = await getConnection(providerId); } catch (e) { return null; }
  if (!conn || !conn.token) return null;
  try {
    const services = await listBookableServices(conn.token);
    const svc = matchSquareService(services, serviceName);
    // No name match means we cannot be sure WHICH service's rules to apply, and guessing would book
    // the wrong duration. Fall back rather than answer confidently and wrongly.
    if (!svc || !svc.variationId) return null;

    const locationId = await resolveLocationId(conn.token, conn.locationId);
    if (!locationId) return null;
    const tz = await resolveLocationTz(conn.token, locationId);
    const { start: dayStart, end: dayEnd } = zonedDayRange(day, tz);
    const now = new Date();
    const startAt = (dayStart > now ? dayStart : now);
    if (startAt >= dayEnd) return [];                       // the day is already over where she is

    const body = { query: { filter: {
      start_at_range: { start_at: startAt.toISOString(), end_at: dayEnd.toISOString() },
      location_id: locationId,
      segment_filters: [{ service_variation_id: svc.variationId }]
    } } };
    const d = await squareFetch('/v2/bookings/availability/search', { method: 'POST', body }, conn.token);

    // Square answers in UTC instants. Render each one as a wall-clock time in HER timezone, in the
    // same "10:00 AM" shape fromMins() produces, so a caller cannot tell which engine answered.
    const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz || 'UTC' });
    const seen = {};
    const out = [];
    (d && d.availabilities || [])
      .map(a => a && a.start_at)
      .filter(Boolean)
      // Belt and braces, same as the provider endpoint: a slot that is not on the requested day in
      // her timezone never shows, whatever the window did.
      .filter(iso => zonedDateKey(iso, tz) === day)
      .sort()
      .forEach(iso => {
        const label = fmt.format(new Date(iso)).replace(/\u202f/g, ' ');
        if (seen[label]) return;
        seen[label] = 1;
        out.push(label);
      });
    return out;
  } catch (e) {
    return null;                                            // fall back to the computed grid
  }
}

export async function openSlots(providerId, dateISO, cfg, hours, serviceName) {
  const day = isoDay(dateISO);
  if (!day) return [];
  const hrs = hours || await getHours(providerId);
  if (!hrs) return [];
  const dk = dayKeyOf(day);
  const h = dk && hrs[dk];
  if (!h || !h.open) return [];
  const open = toMins(h.start), close = toMins(h.end);
  if (open == null || close == null || close <= open) return [];

  // Square's answer wins when it can give one: it is the only place her real booking rules live.
  const sq = await squareOpenSlots(providerId, day, serviceName);
  if (sq) {
    // Square knows her Square bookings and rules, but not her Google Calendar, the appointments she
    // keeps in SlickChart, or a time her link already gave away. Take those out too.
    try {
      const busy = await busyRanges(providerId, day, cfg.slotMins, cfg.bufferMins);
      if (!busy || !busy.length) return sq;
      const svc0 = serviceName ? pickService(await getServices(providerId, cfg), serviceName) : null;
      const len = svc0 ? serviceMins(svc0, cfg) : cfg.slotMins;
      const m12 = lbl => { const x = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(lbl).trim()); if (!x) return null; let h = (+x[1]) % 12; if (/p/i.test(x[3])) h += 12; return h * 60 + (+x[2]); };
      return sq.filter(lbl => { const t = m12(lbl); if (t == null) return true; return !busy.some(b => t < b.end && (t + len) > b.start); });
    } catch (e) { return sq; }
  }

  // How long THIS service takes. A 20-minute brow tidy and a 2-hour facial should not offer the same
  // grid, and a long one must not be offered in a gap it cannot finish inside.
  const svc = serviceName ? pickService(await getServices(providerId, cfg), serviceName) : null;
  const step = svc ? serviceMins(svc, cfg) : cfg.slotMins;

  const busy = await busyRanges(providerId, day, cfg.slotMins, cfg.bufferMins);
  if (busy === null) return null;

  // Not in the past, and not inside her notice window.
  const earliest = Date.now() + cfg.leadHours * 3600000;
  const out = [];
  for (let t = open; t + step <= close; t += step) {
    const when = new Date(day + 'T00:00:00');
    when.setHours(Math.floor(t / 60), t % 60, 0, 0);
    if (when.getTime() < earliest) continue;
    const clash = busy.some(b => t < b.end && (t + step) > b.start);
    if (!clash) out.push(fromMins(t));
    if (out.length >= 40) break;
  }
  return out;
}

// Which days are worth offering at all — used to grey out her closed days on the page.
export function openDayKeys(hours) {
  if (!hours) return [];
  return DAY_KEYS.filter(d => hours[d] && hours[d].open);
}
export { DAY_KEYS };

// ── Deposits ────────────────────────────────────────────────────────────────────────────────────
// A deposit needs somewhere for the money to actually land, and the only payment rail a provider has
// here is her own Square. So deposits are offered ONLY when Square is connected — the settings
// screen says that rather than letting her switch on something that cannot take a payment.
//
// The link is minted per booking and carries a note tying it to that person and that appointment, so
// she can see in Square what each payment was for. Failure is never fatal: the booking still stands
// and she can chase the deposit herself, which is far better than losing the appointment because a
// payment link could not be created.
export async function depositLinkFor(providerId, { amount, serviceName, email, clientId }) {
  const cents = Math.round((parseFloat(amount) || 0) * 100);
  if (!cents || cents <= 0) return '';
  let conn = null;
  try { conn = await getConnection(providerId); } catch (e) { return ''; }
  if (!conn || !conn.token) return '';
  try {
    const body = {
      idempotency_key: 'sc-dep-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
      quick_pay: {
        name: ('Deposit — ' + (serviceName || 'Appointment')).slice(0, 255),
        price_money: { amount: cents, currency: 'USD' },
        location_id: conn.locationId || undefined
      },
      payment_note: ('SCDEP:' + String(clientId || '').slice(0, 40)).slice(0, 500)
    };
    if (email) body.pre_populated_data = { buyer_email: String(email).slice(0, 160) };
    const d = await squareFetch('/v2/online-checkout/payment-links', { method: 'POST', body }, conn.token);
    return (d && d.payment_link && d.payment_link.url) || '';
  } catch (e) { return ''; }
}
// Can she offer deposits at all? The settings screen asks this so it can explain, not just refuse.
export async function depositsPossible(providerId) {
  try { const c = await getConnection(providerId); return !!(c && c.token); } catch (e) { return false; }
}
