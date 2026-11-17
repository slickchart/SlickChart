// The built-in online booking link, for a provider with NO Square connection (Ashley, 2026-11-17:
// "make sure this works for not only Square connections, but also for people who are using the
// built-in online booking without a Square connection. Period."). Both modes, request and instant,
// must alert her devices, once per booking, through api/book-request.js itself.
// Run: node scratchpad/booking-alerts/test-booking-link-no-square.mjs
import { register } from 'node:module';
register('../founder-push/hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SESSION_SECRET: 's3cret' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8; delete process.env.RESEND_API_KEY;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const open = { open: true, start: '00:00', end: '23:59' };
const kv = { sc_availability: JSON.stringify({ sun: open, mon: open, tue: open, wed: open, thu: open, fri: open, sat: open }),
  sc_bizinfo: JSON.stringify({ name: 'Glow Studio', tz: 'America/Chicago' }) };
let mode = 'request';
const events = new Map(), alertLog = new Set();
globalThis.__sqlHandler = (t, v) => {
  if (/FROM providers WHERE consult_slug/.test(t)) return v[0] === 'glow' ? [{ id: 'prov_glow', name: 'Glow', email: '' }] : [];
  if (/SELECT v FROM kv WHERE owner/.test(t)) {
    if (v[0] !== 'prov_glow') return [];
    if (v[1] === 'sc_booking_page') return [{ v: JSON.stringify({ on: true, mode, leadHours: 0, horizonDays: 60, services: [{ name: 'Facial', mins: 60 }] }) }];
    return kv[v[1]] ? [{ v: kv[v[1]] }] : [];
  }
  if (/FROM square_connections/.test(t)) return [];
  if (/SELECT token FROM clients WHERE id=/.test(t)) return [{ token: 'tok_' + v[0] }];          // NO Square for this provider
  if (/INSERT INTO client_events/.test(t)) { if (events.has(v[0])) return []; events.set(v[0], v[3]); return [{ id: v[0] }]; }
  if (/INSERT INTO booking_alert_log/.test(t)) { const k = v[0] + '|' + v[1]; if (alertLog.has(k)) return []; alertLog.add(k); return [{ akey: v[1] }]; }
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) return v[0] === 'prov_glow' ? [{ id: 'pg', sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/glow', keys: {} }) }] : [];
  return [];
};
globalThis.fetch = async () => { throw new Error('no network in this test'); };
const { default: book } = await import(APP + 'api/book-request.js');
const call = async (body) => { let code = 0, out = null; const res = { status(s) { code = s; return this; }, json(j) { out = j; return this; }, setHeader() {} };
  await book({ method: 'POST', headers: { 'x-real-ip': '9.9.9.' + Math.floor(Math.random() * 200) }, body }, res); return { code, out }; };
const { openSlots, getBookingConfig, getHours } = await import(APP + 'lib/booking.js');
const day = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
const sends = () => (globalThis.__webSends || []).map(s => s.body || {});

globalThis.__webSends = [];
let r = await call({ slug: 'glow', name: 'Riley Park', email: 'riley@example.com', phone: '5551234567', service: 'Facial', date: day, time: '2:00 PM' });
let s = sends();
ok(r.code === 200 && r.out && r.out.ok && r.out.confirmed === false, 'request mode, no Square: the request is taken (' + JSON.stringify(r.out) + ')');
ok(s.length === 1 && s[0].title === 'Booking request: Riley Park', 'and her device gets "Booking request" (' + s.map(x => x.title) + ')');
ok(s[0] && /Facial/.test(s[0].body) && /2:00 PM/.test(s[0].body), 'saying what and when (' + (s[0] && s[0].body) + ')');

globalThis.__webSends = [];
r = await call({ slug: 'glow', name: 'Riley Park', email: 'riley@example.com', phone: '5551234567', service: 'Facial', date: day, time: '2:00 PM' });
ok(sends().length === 0, 'a double tap of the same booking does not buzz twice');

mode = 'instant';
globalThis.__webSends = [];
r = await call({ slug: 'glow', name: 'Sky Lane', email: 'sky@example.com', phone: '5559876543', service: 'Facial', date: day, time: '10:00 AM' });
s = sends();
ok(r.code === 200 && r.out && r.out.confirmed === true, 'instant mode, no Square: booked straight away (' + JSON.stringify(r.out) + ')');
ok(s.length === 1 && s[0].title === 'New booking: Sky Lane', 'and her device gets "New booking" (' + s.map(x => x.title) + ')');

kv.sc_notif_settings = JSON.stringify({ bookingNew: false });
globalThis.__webSends = [];
r = await call({ slug: 'glow', name: 'Ari Moss', email: 'ari@example.com', phone: '5550001111', service: 'Facial', date: day, time: '4:00 PM' });
ok(r.out && r.out.ok && sends().length === 0, 'New Booking switched off: booked, no alert');
delete kv.sc_notif_settings;

console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
