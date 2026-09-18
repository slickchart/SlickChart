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
import { getConnection, squareFetch } from './square.js';

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
  depositLabel: ''
};

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

// What she offers, always as [{name, mins, deposit}]. Her booking-page list wins; otherwise her
// service menu; otherwise one generic option so the page is never empty.
export async function getServices(providerId, cfg) {
  if (cfg && cfg.services && cfg.services.length) return cfg.services;
  try {
    const raw = await getKVValue(providerId, 'sc_service_menu');
    const a = raw ? JSON.parse(raw) : null;
    if (Array.isArray(a)) {
      const names = a.map(s => String((s && s.name) || '').trim()).filter(Boolean).slice(0, 40).map(n => ({ name: n }));
      if (names.length) return names;
    }
  } catch (e) {}
  return [{ name: 'Appointment' }];
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
  if (conn && conn.token) {
    try {
      const startAt = new Date(dateISO + 'T00:00:00Z').toISOString();
      const endAt = new Date(new Date(dateISO + 'T00:00:00Z').getTime() + 86400000).toISOString();
      const qs = new URLSearchParams({ start_at_min: startAt, start_at_max: endAt, limit: '200' });
      if (conn.locationId) qs.set('location_id', conn.locationId);
      const d = await squareFetch('/v2/bookings?' + qs.toString(), {}, conn.token);
      (d && d.bookings || []).forEach(b => {
        const st = String(b.status || '').toUpperCase();
        if (st === 'CANCELLED_BY_CUSTOMER' || st === 'CANCELLED_BY_SELLER' || st === 'DECLINED' || st === 'NO_SHOW') return;
        const t = Date.parse(b.start_at || '');
        if (!t) return;
        const local = new Date(t);
        const s = local.getHours() * 60 + local.getMinutes();
        let mins = 0;
        (b.appointment_segments || []).forEach(seg => { mins += parseInt(seg.duration_minutes, 10) || 0; });
        out.push({ start: s - pad, end: s + (mins > 0 ? mins : dur) + pad });
      });
    } catch (e) {
      return null;   // she has Square but we could not read it — never publish a half-informed slot list
    }
  }
  return out;
}

// The times someone can actually pick for one day. [] means nothing free; null means we could not
// tell (see busyRanges) and the caller should take a request instead.
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
