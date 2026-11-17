// "Change or cancel" for someone who booked through a provider's public link (2026-11-17).
//
// Ashley asked for it after Kristen's alerts work: a person who booked from /book/<slug> had no way to
// move or cancel except replying to the confirmation email, which reached the provider as an email she
// then had to act on by hand. Every good booking app (Square, Vagaro, Fresha, GlossGenius) puts a
// "Reschedule / Cancel" link in the confirmation, with a cut-off the business chooses. This is that.
//
// ISOLATION (CLAUDE.md §0): the link carries ONE booking's event id and an HMAC over
// (provider id, event id) made with SESSION_SECRET. The provider is read from the event ROW, never from
// anything the caller sends, and the signature must match that row's provider. So a link opens exactly
// one booking, a guessed or edited link opens nothing, and nothing about any other booking, client or
// provider is reachable from it. The page shows only what the person already had in their email.
import crypto from 'crypto';
import { sql, getKVValue } from './db.js';
import { getConnection, squareFetch, resolveLocationId } from './square.js';
import { getHours, openSlots, toMins, DAY_KEYS, providerTz, slotInstant, isoDay } from './booking.js';
import { noteOwnReschedule } from './booking-alerts.js';

function secret() { return process.env.SESSION_SECRET || ''; }
function sig(providerId, eventId) {
  return crypto.createHmac('sha256', secret()).update('bkmanage|' + String(providerId) + '|' + String(eventId)).digest('base64url').slice(0, 27);
}
const ID_RE = /^[A-Za-z0-9_-]{4,140}$/;

// The token for one booking. '' when the deployment has no secret: then there is simply no link.
export function manageToken(providerId, eventId) {
  if (!secret() || !providerId || !ID_RE.test(String(eventId || ''))) return '';
  return String(eventId) + '.' + sig(providerId, eventId);
}
export function manageUrl(origin, providerId, eventId) {
  const m = manageToken(providerId, eventId);
  return m ? (String(origin || '').replace(/\/+$/, '') + '/booking/manage?m=' + encodeURIComponent(m)) : '';
}

// The booking a token opens, or null. Constant-time compare; a malformed token is just null.
export async function bookingFromToken(m) {
  if (!secret()) return null;
  const s = String(m || '');
  const dot = s.lastIndexOf('.');
  if (dot < 1) return null;
  const id = s.slice(0, dot), got = s.slice(dot + 1);
  if (!ID_RE.test(id) || !/^[A-Za-z0-9_-]{20,40}$/.test(got)) return null;
  const q = sql();
  const rows = await q`SELECT id, client_id, provider_id, payload, created_at FROM client_events
    WHERE id = ${id} AND kind = 'booking' LIMIT 1`;
  const row = rows && rows[0];
  if (!row || !row.provider_id) return null;
  const want = sig(row.provider_id, id);
  const a = Buffer.from(got), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p = row.payload;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = {}; } }
  if (!p || typeof p !== 'object' || p.via !== 'booking-link') return null;   // only bookings made from her link
  return { id: row.id, clientId: row.client_id, providerId: row.provider_id, payload: p, createdAt: Number(row.created_at) || 0 };
}

