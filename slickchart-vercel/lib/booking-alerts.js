// Booking alerts for PROVIDERS: one place that tells a provider's own devices about a booking event.
//
// Why this exists (Kristen, 2026-11-17: "texts notifications for bookings? Just afraid to miss them in
// my email"; Ashley: "make sure all bookings/booking requests/booking changes (and anything else
// relevant) get a push notification"). Before this, only a booking from the public link and a request
// from the client app reached her phone, and only the iPhone/Android app (never a browser or
// home-screen app where she turned notifications on). A booking a client made on Square's own booking
// site, a client cancelling from Square's email, a client moving their time, and a consult request
// from her public link reached her by email or not at all.
//
// Every event goes through alertProvider(), which:
//   - honours her own switches in Notification preferences (sc_notif_settings; a switch she never saw
//     counts as ON, so an older device that never had the switch still gets the alert),
//   - claims a dedupe key so a retried webhook or a double submit never buzzes twice,
//   - reaches EVERY device she signed in on: the phone app AND web push.
//
// CLAUDE.md §0.1: every function takes the provider id its caller resolved (a verified session, her
// public-link slug, or the merchant id on a signature-checked Square webhook), and every query below
// is scoped by it. Nothing here reads an id from a request.
import { sql, dbEnabled, getKVValue } from './db.js';
import { sendNativeToProvider } from './fcm.js';
import { pushConfigured, sendPushToAll } from './push.js';
import { listProviderPushSubs, deleteProviderPushSubById } from './provider-push.js';
import { getConnection, squareFetch } from './square.js';
import { providerTz } from './booking.js';

// The switch in Notification preferences for each kind of alert. Defaults (all on) live in the app's
// notifSettings and here: a missing key means ON.
export const ALERT_PREF = {
  new: 'bookingNew',
  request: 'bookingRequest',
  changed: 'bookingChanged',
  cancelled: 'bookingCancelled',
  consult: 'consultRequest',
  payment: 'paymentReceived',
  refund: 'refundProcessed',
  // Client activity from their own app (api/client-submit). These switches were already on her
  // Notification preferences screen; until now nothing on the server read them.
  message: 'newMessage',
  product: 'productRequest',
  checkin: 'newCheckin',
  form: 'formSigned',
  vc_submit: 'photoUploaded',
  contact: 'clientDetails',
  account_deleted: 'clientDetails'
};

const TITLE = {
  new: 'New booking: ',
  request: 'Booking request: ',
  changed: 'Booking moved: ',
  change_request: 'New time requested: ',
  cancelled: 'Booking cancelled: ',
  consult: 'New consult request: ',
  payment: 'Payment received: ',
  refund: 'Refund processed: ',
  message: 'New message: ',
  product: 'Product request: ',
  checkin: 'Check-in submitted: ',
  form: 'Form signed: ',
  vc_submit: 'Photo consult submitted: ',
  vc_product: 'Product consult submitted: ',
  contact: 'Contact details updated: ',
  account_deleted: 'Client deleted their app account: '
};

let _ready = false;
async function ensureTables(q) {
  if (_ready) return;
  await q`CREATE TABLE IF NOT EXISTS booking_alert_log (
    provider_id text NOT NULL, akey text NOT NULL, at bigint, PRIMARY KEY (provider_id, akey))`;
  // The last start time and status SlickChart saw for each Square booking, so an update can be told
  // apart: moved, cancelled by the client, or nothing she needs to hear about. Ids and times only.
  await q`CREATE TABLE IF NOT EXISTS square_booking_seen (
    provider_id text NOT NULL, booking_id text NOT NULL, start_at text, status text, version int,
    at bigint, PRIMARY KEY (provider_id, booking_id))`;
  // When each kind of Square webhook last arrived (type + time, nothing else), so the setup check and
  // the health sweep can say "Square is not sending booking events" instead of the alerts silently
  // never coming.
  await q`CREATE TABLE IF NOT EXISTS square_webhook_seen (type text PRIMARY KEY, at bigint)`;
  _ready = true;
}

export async function wantsAlert(providerId, event) {
  const key = ALERT_PREF[event];
  if (!key) return true;
  try {
    const raw = await getKVValue(String(providerId), 'sc_notif_settings');
    const s = raw ? JSON.parse(raw) : null;
    if (s && typeof s === 'object' && s[key] === false) return false;
  } catch (e) {}
  return true;
}

