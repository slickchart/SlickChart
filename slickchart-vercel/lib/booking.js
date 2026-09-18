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
  slotMins: 60,
  leadHours: 12,        // no same-hour surprises; she needs notice
  horizonDays: 60,      // how far ahead the page will let someone book
  services: [],         // names only; empty means "use her service menu"
  note: '',
  requirePhone: true
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
      cfg.leadHours = clampInt(o.leadHours, 0, 720, DEFAULT_CONFIG.leadHours);
      cfg.horizonDays = clampInt(o.horizonDays, 1, 365, DEFAULT_CONFIG.horizonDays);
      cfg.note = String(o.note || '').slice(0, 400);
      cfg.requirePhone = o.requirePhone !== false;
      if (Array.isArray(o.services)) {
        cfg.services = o.services.map(s => String((s && s.name) || s || '').trim()).filter(Boolean).slice(0, 40);
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

// What she offers. Her chosen list wins; otherwise her service menu; otherwise one generic option.
export async function getServices(providerId, cfg) {
  if (cfg && cfg.services && cfg.services.length) return cfg.services;
  try {
    const raw = await getKVValue(providerId, 'sc_service_menu');
    const a = raw ? JSON.parse(raw) : null;
    if (Array.isArray(a)) {
      const names = a.map(s => String((s && s.name) || '').trim()).filter(Boolean).slice(0, 40);
      if (names.length) return names;
    }
  } catch (e) {}
  return ['Appointment'];
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
export async function busyRanges(providerId, dateISO, defaultMins) {
  const out = [];
  const dur = Math.max(5, parseInt(defaultMins, 10) || 60);

  // 1. Appointments made in the app.
  try {
    const raw = await getKVValue(providerId, 'sc_manual_appts');
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      arr.forEach(a => {
        if (!a || isoDay(a.date) !== dateISO) return;
        const s = toMins(a.time);
        if (s == null) return;
        out.push({ start: s, end: s + (parseInt(a.dur, 10) > 0 ? parseInt(a.dur, 10) : dur) });
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
        out.push({ start: s, end: s + (mins > 0 ? mins : dur) });
      });
    } catch (e) {
      return null;   // she has Square but we could not read it — never publish a half-informed slot list
    }
  }
  return out;
}

// The times someone can actually pick for one day. [] means nothing free; null means we could not
// tell (see busyRanges) and the caller should take a request instead.
export async function openSlots(providerId, dateISO, cfg, hours) {
  const day = isoDay(dateISO);
  if (!day) return [];
  const hrs = hours || await getHours(providerId);
  if (!hrs) return [];
  const dk = dayKeyOf(day);
  const h = dk && hrs[dk];
  if (!h || !h.open) return [];
  const open = toMins(h.start), close = toMins(h.end);
  if (open == null || close == null || close <= open) return [];

  const busy = await busyRanges(providerId, day, cfg.slotMins);
  if (busy === null) return null;

  // Not in the past, and not inside her notice window.
  const earliest = Date.now() + cfg.leadHours * 3600000;
  const step = cfg.slotMins;
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