function labelOf(date) {
  try { return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { return date; }
}

// Where the booking stands NOW: its own event, then the newest change the person made, then what
// the provider decided in her app (sc_bookings, synced from her devices), whichever came last.
// status: 'pending' | 'confirmed' | 'declined' | 'cancelled'
export async function currentState(bk) {
  const p = bk.payload || {};
  const st = {
    date: p.date, time: p.time, dateLabel: p.dateLabel || labelOf(p.date), treatment: p.treatment || '',
    dur: p.dur || 60, status: p.autoConfirmed ? 'confirmed' : 'pending',
    squareBookingId: p.squareBookingId || '', lastChangeId: '', at: bk.createdAt || 0, cancelledBy: ''
  };
  const q = sql();
  try {
    const rows = await q`SELECT id, payload, created_at FROM client_events
      WHERE provider_id = ${bk.providerId} AND client_id = ${bk.clientId} AND kind = 'booking_change'
        AND payload->>'ref' = ${bk.id}
      ORDER BY created_at DESC LIMIT 1`;
    const r = rows && rows[0];
    if (r) {
      let c = r.payload; if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = {}; } }
      c = c || {};
      st.lastChangeId = r.id; st.at = Number(r.created_at) || st.at;
      if (c.action === 'cancel') { st.status = 'cancelled'; st.cancelledBy = 'client'; }
      else if (c.action === 'move') {
        st.date = c.date; st.time = c.time; st.dateLabel = c.dateLabel || labelOf(c.date);
        st.status = c.confirmed ? 'confirmed' : 'pending';
      }
      if (c.squareBookingId) st.squareBookingId = c.squareBookingId;
    }
  } catch (e) {}
  // Her decision in the app, if it is newer than the person's last change.
  try {
    const raw = await getKVValue(bk.providerId, 'sc_bookings');
    const arr = raw ? JSON.parse(raw) : null;
    // A move is a NEW entry in her Booking Requests (id = the change event's id) and the old one is
    // closed, so her decision on the CURRENT entry is the one that counts.
    const curId = st.lastChangeId || bk.id;
    const b = Array.isArray(arr) ? arr.find(x => x && x.id === curId) : null;
    if (b) {
      if (b.squareBookingId && !st.squareBookingId) st.squareBookingId = String(b.squareBookingId);
      const dec = Number(b.decidedAt) || 0;
      if (dec > st.at) {
        if (b.status === 'declined') st.status = 'declined';
        else if (b.status === 'cancelled') { st.status = 'cancelled'; st.cancelledBy = b.cancelledBy || 'provider'; }
        else if (b.status === 'confirmed') st.status = 'confirmed';
        else if (b.status === 'suggested') st.status = 'pending';
      }
    }
  } catch (e) {}
  return st;
}

// Is this a time the person may move to? Same rules as booking in the first place (book-request):
// inside her hours for the whole appointment, past her notice window, inside how far ahead she books,
// on HER clock. Instant mode also needs the time to be genuinely free. Returns {ok, confirmed} or
// {ok:false, error, code}.
export async function checkNewTime(providerId, cfg, { date, time, mins, treatment }) {
  const day = isoDay(date);
  if (!day || toMins(time) == null) return { ok: false, error: 'Please pick a day and a time.' };
  const hours = await getHours(providerId);
  if (!hours) return { ok: false, error: 'This provider has not set their hours yet.' };
  const d = new Date(day + 'T12:00:00');
  const h = hours[DAY_KEYS[d.getDay()]];
  const t = toMins(time), o = h && toMins(h.start), c = h && toMins(h.end);
  if (!h || !h.open || t == null || o == null || c == null || t < o || (t + mins) > c) {
    return { ok: false, error: 'That time is outside their hours. Please pick another.' };
  }
  let tz = null; try { tz = await providerTz(providerId, await getConnection(providerId)); } catch (e) {}
  const atMs = slotInstant(day, t, tz);
  if (atMs < Date.now()) return { ok: false, error: 'That time has already passed. Please pick another.' };
  if (atMs < Date.now() + cfg.leadHours * 3600000) return { ok: false, error: 'That is too soon. Please pick a later time.', code: 'lead' };
  if (atMs > Date.now() + cfg.horizonDays * 86400000) return { ok: false, error: 'That is further ahead than they take bookings.' };
  let confirmed = false;
  if (cfg.mode === 'instant') {
    const slots = await openSlots(providerId, day, cfg, hours, treatment);
    if (slots === null) confirmed = false;                       // cannot see her whole calendar: ask
    else if (slots.indexOf(time) < 0) return { ok: false, error: 'Sorry, that time is taken. Please pick another.', code: 'taken' };
    else confirmed = true;
  }
  return { ok: true, confirmed, day, atMs, tz };
}

// May the person still change it? Her cut-off, measured from the appointment's start on her clock.
export async function changeWindowOpen(providerId, cfg, st) {
  if (cfg.clientChanges === false) return { open: false, why: 'off' };
  let tz = null; try { tz = await providerTz(providerId, await getConnection(providerId)); } catch (e) {}
  const t = toMins(st.time);
  if (!isoDay(st.date) || t == null) return { open: true };
  const atMs = slotInstant(isoDay(st.date), t, tz);
  if (atMs < Date.now()) return { open: false, why: 'past' };
  if (atMs - Date.now() < (cfg.changeHours || 0) * 3600000) return { open: false, why: 'late' };
  return { open: true };
}

