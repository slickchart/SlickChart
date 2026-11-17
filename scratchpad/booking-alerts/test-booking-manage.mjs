// "Change or cancel" for people who book from a provider's link (api/book-manage.js,
// lib/booking-manage.js). Every flow: the link in the email, the page, a move (request and instant),
// a double tap, a cancel, a second cancel, her cut-off, her switch off, her decline, a forged or
// edited link, another provider's link, and her Square booking cancelled / moved with her own token.
// Run: node scratchpad/booking-alerts/test-booking-manage.mjs
import { register } from 'node:module';
import crypto from 'node:crypto';
register('../founder-push/hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SESSION_SECRET: 's3cret',
  RESEND_API_KEY: 're_test', APP_ORIGIN: 'https://slickchart.app' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const { encrypt } = await import(APP + 'lib/crypto.js');

const open = { open: true, start: '00:00', end: '23:59' };
const hours = JSON.stringify({ sun: open, mon: open, tue: open, wed: open, thu: open, fri: open, sat: open });
const kv = {
  prov_glow: { sc_availability: hours, sc_bizinfo: JSON.stringify({ name: 'Glow Studio', tz: 'America/Chicago', phone: '555-0100' }) },
  prov_sq: { sc_availability: hours, sc_bizinfo: JSON.stringify({ name: 'Square Spa' }) }
};
const page = { prov_glow: { on: true, mode: 'request', leadHours: 0, horizonDays: 60, services: [{ name: 'Facial', mins: 60 }] },
  prov_sq: { on: true, mode: 'request', leadHours: 0, horizonDays: 60, services: [{ name: 'Facial', mins: 60 }] } };
const events = [], alertLog = new Set(), people = {};
const conns = [{ provider_id: 'prov_sq', merchant_id: 'M_SQ', access_token: encrypt('tok_sq'), location_id: 'L1', expires_at: null }];
const clientIdFor = (prov, email) => 'c_bk_' + crypto.createHash('sha256').update(prov + '|' + email.trim().toLowerCase()).digest('hex').slice(0, 16);
let seq = 0;
globalThis.__sqlHandler = (t, v) => {
  if (/FROM providers WHERE consult_slug/.test(t)) return v[0] === 'glow' ? [{ id: 'prov_glow', name: 'Glow', email: 'owner@glow.example' }] : [];
  if (/SELECT consult_slug FROM providers WHERE id/.test(t)) return v[0] === 'prov_glow' ? [{ consult_slug: 'glow' }] : [];
  if (/SELECT id, name, email FROM providers WHERE id/.test(t)) return [{ id: v[0], name: v[0] === 'prov_glow' ? 'Glow' : 'Square Spa', email: 'owner@' + v[0] + '.example' }];
  if (/SELECT v FROM kv WHERE owner/.test(t)) {
    if (v[1] === 'sc_booking_page' && page[v[0]]) return [{ v: JSON.stringify(page[v[0]]) }];
    const x = kv[v[0]] && kv[v[0]][v[1]]; return x ? [{ v: x }] : [];
  }
  if (/SELECT \* FROM square_connections WHERE provider_id/.test(t)) return conns.filter(c => c.provider_id === v[0]);
  if (/FROM square_connections/.test(t)) return [];
  if (/SELECT token FROM clients WHERE id=/.test(t)) return [{ token: 'tok_' + v[0] }];
  if (/SELECT name, email, phone FROM clients WHERE id/.test(t)) { const p = people[v[1] + '|' + v[0]]; return p ? [p] : []; }
  if (/INSERT INTO client_events/.test(t)) {
    if (events.some(e => e.id === v[0])) return [];
    events.push({ id: v[0], client_id: v[1], provider_id: v[2], kind: v[3], payload: JSON.parse(v[4]), created_at: Number(v[5]), seq: seq++ });
    return [{ id: v[0] }];
  }
  if (/FROM client_events\s+WHERE id = /.test(t)) return events.filter(e => e.id === v[0] && e.kind === 'booking');
  if (/kind = 'booking_change'/.test(t)) return events.filter(e => e.provider_id === v[0] && e.client_id === v[1] && e.kind === 'booking_change' && e.payload.ref === v[2])
    .sort((a, b) => (b.created_at - a.created_at) || (b.seq - a.seq)).slice(0, 1);
  if (/INSERT INTO booking_alert_log/.test(t)) { const k = v[0] + '|' + v[1]; if (alertLog.has(k)) return []; alertLog.add(k); return [{ akey: v[1] }]; }
  if (/FROM provider_push_subscriptions WHERE provider_id=/.test(t)) return [{ id: 'p_' + v[0], sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/' + v[0], keys: {} }) }];
  return [];
};
// Email (Resend) and HER Square, recorded.
let emails = [], sqCalls = [];
const sqBookings = { BK1: { id: 'BK1', version: 3, status: 'ACCEPTED', customer_id: 'CUST1', appointment_segments: [{ duration_minutes: 60, team_member_id: 'TM', service_variation_id: 'SV', service_variation_version: 7 }] },
  BK2: { id: 'BK2', version: 1, status: 'ACCEPTED', customer_id: 'CUST2', appointment_segments: [{ duration_minutes: 60, team_member_id: 'TM', service_variation_id: 'SV' }] },
  BKX: { id: 'BKX', version: 1, status: 'ACCEPTED', customer_id: 'SOMEONE_ELSE', appointment_segments: [] } };
globalThis.fetch = async (url, o = {}) => {
  const u = String(url), body = o.body ? JSON.parse(o.body) : null;
  const J = x => ({ ok: true, status: 200, json: async () => x, text: async () => JSON.stringify(x) });
  if (u.startsWith('https://api.resend.com')) { emails.push(body); return J({ id: 'em' }); }
  if (/squareup(sandbox)?\.com/.test(u)) {
    const auth = (o.headers && (o.headers.Authorization || o.headers.authorization)) || '';
    sqCalls.push({ u, method: o.method || 'GET', body, auth });
    if (/\/v2\/locations/.test(u)) return J({ locations: [{ id: 'L1', status: 'ACTIVE', timezone: 'America/New_York' }], location: { id: 'L1', timezone: 'America/New_York' } });
    let m = /\/v2\/bookings\/(BK\w+)\/cancel$/.exec(u); if (m) return J({ booking: Object.assign({}, sqBookings[m[1]], { status: 'CANCELLED_BY_SELLER' }) });
    m = /\/v2\/bookings\/(BK\w+)$/.exec(u);
    if (m && (o.method || 'GET') === 'PUT') return J({ booking: Object.assign({}, sqBookings[m[1]], body.booking, { version: 4 }) });
    if (m) return J({ booking: sqBookings[m[1]] });
    if (/\/v2\/bookings\?/.test(u)) return J({ bookings: [sqBookings.BK2, sqBookings.BKX] });
    if (/\/v2\/customers\/search/.test(u)) return J({ customers: [{ id: body.query.filter.email_address.exact === 'pat@example.com' ? 'CUST2' : 'NOPE' }] });
    return { ok: false, status: 404, json: async () => ({ errors: [{ detail: 'not stubbed' }] }), text: async () => 'not stubbed' };
  }
  console.log('NOSTUB', u); throw new Error('no network: ' + u);
};

const { default: book } = await import(APP + 'api/book-request.js');
const { default: manage } = await import(APP + 'api/book-manage.js');
const { manageToken, squareApply } = await import(APP + 'lib/booking-manage.js');
const mkRes = () => { const r = { code: 0, out: null, html: '', headers: {} };
  r.status = s => { r.code = s; return r; }; r.json = j => { r.out = j; return r; }; r.send = h => { r.html = String(h); return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
let ipn = 0; const ip = () => ({ 'x-real-ip': '10.0.' + (++ipn) + '.1' });
const bookIt = async body => { const res = mkRes(); await book({ method: 'POST', headers: ip(), body }, res); return res; };
const getPage = async (m, extra) => { const res = mkRes(); await manage({ method: 'GET', headers: ip(), query: Object.assign({ m }, extra || {}) }, res); return res; };
const post = async body => { const res = mkRes(); await manage({ method: 'POST', headers: ip(), body }, res); return res; };
const sends = () => (globalThis.__webSends || []).map(s => s.body || {});
const day = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

// ── 1. Request mode, no Square ───────────────────────────────────────────────────────────────────
people['prov_glow|' + clientIdFor('prov_glow', 'riley@example.com')] = { name: 'Riley Park', email: 'riley@example.com', phone: '5551234567' };
emails = [];
let r = await bookIt({ slug: 'glow', name: 'Riley Park', email: 'riley@example.com', phone: '5551234567', service: 'Facial', date: day(5), time: '2:00 PM' });
ok(r.code === 200 && r.out.ok, 'a request from her link is taken');
const guest = emails.find(e => e.to === 'riley@example.com');
const link = guest && /https:\/\/slickchart\.app\/booking\/manage\?m=([^"\s<]+)/.exec(guest.html);
ok(!!link && /Change or cancel/.test(guest.html), 'their confirmation email has a Change or cancel button');
ok(guest && /Change or cancel: https:\/\/slickchart\.app\/booking\/manage\?m=/.test(guest.text), 'and the plain-text email has the link too');
const M = link ? decodeURIComponent(link[1]) : '';
const bookingId = events.find(e => e.kind === 'booking').id;
ok(M === manageToken('prov_glow', bookingId), 'the link is for exactly that booking');

let p = await getPage(M);
ok(p.code === 200 && /Pick a new time/.test(p.html) && /Cancel appointment/.test(p.html) && /Facial/.test(p.html), 'the page opens with Pick a new time and Cancel');
ok(/Waiting for Glow Studio to confirm/.test(p.html), 'and says it is waiting on her');
ok(/Riley/.test(p.html) === false && !/riley@example\.com/.test(p.html), 'the page shows no name or email');

// forged / edited / another provider's
p = await getPage(M.slice(0, -2) + 'xx'); ok(p.code === 404 && /Link not found/.test(p.html), 'an edited link opens nothing');
p = await getPage(bookingId + '.' + crypto.createHmac('sha256', 's3cret').update('bkmanage|prov_sq|' + bookingId).digest('base64url').slice(0, 27));
ok(p.code === 404, 'a link signed for a different provider opens nothing');
p = await getPage('nonsense'); ok(p.code === 404, 'a junk link opens nothing');
let x = await post({ m: M.slice(0, -1) + 'A', action: 'cancel' }); ok(x.code === 404, 'an edited link cannot cancel');

// move (request mode): a new request, her alert, their email
globalThis.__webSends = []; emails = [];
x = await post({ m: M, action: 'move', date: day(7), time: '3:00 PM' });
ok(x.code === 200 && x.out.ok && x.out.confirmed === false, 'moving in request mode sends a request for the new time (' + JSON.stringify(x.out) + ')');
let s = sends();
ok(s.length === 1 && s[0].title === 'New time requested: Riley Park', 'her device gets "New time requested" (' + s.map(z => z.title) + ')');
ok(s[0] && /3:00 PM/.test(s[0].body) && /was/.test(s[0].body), 'saying the new time and the old one (' + (s[0] && s[0].body) + ')');
const chg1 = events.filter(e => e.kind === 'booking_change');
ok(chg1.length === 1 && chg1[0].payload.ref === bookingId && chg1[0].payload.prevId === bookingId && chg1[0].payload.action === 'move', 'recorded as a change of that booking for her app');
ok(emails.some(e => e.to === 'riley@example.com' && /New time requested/.test(e.subject)), 'they get an email that the new time was requested');
ok(emails.some(e => e.to === 'owner@prov_glow.example' && /New time requested/.test(e.subject)), 'and she gets her email copy');
globalThis.__webSends = [];
x = await post({ m: M, action: 'move', date: day(7), time: '3:00 PM' });
ok(sends().length === 0, 'the same move again does not buzz her again');
p = await getPage(M); ok(/3:00 PM/.test(p.html), 'the page now shows the new time');

// cancel
globalThis.__webSends = []; emails = [];
x = await post({ m: M, action: 'cancel' });
ok(x.code === 200 && x.out.ok, 'cancel works');
s = sends(); ok(s.length === 1 && s[0].title === 'Booking cancelled: Riley Park', 'her device gets "Booking cancelled"');
const chg2 = events.filter(e => e.kind === 'booking_change');
ok(chg2.length === 2 && chg2[1].payload.prevId === chg1[0].id, 'the cancel closes the MOVED entry, not the original');
ok(emails.some(e => e.to === 'riley@example.com' && /cancelled/i.test(e.subject)), 'they get a cancellation email');
x = await post({ m: M, action: 'cancel' }); ok(x.code === 409 && x.out.code === 'cancelled', 'cancelling twice says it is already cancelled');
x = await post({ m: M, action: 'move', date: day(8), time: '3:00 PM' }); ok(x.code === 409, 'and a cancelled one cannot be moved');
p = await getPage(M); ok(/This appointment is cancelled/.test(p.html) && /\/book\/glow/.test(p.html), 'the page says cancelled, with Book another time');

// ── 2. Instant mode, no Square: the move is booked outright ──────────────────────────────────────
page.prov_glow.mode = 'instant';
people['prov_glow|' + clientIdFor('prov_glow', 'sky@example.com')] = { name: 'Sky Lane', email: 'sky@example.com' };
emails = [];
r = await bookIt({ slug: 'glow', name: 'Sky Lane', email: 'sky@example.com', phone: '5559876543', service: 'Facial', date: day(5), time: '10:00 AM' });
ok(r.out && r.out.confirmed === true, 'instant booking taken');
const bk2 = events.filter(e => e.kind === 'booking').pop();
const M2 = manageToken('prov_glow', bk2.id);
p = await getPage(M2, { slots: '1', date: day(6) });
ok(p.out && p.out.mode === 'instant' && Array.isArray(p.out.slots) && p.out.slots.indexOf('11:00 AM') >= 0, 'the page lists open times for a day (' + JSON.stringify(p.out).slice(0, 80) + ')');
globalThis.__webSends = [];
x = await post({ m: M2, action: 'move', date: day(6), time: '11:00 AM' });
ok(x.code === 200 && x.out.confirmed === true, 'moving to an open time books it');
s = sends(); ok(s.length === 1 && s[0].title === 'Booking moved: Sky Lane', 'her device gets "Booking moved"');
x = await post({ m: M2, action: 'move', date: day(6), time: '11:00 AM' });
ok(x.code === 409, 'moving to the time you already have is refused');
x = await post({ m: M2, action: 'move', date: day(6), time: '' }); ok(x.code === 400, 'no time picked: refused');
x = await post({ m: M2, action: 'move', date: day(400), time: '11:00 AM' }); ok(x.code === 409, 'beyond how far ahead she books: refused');
x = await post({ m: M2, action: 'move', date: day(-2), time: '11:00 AM' }); ok(x.code === 409, 'a day in the past: refused');
x = await post({ m: M2, action: 'nuke' }); ok(x.code === 400, 'an unknown action: refused');

// ── 3. Her cut-off and her switch ────────────────────────────────────────────────────────────────
page.prov_glow.changeHours = 168;   // a week; the appointment is 6 days out
p = await getPage(M2); ok(/can’t be changed online/.test(p.html) && /7 days/.test(p.html) && /555-0100/.test(p.html), 'inside her cut-off the page says to contact her, with her phone');
x = await post({ m: M2, action: 'cancel' }); ok(x.code === 409 && x.out.code === 'closed', 'and a cancel inside the cut-off is refused');
page.prov_glow.changeHours = 24;
page.prov_glow.clientChanges = false;
x = await post({ m: M2, action: 'cancel' }); ok(x.code === 409, 'with her switch off nothing can be changed online');
emails = [];
people['prov_glow|' + clientIdFor('prov_glow', 'ari@example.com')] = { name: 'Ari Moss', email: 'ari@example.com' };
r = await bookIt({ slug: 'glow', name: 'Ari Moss', email: 'ari@example.com', phone: '5550001111', service: 'Facial', date: day(9), time: '1:00 PM' });
const g3 = emails.find(e => e.to === 'ari@example.com');
ok(g3 && !/booking\/manage/.test(g3.html) && /reply to this email/i.test(g3.html), 'with her switch off the email has no link and says to reply');
delete page.prov_glow.clientChanges;

// ── 4. She declined it in her app ────────────────────────────────────────────────────────────────
page.prov_glow.mode = 'request';
people['prov_glow|' + clientIdFor('prov_glow', 'dee@example.com')] = { name: 'Dee Fox', email: 'dee@example.com' };
await bookIt({ slug: 'glow', name: 'Dee Fox', email: 'dee@example.com', phone: '5550002222', service: 'Facial', date: day(10), time: '9:00 AM' });
const bk4 = events.filter(e => e.kind === 'booking').pop();
kv.prov_glow.sc_bookings = JSON.stringify([{ id: bk4.id, status: 'declined', decidedAt: Date.now() + 1000 }]);
p = await getPage(manageToken('prov_glow', bk4.id)); ok(/was not accepted/.test(p.html), 'a request she declined says so');
x = await post({ m: manageToken('prov_glow', bk4.id), action: 'move', date: day(11), time: '9:00 AM' }); ok(x.code === 409 && x.out.code === 'declined', 'and cannot be moved');

// ── 5. Her Square: cancelled and moved with HER token ────────────────────────────────────────────
people['prov_sq|c_sq1'] = { name: 'Lou Ray', email: 'lou@example.com' };
events.push({ id: 'ev_idem_sq1', client_id: 'c_sq1', provider_id: 'prov_sq', kind: 'booking', created_at: Date.now() - 5000, seq: seq++,
  payload: { via: 'booking-link', autoConfirmed: true, squareBookingId: 'BK1', date: day(5), time: '10:00 AM', dateLabel: 'x', treatment: 'Facial', dur: 60 } });
sqCalls = []; globalThis.__webSends = [];
x = await post({ m: manageToken('prov_sq', 'ev_idem_sq1'), action: 'cancel' });
const cancelCall = sqCalls.find(c => /\/v2\/bookings\/BK1\/cancel$/.test(c.u));
ok(x.code === 200 && cancelCall && cancelCall.body.booking_version === 3, 'a booked appointment is cancelled in her Square, at its current version');
ok(sqCalls.every(c => /tok_sq/.test(c.auth)), 'with HER token only');
ok(events.filter(e => e.kind === 'booking_change').pop().payload.squareDone === true, 'and her app is told Square is done');

// A request she confirmed (her app booked it in Square, id not kept): found by time + this person's
// Square customer, never someone else's booking at the same minute.
people['prov_sq|c_sq2'] = { name: 'Pat Kim', email: 'pat@example.com' };
events.push({ id: 'ev_idem_sq2', client_id: 'c_sq2', provider_id: 'prov_sq', kind: 'booking', created_at: Date.now() - 5000, seq: seq++,
  payload: { via: 'booking-link', autoConfirmed: false, date: day(5), time: '11:00 AM', treatment: 'Facial', dur: 60 } });
kv.prov_sq.sc_bookings = JSON.stringify([{ id: 'ev_idem_sq2', status: 'confirmed', decidedAt: Date.now() }]);
sqCalls = [];
x = await post({ m: manageToken('prov_sq', 'ev_idem_sq2'), action: 'move', date: day(8), time: '11:00 AM' });
ok(x.code === 200 && x.out.confirmed === false, 'moving a confirmed request asks her for the new time');
ok(sqCalls.some(c => /\/v2\/bookings\/BK2\/cancel$/.test(c.u)) && !sqCalls.some(c => /BKX/.test(c.u)), 'the old time is released in her Square: their booking, not the other one at that minute');

// Unknown customer at that minute: nothing in Square is touched, and she is not told to fix Square.
people['prov_sq|c_sq3'] = { name: 'Ned Vo', email: 'ned@example.com' };
events.push({ id: 'ev_idem_sq3', client_id: 'c_sq3', provider_id: 'prov_sq', kind: 'booking', created_at: Date.now() - 5000, seq: seq++,
  payload: { via: 'booking-link', autoConfirmed: true, date: day(5), time: '11:00 AM', treatment: 'Facial', dur: 60 } });
sqCalls = []; globalThis.__webSends = [];
x = await post({ m: manageToken('prov_sq', 'ev_idem_sq3'), action: 'cancel' });
ok(x.code === 200 && !sqCalls.some(c => /cancel$/.test(c.u)), 'no matching Square booking: nothing in Square is cancelled');
ok(!/Square/.test((sends()[0] || {}).body || ''), 'and the alert does not tell her to fix Square');

// The move itself (instant mode): PUT at the new time with the same segments and the live version.
sqCalls = [];

const mv = await squareApply('prov_sq', { squareBookingId: 'BK1', date: day(5), time: '10:00 AM' }, 'lou@example.com', 'move', Date.parse(day(6) + 'T15:00:00Z'));
const put = sqCalls.find(c => c.method === 'PUT');
ok(mv.done && put && put.body.booking.version === 3 && put.body.booking.start_at === day(6) + 'T15:00:00.000Z' && put.body.booking.appointment_segments[0].service_variation_version === 7, 'an instant move re-times her Square booking');
ok((await squareApply('prov_glow', { date: day(5), time: '10:00 AM' }, '', 'cancel')).why === 'no square', 'a provider with no Square: nothing to do there');

// A link to a booking that was not made from her link (a client's own app) opens nothing.
events.push({ id: 'ev_app1', client_id: 'c_app', provider_id: 'prov_glow', kind: 'booking', created_at: Date.now(), seq: seq++, payload: { treatment: 'Facial', date: day(5), time: '1:00 PM' } });
p = await getPage(manageToken('prov_glow', 'ev_app1')); ok(p.code === 404, 'only bookings made from her link have a manage page');

console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