// Push one alert to all of her devices. Returns { sent, skipped }. Never throws.
export async function alertProvider(providerId, { event, titleAs, who, detail, url, tag, key, kind, clientId, itemId }) {
  const out = { sent: 0, skipped: '' };
  if (!providerId || !dbEnabled()) { out.skipped = 'no provider'; return out; }
  try {
    if (!(await wantsAlert(providerId, event))) { out.skipped = 'off'; return out; }
    const q = sql();
    await ensureTables(q);
    if (key) {
      const rows = await q`INSERT INTO booking_alert_log (provider_id, akey, at)
        VALUES (${String(providerId)}, ${String(key).slice(0, 200)}, ${Date.now()})
        ON CONFLICT (provider_id, akey) DO NOTHING RETURNING akey`;
      if (!rows.length) { out.skipped = 'duplicate'; return out; }
    }
    const title = (TITLE[titleAs || event] || '') + (String(who || '').trim() || 'A client');
    const body = (detail ? String(detail) + '. ' : '') + 'Tap to see it in SlickChart.';
    const link = url || '/slickchart';
    try {
      out.sent += (await sendNativeToProvider(providerId, {
        title, body, url: link, tag: tag || ('booking-' + event),
        kind: kind || 'booking', clientId: clientId ? String(clientId) : '', itemId: itemId ? String(itemId) : ''
      })) || 0;
    } catch (e) {}
    if (pushConfigured()) {
      try {
        const subs = await listProviderPushSubs(providerId);
        if (subs.length) out.sent += (await sendPushToAll(subs, { title, body, url: link }, (id) => deleteProviderPushSubById(id))) || 0;
      } catch (e) {}
    }
    // Reached nothing: give the key back, so a retry (Square re-sends on its own schedule) can land.
    if (!out.sent && key) { try { await q`DELETE FROM booking_alert_log WHERE provider_id=${String(providerId)} AND akey=${String(key).slice(0, 200)}`; } catch (e) {} }
    if (!out.sent) console.warn('[booking-alerts] ' + event + ' reached 0 devices for provider=' + providerId);
  } catch (e) { console.error('[booking-alerts] failed:', e && e.message); }
  return out;
}

// "Tue, Nov 18 at 2:00 PM" on HER clock.
export function whenText(instant, tz) {
  try {
    const d = new Date(instant);
    if (isNaN(d.getTime())) return '';
    const o = { timeZone: tz || 'UTC' };
    const day = d.toLocaleDateString('en-US', { ...o, weekday: 'short', month: 'short', day: 'numeric' });
    const t = d.toLocaleTimeString('en-US', { ...o, hour: 'numeric', minute: '2-digit' });
    return day + ' at ' + t;
  } catch (e) { return ''; }
}

// ── Square bookings ──────────────────────────────────────────────────────────────────────────────
// Who made the booking decides whether she hears about it. Square sets `source`:
//   FIRST_PARTY_BUYER  her Square Online booking site, THIRD_PARTY_BUYER  Google, Instagram etc.
//   FIRST_PARTY_MERCHANT  she booked it herself in Square,  API  SlickChart booked it (she did it in
//   the app, or her public link did, and that path alerts on its own).
// So a NEW booking alerts only when a client made it. A client CANCELLING always alerts. A booking
// whose TIME CHANGED alerts unless SlickChart made the change itself (noteOwnReschedule).
export function classifySquareBooking(type, booking, prior) {
  const b = booking || {};
  const st = String(b.status || '');
  if (type === 'booking.created') {
    const src = String(b.source || '');
    const byCustomer = src === 'FIRST_PARTY_BUYER' || src === 'THIRD_PARTY_BUYER'
      || (!src && b.creator_details && b.creator_details.creator_type === 'CUSTOMER');
    if (!byCustomer) return null;
    if (st === 'PENDING') return 'request';
    if (st === 'ACCEPTED') return 'new';
    return null;
  }
  if (type === 'booking.updated') {
    if (st === 'CANCELLED_BY_CUSTOMER') return (prior && prior.status === st) ? null : 'cancelled';
    if ((st === 'ACCEPTED' || st === 'PENDING') && prior && prior.start_at && b.start_at && prior.start_at !== b.start_at) return 'changed';
    return null;
  }
  return null;
}