// HER Square booking for this appointment, using only her own connection (CLAUDE.md §0.2). By the id
// we stored when we know it; otherwise the one booking at that exact minute for this person's Square
// customer (a request she confirmed was booked by her app, which did not keep the id). More than one
// candidate, or none: null, and the alert tells her to change it in Square herself.
async function findSquareBooking(conn, st, email, startMs) {
  const tok = conn.token;
  if (st.squareBookingId) {
    try { const r = await squareFetch('/v2/bookings/' + encodeURIComponent(st.squareBookingId), {}, tok); if (r && r.booking) return r.booking; } catch (e) {}
  }
  if (!startMs || !isFinite(startMs)) return null;
  try {
    const locationId = await resolveLocationId(tok, conn.locationId);
    const qs = new URLSearchParams({ start_at_min: new Date(startMs - 60000).toISOString(), start_at_max: new Date(startMs + 60000).toISOString(), limit: '50' });
    if (locationId) qs.set('location_id', locationId);
    const r = await squareFetch('/v2/bookings?' + qs.toString(), {}, tok);
    const live = (r && r.bookings || []).filter(b => b && b.id && !/^CANCELLED|^DECLINED|^NO_SHOW/.test(String(b.status || '')));
    if (!live.length) return null;
    const em = String(email || '').trim();
    if (em) {
      try {
        const f = await squareFetch('/v2/customers/search', { method: 'POST', body: { limit: 5, query: { filter: { email_address: { exact: em } } } } }, tok);
        const ids = (f && f.customers || []).map(c => c.id);
        const hit = live.filter(b => ids.indexOf(b.customer_id) >= 0);
        if (hit.length === 1) return hit[0];
      } catch (e) {}
    }
    return null;
  } catch (e) { return null; }
}

// Cancel or move it in HER Square. Never throws: { done, why, squareBookingId }.
export async function squareApply(providerId, st, email, action, newStartMs) {
  let conn = null;
  try { conn = await getConnection(providerId); } catch (e) {}
  if (!conn || !conn.token) return { done: false, why: 'no square' };
  let tz = null; try { tz = await providerTz(providerId, conn); } catch (e) {}
  const t = toMins(st.time);
  const oldMs = (isoDay(st.date) && t != null) ? slotInstant(isoDay(st.date), t, tz) : 0;
  const bk = await findSquareBooking(conn, st, email, oldMs);
  if (!bk) return { done: false, why: st.squareBookingId ? 'Square did not find it' : 'not in Square' };
  try {
    if (action === 'cancel') {
      const body = { idempotency_key: ('sc-mc-' + bk.id + '-' + (bk.version || 0)).slice(0, 45) };
      if (bk.version != null) body.booking_version = bk.version;
      await squareFetch('/v2/bookings/' + encodeURIComponent(bk.id) + '/cancel', { method: 'POST', body }, conn.token);
      return { done: true, squareBookingId: bk.id };
    }
    const startAt = new Date(newStartMs).toISOString();
    const booking = { start_at: startAt };
    if (bk.version != null) booking.version = bk.version;
    const segs = (bk.appointment_segments || []).map(s => {
      const seg = { duration_minutes: s.duration_minutes, team_member_id: s.team_member_id, service_variation_id: s.service_variation_id };
      if (s.service_variation_version != null) seg.service_variation_version = s.service_variation_version;
      return seg;
    });
    if (segs.length) booking.appointment_segments = segs;
    // Our own move: the "booking updated" webhook for it must not tell her "Booking moved" a second time.
    try { await noteOwnReschedule(providerId, bk.id, startAt, null); } catch (e) {}
    const r = await squareFetch('/v2/bookings/' + encodeURIComponent(bk.id), { method: 'PUT', body: { booking } }, conn.token);
    try { if (r && r.booking) await noteOwnReschedule(providerId, bk.id, r.booking.start_at || startAt, r.booking.version); } catch (e) {}
    return { done: true, squareBookingId: bk.id };
  } catch (e) {
    return { done: false, why: String((e && e.message) || 'Square would not take it').slice(0, 160), squareBookingId: bk.id };
  }
}
