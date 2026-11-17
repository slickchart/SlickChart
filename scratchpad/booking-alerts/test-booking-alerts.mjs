// Booking alerts reach the provider's devices for every booking event, once, only her own, and only
// when her switch is on (lib/booking-alerts.js, api/square/webhook.js, book-request, client-submit,
// consult-request, reschedule-booking). Run: node scratchpad/booking-alerts/test-booking-alerts.mjs
import { register } from 'node:module';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
register('../founder-push/hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SESSION_SECRET: 's3cret',
  SQUARE_WEBHOOK_SIGNATURE_KEY: 'whkey', SQUARE_WEBHOOK_URL: 'https://slickchart.app/api/square/webhook' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const { encrypt } = await import(APP + 'lib/crypto.js');
// ── a tiny in-memory database for the queries these paths make ──
const db = { log: new Map(), seen: new Map(), whSeen: new Map(), kv: new Map(),
  conns: [{ provider_id: 'prov_k', merchant_id: 'M_K', access_token: encrypt('tok_k'), location_id: 'L1', expires_at: null }],
  subs: { prov_k: [{ id: 'pk', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/kristen', keys: {} }) }],
          prov_other: [{ id: 'po', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/other', keys: {} }) }] } };
globalThis.__sqlHandler = (t, v) => {
  if (/INSERT INTO booking_alert_log/.test(t)) { const k = v[0] + '|' + v[1]; if (db.log.has(k)) return []; db.log.set(k, 1); return [{ akey: v[1] }]; }
  if (/DELETE FROM booking_alert_log/.test(t)) { db.log.delete(v[0] + '|' + v[1]); return []; }
  if (/SELECT start_at, status, version FROM square_booking_seen/.test(t)) { const r = db.seen.get(v[0] + '|' + v[1]); return r ? [r] : []; }
  if (/INSERT INTO square_booking_seen/.test(t)) {
    const k = v[0] + '|' + v[1], prev = db.seen.get(k) || {};
    const own = !/status = EXCLUDED.status/.test(t);   // noteOwnReschedule keeps status, coalesces version
    db.seen.set(k, { start_at: v[2], status: own ? (prev.status || v[3]) : v[3], version: own ? (v[4] == null ? (prev.version ?? null) : v[4]) : v[4] }); return [];
  }
  if (/INSERT INTO square_webhook_seen/.test(t)) { db.whSeen.set(v[0], v[1]); return []; }
  if (/SELECT type, at FROM square_webhook_seen/.test(t)) return [...db.whSeen].map(([type, at]) => ({ type, at }));
  if (/SELECT v FROM kv WHERE owner/.test(t)) { const x = db.kv.get(v[0] + '|' + v[1]); return x ? [{ v: x }] : []; }
  if (/SELECT provider_id FROM square_connections WHERE merchant_id/.test(t)) return db.conns.filter(c => c.merchant_id === v[0]).map(c => ({ provider_id: c.provider_id }));
  if (/SELECT \* FROM square_connections WHERE provider_id/.test(t)) return db.conns.filter(c => c.provider_id === v[0]);
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) return db.subs[v[0]] || [];
  if (/SELECT \* FROM clients WHERE token=/.test(t)) return v[0] === 'tokA' ? [{ id: 'cA', provider_id: 'prov_k', name: 'Jamie Lee' }] : [];
  if (/INSERT INTO client_events/.test(t)) return [{ id: v[0] }];
  return [];
};
// Square API: her customer and her service.
globalThis.fetch = async (url) => {
  const u = String(url);
  let body = {};
  if (/\/v2\/customers\/C1/.test(u)) body = { customer: { given_name: 'Jamie', family_name: 'Lee' } };
  else if (/\/v2\/catalog\/object\/SV1/.test(u)) body = { object: { type: 'ITEM_VARIATION' }, related_objects: [{ type: 'ITEM', item_data: { name: 'Hydrafacial' } }] };
  else if (/\/v2\/locations/.test(u)) body = { locations: [{ id: 'L1', status: 'ACTIVE', timezone: 'America/New_York' }] };
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
};
const sends = () => (globalThis.__webSends || []).map(s => ({ to: s.sub.endpoint.split('/').pop(), p: s.body || {} }));
const reset = () => { globalThis.__webSends = []; };

const { default: webhook } = await import(APP + 'api/square/webhook.js');
async function hook(evt, sigOk = true) {
  const raw = JSON.stringify(evt);
  const sig = sigOk ? crypto.createHmac('sha256', 'whkey').update(process.env.SQUARE_WEBHOOK_URL + raw).digest('base64') : 'bad';
  const req = Readable.from([raw]); req.method = 'POST'; req.headers = { 'x-square-hmacsha256-signature': sig }; req.url = '/api/square/webhook';
  let code = 0, out = null; const res = { status(s) { code = s; return this; }, json(j) { out = j; return this; }, setHeader() {} };
  await webhook(req, res); return { code, out };
}
let ver = 1;
const bk = (o) => ({ merchant_id: 'M_K', type: o.type, event_id: 'e' + (ver), data: { type: 'booking', id: 'B1', object: { booking: Object.assign({
  id: 'B1', version: ver++, status: 'ACCEPTED', start_at: '2026-11-20T19:00:00Z', customer_id: 'C1', source: 'FIRST_PARTY_BUYER',
  appointment_segments: [{ service_variation_id: 'SV1', duration_minutes: 60 }] }, o.b || {}) } } });

// 1. A client books on Square's own booking site.
reset(); let r = await hook(bk({ type: 'booking.created' }));
let s = sends();
ok(r.code === 200, 'webhook answers 200');
ok(s.length === 1 && s[0].to === 'kristen', 'new Square booking reaches HER device only (' + s.map(x => x.to) + ')');
ok(s[0] && s[0].p.title === 'New booking: Jamie Lee', 'title names the client (' + (s[0] && s[0].p.title) + ')');
ok(s[0] && /Hydrafacial, Fri, Nov 20 at 2:00 PM/.test(s[0].p.body), 'body says the service and HER local time (' + (s[0] && s[0].p.body) + ')');

// 2. Same event re-sent by Square: no second buzz.
reset(); ver--; r = await hook(bk({ type: 'booking.created' }));
ok(sends().length === 0, 'a re-sent event does not buzz twice');

// 3. Client moves the time.
reset(); r = await hook(bk({ type: 'booking.updated', b: { start_at: '2026-11-21T15:00:00Z' } }));
s = sends();
ok(s.length === 1 && s[0].p.title === 'Booking moved: Jamie Lee', 'a time change alerts as moved');
ok(s[0] && /now Sat, Nov 21 at 10:00 AM/.test(s[0].p.body) && /was Fri, Nov 20 at 2:00 PM/.test(s[0].p.body), 'says the new and old time (' + (s[0] && s[0].p.body) + ')');

// 4. She moves it herself in SlickChart: no alert about her own change.
const { noteOwnReschedule } = await import(APP + 'lib/booking-alerts.js');
await noteOwnReschedule('prov_k', 'B1', '2026-11-22T15:00:00Z', null);
reset(); r = await hook(bk({ type: 'booking.updated', b: { start_at: '2026-11-22T15:00:00Z' } }));
ok(sends().length === 0, 'her own reschedule from SlickChart does not alert her');

// 5. Client cancels from Square's email.
reset(); r = await hook(bk({ type: 'booking.updated', b: { start_at: '2026-11-22T15:00:00Z', status: 'CANCELLED_BY_CUSTOMER' } }));
s = sends();
ok(s.length === 1 && s[0].p.title === 'Booking cancelled: Jamie Lee', 'a client cancellation alerts');

// 6. She cancels it herself / she books it herself / SlickChart booked it: silent.
reset();
await hook(bk({ type: 'booking.updated', b: { id: 'B1', status: 'CANCELLED_BY_SELLER' } }));
const other = (src, id) => { const e = bk({ type: 'booking.created', b: { id, source: src } }); e.data.id = id; return e; };
await hook(other('FIRST_PARTY_MERCHANT', 'B2'));
await hook(other('API', 'B3'));
ok(sends().length === 0, 'her own cancel, a booking she made in Square, and one SlickChart made are silent');

// 7. A request that needs her approval.
reset(); await hook(other('THIRD_PARTY_BUYER', 'B4')); // ACCEPTED from Google etc
const pend = bk({ type: 'booking.created', b: { id: 'B5', status: 'PENDING' } }); pend.data.id = 'B5';
await hook(pend);
s = sends();
ok(s.length === 2 && s[1].p.title === 'Booking request: Jamie Lee', 'a booking from Google alerts, and a pending one alerts as a request');

// 8. Her switch off: silent.
db.kv.set('prov_k|sc_notif_settings', JSON.stringify({ bookingNew: false }));
reset(); const off = bk({ type: 'booking.created', b: { id: 'B6' } }); off.data.id = 'B6'; await hook(off);
ok(sends().length === 0, 'New Booking switched off: no alert');
db.kv.delete('prov_k|sc_notif_settings');

// 9. Isolation: a forged signature does nothing; a merchant two accounts share alerts nobody.
reset(); r = await hook(other('FIRST_PARTY_BUYER', 'B7'), false);
ok(r.code === 401 && sends().length === 0, 'a bad signature is refused and sends nothing');
db.conns.push({ provider_id: 'prov_other', merchant_id: 'M_K', access_token: encrypt('tok_o') });
reset(); await hook(other('FIRST_PARTY_BUYER', 'B8'));
ok(sends().length === 0, 'a Square merchant held by two accounts alerts neither (no cross-account names)');
db.conns.pop();
reset(); const unk = other('FIRST_PARTY_BUYER', 'B9'); unk.merchant_id = 'M_UNKNOWN'; await hook(unk);
ok(sends().length === 0, 'an unknown merchant alerts nobody');

// 10. The setup check says booking events are arriving.
let g = null; await webhook({ method: 'GET', headers: { host: 'slickchart.app' } }, { status() { return this; }, json(j) { g = j; return this; }, setHeader() {} });
ok(g && g.bookingEventsArriving === true && g.subscribeTo.includes('booking.updated'), 'GET setup check lists booking events and that they arrive');

// 11. Client app booking request and consult request go to web push too, once.
const { alertProvider } = await import(APP + 'lib/booking-alerts.js');
reset();
await alertProvider('prov_k', { event: 'request', who: 'Sam', detail: 'Brow lamination, Tue Nov 24 at 3:00 PM', key: 'app:ev1' });
await alertProvider('prov_k', { event: 'request', who: 'Sam', detail: 'x', key: 'app:ev1' });
await alertProvider('prov_k', { event: 'consult', who: 'Pat' });
s = sends();
ok(s.length === 2 && s[0].p.title === 'Booking request: Sam' && s[1].p.title === 'New consult request: Pat', 'client-app request (deduped) and consult request reach her web push');
db.kv.set('prov_k|sc_notif_settings', JSON.stringify({ consultRequest: false }));
reset(); await alertProvider('prov_k', { event: 'consult', who: 'Pat' });
ok(sends().length === 0, 'Consult Request switched off: no alert');

// 12. Square payments and refunds: one alert when completed, never twice, switch honoured.
db.kv.delete('prov_k|sc_notif_settings');
const pay = (type, status, id) => ({ merchant_id: 'M_K', type, data: { type: 'payment', id, object: { payment: { id, status, total_money: { amount: 8500, currency: 'USD' }, customer_id: 'C1', note: 'Deposit for Hydrafacial' } } } });
reset();
await hook(pay('payment.created', 'APPROVED', 'P1'));
await hook(pay('payment.updated', 'COMPLETED', 'P1'));
await hook(pay('payment.updated', 'COMPLETED', 'P1'));
s = sends();
ok(s.length === 1 && s[0].p.title === 'Payment received: $85.00' && /From Jamie Lee\. Deposit for Hydrafacial/.test(s[0].p.body), 'a completed payment alerts once with amount and client (' + s.map(x => x.p.title + ' / ' + x.p.body) + ')');
reset();
await hook({ merchant_id: 'M_K', type: 'refund.updated', data: { object: { refund: { id: 'R1', status: 'COMPLETED', amount_money: { amount: 2000, currency: 'USD' }, reason: 'Product return' } } } });
s = sends();
ok(s.length === 1 && s[0].p.title === 'Refund processed: $20.00', 'a completed refund alerts');
db.kv.set('prov_k|sc_notif_settings', JSON.stringify({ paymentReceived: false }));
reset(); await hook(pay('payment.updated', 'COMPLETED', 'P2'));
ok(sends().length === 0, 'Payment Received switched off: no alert');
db.kv.delete('prov_k|sc_notif_settings');

// 13. What a client does in their own app.
const { clientActivityAlert, productRequested } = await import(APP + 'lib/booking-alerts.js');
const pr = clientActivityAlert('message', { text: 'Hi Kristen, could you set aside Vitamin C Serum for me to buy in office at my next visit? Thank you!' });
ok(pr && pr.event === 'product' && pr.detail === 'Vitamin C Serum', 'a Reserve-in-office message is a product request naming the product');
ok(clientActivityAlert('message', { text: 'see you soon' }).event === 'message', 'an ordinary message is a message');
ok(clientActivityAlert('contact', { avatar: 'data:x' }) === null, 'a new profile photo does not buzz');
ok(clientActivityAlert('contact', { email: 'a@b.co', phone: '' }).event === 'contact', 'a new email/phone does');
ok(clientActivityAlert('vc_submit', { kind: 'product' }).titleAs === 'vc_product', 'a product consult says product consult');
reset();
await alertProvider('prov_k', { event: 'product', who: 'Sam', detail: 'Vitamin C Serum', key: 'ev:9' });
ok(sends()[0] && sends()[0].p.title === 'Product request: Sam', 'product request title');
db.kv.set('prov_k|sc_notif_settings', JSON.stringify({ newMessage: false }));
reset(); await alertProvider('prov_k', { event: 'message', who: 'Sam', key: 'ev:10' });
ok(sends().length === 0, 'New Message switched off: no alert (the switch now works on the server)');
db.kv.delete('prov_k|sc_notif_settings');

// 14. End to end through /api/client-submit: product request, booking request, profile photo.
const { default: submit } = await import(APP + 'api/client-submit.js');
const sub = async (kind, payload) => { const res = { status() { return this; }, json() { return this; }, setHeader() {} };
  await submit({ method: 'POST', headers: { 'x-real-ip': '1.2.3.' + Math.random() }, body: { t: 'tokA', kind, payload } }, res); };
reset();
await sub('message', { text: 'Hi, could you set aside Peptide Cream for me to buy in office at my next visit? Thank you!', _idem: 'm1' });
await sub('booking', { treatment: 'Facial', dateLabel: 'Thu, Nov 19', time: '2:00 PM', _idem: 'b1' });
await sub('contact', { avatar: 'data:x' });
await sub('form', { title: 'Consent', _idem: 'f1' });
s = sends();
ok(s.map(x => x.p.title).join(' | ') === 'Product request: Jamie Lee | Booking request: Jamie Lee | Form signed: Jamie Lee', 'client-submit: product, booking and form alert her web push, a photo does not (' + s.map(x => x.p.title).join(' | ') + ')');
ok(s[1] && /Facial, Thu, Nov 19 at 2:00 PM/.test(s[1].p.body), 'booking request says what and when (' + (s[1] && s[1].p.body) + ')');
ok(s.every(x => x.to === 'kristen'), 'only her devices');

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