export async function noteWebhookSeen(type) {
  if (!type || !dbEnabled()) return;
  try { const q = sql(); await ensureTables(q); await q`INSERT INTO square_webhook_seen (type, at) VALUES (${String(type).slice(0, 60)}, ${Date.now()}) ON CONFLICT (type) DO UPDATE SET at = EXCLUDED.at`; } catch (e) {}
}

export async function webhookSeenSummary() {
  try { const q = sql(); await ensureTables(q); const rows = await q`SELECT type, at FROM square_webhook_seen ORDER BY type`; return rows.map(r => ({ type: r.type, at: Number(r.at) || 0 })); } catch (e) { return []; }
}

// SlickChart moved one of her bookings itself (api/square/reschedule-booking.js): remember the new
// time first, so Square's own "booking updated" event for it does not tell her about her own change.
export async function noteOwnReschedule(providerId, bookingId, startAt, version) {
  if (!providerId || !bookingId || !dbEnabled()) return;
  try {
    const q = sql(); await ensureTables(q);
    await q`INSERT INTO square_booking_seen (provider_id, booking_id, start_at, status, version, at)
      VALUES (${String(providerId)}, ${String(bookingId)}, ${String(startAt || '')}, ${'ACCEPTED'}, ${version == null ? null : Number(version)}, ${Date.now()})
      ON CONFLICT (provider_id, booking_id) DO UPDATE SET start_at = EXCLUDED.start_at,
        version = COALESCE(EXCLUDED.version, square_booking_seen.version), at = EXCLUDED.at`;
  } catch (e) {}
}

async function squareNames(providerId, booking) {
  const out = { who: '', service: '', tz: null };
  let conn = null;
  try { conn = await getConnection(providerId); } catch (e) {}
  try { out.tz = await providerTz(providerId, conn); } catch (e) {}
  if (!conn || !conn.token) return out;
  try {
    if (booking.customer_id) {
      const r = await squareFetch('/v2/customers/' + encodeURIComponent(booking.customer_id), {}, conn.token);
      const c = (r && r.customer) || {};
      out.who = [c.given_name, c.family_name].filter(Boolean).join(' ').trim() || c.company_name || '';
    }
  } catch (e) {}
  try {
    const seg = (booking.appointment_segments || [])[0];
    if (seg && seg.service_variation_id) {
      const r = await squareFetch('/v2/catalog/object/' + encodeURIComponent(seg.service_variation_id) + '?include_related_objects=true', {}, conn.token);
      const item = ((r && r.related_objects) || []).find(o => o && o.type === 'ITEM');
      out.service = (item && item.item_data && item.item_data.name) || (r && r.object && r.object.item_variation_data && r.object.item_variation_data.name) || '';
    }
  } catch (e) {}
  return out;
}

// One Square booking webhook for one provider. `providerId` was resolved by the webhook from the
// signed event's merchant id. Returns what it decided, for the log and the tests.
export async function handleSquareBookingEvent(providerId, evt) {
  const type = String((evt && evt.type) || '');
  const booking = evt && evt.data && evt.data.object && evt.data.object.booking;
  if (!providerId || !booking || !booking.id || !/^booking\.(created|updated)$/.test(type)) return { event: null };
  const q = sql();
  await ensureTables(q);
  const pid = String(providerId), bid = String(booking.id);
  const rows = await q`SELECT start_at, status, version FROM square_booking_seen WHERE provider_id=${pid} AND booking_id=${bid}`;
  const prior = rows[0] || null;
  const ver = booking.version == null ? null : Number(booking.version);
  // Square does not promise order. An event older than the one already seen changes nothing.
  if (prior && prior.version != null && ver != null && ver < Number(prior.version)) return { event: null, stale: true };
  if (prior && prior.version != null && ver != null && ver === Number(prior.version) && prior.start_at === booking.start_at && prior.status === booking.status) return { event: null, same: true };
  const event = classifySquareBooking(type, booking, prior);
  await q`INSERT INTO square_booking_seen (provider_id, booking_id, start_at, status, version, at)
    VALUES (${pid}, ${bid}, ${String(booking.start_at || '')}, ${String(booking.status || '')}, ${ver}, ${Date.now()})
    ON CONFLICT (provider_id, booking_id) DO UPDATE SET start_at = EXCLUDED.start_at, status = EXCLUDED.status,
      version = EXCLUDED.version, at = EXCLUDED.at`;
  if (!event) return { event: null };
  const names = await squareNames(pid, booking);
  const when = whenText(booking.start_at, names.tz);
  let detail = [names.service, when].filter(Boolean).join(', ');
  if (event === 'changed') {
    const was = whenText(prior.start_at, names.tz);
    detail = [names.service, when ? ('now ' + when) : '', was ? ('was ' + was) : ''].filter(Boolean).join(', ');
  }
  const r = await alertProvider(pid, {
    event, who: names.who, detail,
    url: '/slickchart?n=calendar&i=' + encodeURIComponent(bid), kind: 'calendar', itemId: bid,
    tag: 'sqbooking-' + bid,
    // One alert per booking per state: a re-sent event, or two events for the same change, buzz once.
    key: 'sq:' + bid + ':' + event + ':' + (event === 'changed' ? String(booking.start_at || '') : '')
  });
  return { event, sent: r.sent, skipped: r.skipped };
}

// ── Square payments and refunds (Ashley, 2026-11-17: "anything that has to do with bookings, payments,
// and requests get a notification") ──────────────────────────────────────────────────────────────
// One alert per payment when it COMPLETES, and one per refund when it completes. Square sends
// payment.created and payment.updated, often several for one payment, so the key is the payment id:
// whichever event first says COMPLETED buzzes, the rest do nothing. Never any card details.
export function moneyText(m) {
  if (!m || m.amount == null) return '';
  const cur = String(m.currency || 'USD');
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(Number(m.amount) / 100); }
  catch (e) { return (Number(m.amount) / 100).toFixed(2) + ' ' + cur; }
}

async function customerName(providerId, customerId) {
  if (!customerId) return '';
  try {
    const conn = await getConnection(providerId);
    if (!conn || !conn.token) return '';
    const r = await squareFetch('/v2/customers/' + encodeURIComponent(customerId), {}, conn.token);
    const c = (r && r.customer) || {};
    return [c.given_name, c.family_name].filter(Boolean).join(' ').trim() || c.company_name || '';
  } catch (e) { return ''; }
}

export async function handleSquarePaymentEvent(providerId, evt) {
  const type = String((evt && evt.type) || '');
  const obj = (evt && evt.data && evt.data.object) || {};
  const isRefund = /^refund\./.test(type);
  const rec = isRefund ? obj.refund : obj.payment;
  if (!providerId || !rec || !rec.id || !/^(payment|refund)\.(created|updated)$/.test(type)) return { event: null };
  if (String(rec.status || '') !== 'COMPLETED') return { event: null };
  const event = isRefund ? 'refund' : 'payment';
  const amount = moneyText(isRefund ? rec.amount_money : (rec.total_money || rec.amount_money));
  if (!amount) return { event: null };
  let who = '';
  if (!isRefund) who = await customerName(String(providerId), rec.customer_id);
  const note = String(rec.note || rec.reason || '').trim().slice(0, 80);
  const detail = [who ? ('From ' + who) : '', note].filter(Boolean).join('. ');
  const r = await alertProvider(String(providerId), {
    event, who: amount, detail,
    url: '/slickchart?n=payments', kind: 'payments',
    tag: event + '-' + rec.id,
    key: (isRefund ? 'sqrefund:' : 'sqpay:') + rec.id
  });
  return { event, sent: r.sent, skipped: r.skipped };
}

// A client asking her to set a product aside. The client app's "Reserve in office" button opens
// Messages with exactly this sentence (slickchart-client.html _reserveInOffice), so a message that
// still carries it is a product request, and says which product. Returns the product name or ''.
export function productRequested(text) {
  const m = /could you set aside (.+?) for me to buy in office/i.exec(String(text || ''));
  return m ? m[1].trim().slice(0, 80) : '';
}

// Everything a client does from their own app that she needs to know about (api/client-submit).
// Returns null for a submission that is not worth a buzz (a new profile photo).
export function clientActivityAlert(kind, payload) {
  const p = payload || {};
  if (kind === 'message') {
    const prod = productRequested(p.text);
    return prod ? { event: 'product', detail: prod } : { event: 'message', detail: '' };
  }
  if (kind === 'checkin') return { event: 'checkin', detail: '' };
  if (kind === 'form') return { event: 'form', detail: String(p.title || '').slice(0, 80) };
  if (kind === 'vc_submit') return { event: 'vc_submit', titleAs: p.kind === 'product' ? 'vc_product' : 'vc_submit', detail: '' };
  if (kind === 'contact') {
    if (p.email === undefined && p.phone === undefined) return null;   // only a new profile photo
    return { event: 'contact', detail: '' };
  }
  return null;
}
