// The provider app's half of an INSTANT booking from the public link (2026-11-11).
//   (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-instant-booking-app.mjs
//   ENGINE=webkit ... for Safari's engine
//
// Before: the event was filed as confirmed on her SlickChart calendar and went nowhere else.
// Now api/book-request.js books Square itself and marks the event; the app finishes the rest:
//   A  sqBookingId  -> the app does NOT book Square again, no Google copy, refreshes Square
//   B  sqSkip       -> no Square: a manualAppts entry (that is what goes to her Google), fixed id
//   C  sqMissed + Square connected and able -> the app books Square itself, ONE call, the server's key
//   D  sqMissed + Square has no such service -> a "Not added to Square" notice in the feed, NO pop-up
//   E  an older event with no marks at all (pre-fix) and Square connected -> books Square from the app
//   F  a request-mode booking still waits as a request (nothing leaves the app until she confirms)
//   G  the Square key is the tail of the event id, so two bookings by one client get different keys
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899; const ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const b = await pw[ENGINE].launch();
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PID = 'p_aaaaaaaaaaaaaaaa';
const evId = (cid, k) => 'ev_idem_' + (PID + '_' + cid).slice(0, 48) + '_bk' + k;
const ev = (id, cid, name, date, time, extra) => ({ id, client_id: cid, kind: 'booking', seen: false, created_at: Date.now(),
  payload: Object.assign({ client: name, treatment: 'Signature Facial', date, time, dur: 60, via: 'booking-link', autoConfirmed: true }, extra || {}) });

async function run(label, { events, squareServices, squareOn = true }) {
  const kv = { sc_hide_sample: '1', sc_onboarded: '1',
    sc_clients: JSON.stringify({ c_bk_1: { name: 'Ann One', email: 'ann@x.com' }, c_bk_2: { name: 'Bea Two', email: 'bea@x.com' } }) };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  const books = []; let optsCalls = 0; let served = false;
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    const J = (o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('cloud-status')) return J({ enabled: true });
    if (u.includes('/api/store') && m === 'GET') return J({ data: { ...kv } });
    if (u.includes('/api/store')) { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return J({ ok: true }); }
    if (u.includes('/api/square/appointments')) return squareOn ? J({ appointments: [] }) : J({ error: 'x', code: 'nosquare' }, 401);
    if (u.includes('/api/square/booking-options')) { optsCalls++; return J({ services: squareServices || [], teamMembers: [{ id: 'TM1' }] }); }
    if (u.includes('/api/square/book')) { books.push(JSON.parse(r.request().postData() || '{}')); return J({ ok: true, booking: { id: 'SQB' + books.length } }); }
    if (u.includes('/api/clients') && m === 'GET') { const out = served ? [] : events; served = true; return J({ ok: true, clients: [], events: out }); }
    return J({ ok: true, data: {}, clients: [], events: [] }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
  await p.waitForTimeout(9000);
  const st = await p.evaluate(() => ({
    bookings: SlickBridge.getBookings().map(x => ({ id: x.id, status: x.status })),
    manual: (manualAppts || []).map(a => ({ id: a.id, client: a.client, date: a.date })),
    notifs: notifFeed.map(n => n.title + ': ' + n.body),
    modal: !!document.querySelector('.cm-overlay, #confirmModal, .confirm-modal') && /Not added to Square/.test(document.body.innerText),
    bodyHasModal: /Not added to Square[\s\S]{0,300}Book in Square/.test(document.body.innerText)
  }));
  await ctx.close();
  return { st, books, optsCalls, errs };
}
const SVC = [{ name: 'Signature Facial', variationId: 'V1', variationVersion: 3, durationMinutes: 60, teamMemberIds: ['TM1'] }];

{ const e = ev(evId('c_bk_1', 'A1'), 'c_bk_1', 'Ann One', day(4), '10:00 AM', { sqBookingId: 'SQ_SERVER' });
  const r = await run('A', { events: [e], squareServices: SVC });
  check('A server booked it: confirmed in the app', r.st.bookings.some(x => x.id === e.id && x.status === 'confirmed'), JSON.stringify(r.st.bookings));
  check('A server booked it: the app books nothing more in Square', r.books.length === 0, JSON.stringify(r.books));
  check('A server booked it: no second copy for Google', r.st.manual.length === 0, JSON.stringify(r.st.manual));
  check('A no page errors', !r.errs.length, r.errs.join(' | ')); }

{ const e = ev(evId('c_bk_1', 'B1'), 'c_bk_1', 'Ann One', day(4), '10:00 AM', { sqSkip: true });
  const r = await run('B', { events: [e], squareOn: false });
  check('B no Square: filed as an appointment that goes to Google', r.st.manual.length === 1 && r.st.manual[0].client === 'Ann One' && r.st.manual[0].date === day(4), JSON.stringify(r.st.manual));
  check('B no Square: the entry id is fixed by the booking (two devices collapse to one)', r.st.manual[0] && r.st.manual[0].id === 'ma_rq_' + e.id.replace(/[^A-Za-z0-9_-]/g, '').slice(-40), r.st.manual[0] && r.st.manual[0].id);
  check('B no Square: no Square calls', r.books.length === 0 && r.optsCalls === 0, r.optsCalls + ' ' + r.books.length); }

{ const e = ev(evId('c_bk_1', 'C1'), 'c_bk_1', 'Ann One', day(5), '11:00 AM', { sqMissed: 'Square did not answer' });
  const r = await run('C', { events: [e], squareServices: SVC });
  check('C server missed, Square works: the app books it, once', r.books.length === 1 && r.books[0].serviceVariationId === 'V1' && r.books[0].customerEmail === 'ann@x.com', JSON.stringify(r.books));
  check('C ...with the same key the server would have used', r.books[0] && r.books[0].idempotencyKey === 'req-' + e.id.replace(/[^A-Za-z0-9_-]/g, '').slice(-41), r.books[0] && r.books[0].idempotencyKey);
  check('C ...and no Google copy (Square carries it)', r.st.manual.length === 0, JSON.stringify(r.st.manual)); }

{ const e = ev(evId('c_bk_2', 'D1'), 'c_bk_2', 'Bea Two', day(6), '1:00 PM', { sqMissed: 'No Square service matches' });
  const r = await run('D', { events: [e], squareServices: [{ name: 'Brow Lamination', variationId: 'V9', teamMemberIds: ['TM1'] }] });
  check('D Square cannot take it: a "Not added to Square" notice in the feed', r.st.notifs.some(n => /^Not added to Square: Bea Two/.test(n)), r.st.notifs.join(' | '));
  check('D ...without a pop-up landing on her screen', !r.st.bodyHasModal, '');
  check('D ...and it is still on her SlickChart calendar (filed for Google too)', r.st.manual.length === 1, JSON.stringify(r.st.manual)); }

{ const e = ev(evId('c_bk_1', 'E1'), 'c_bk_1', 'Ann One', day(7), '10:00 AM');
  const r = await run('E', { events: [e], squareServices: SVC });
  check('E an older unmarked instant booking: booked into Square from the app', r.books.length === 1, JSON.stringify(r.books)); }

{ const e = ev(evId('c_bk_1', 'F1'), 'c_bk_1', 'Ann One', day(7), '10:00 AM', { autoConfirmed: false });
  const r = await run('F', { events: [e], squareServices: SVC });
  check('F a request stays a request until she confirms', r.st.bookings.some(x => x.id === e.id && x.status === 'pending') && r.books.length === 0, JSON.stringify(r.st.bookings)); }

{ const e1 = ev(evId('c_bk_1', 'G1aaaaaaaaaaaaaaaaaaaaaa'), 'c_bk_1', 'Ann One', day(8), '10:00 AM', { sqMissed: 'x' });
  const e2 = ev(evId('c_bk_1', 'G2bbbbbbbbbbbbbbbbbbbbbb'), 'c_bk_1', 'Ann One', day(9), '10:00 AM', { sqMissed: 'x' });
  const r = await run('G', { events: [e1, e2], squareServices: SVC });
  check('G two bookings by one client get two different Square keys', r.books.length === 2 && r.books[0].idempotencyKey !== r.books[1].idempotencyKey, JSON.stringify(r.books.map(x => x.idempotencyKey))); }

await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.n + (x.d && !x.pass ? '  — ' + String(x.d).slice(0, 300) : '')); }
console.log(`\n${ENGINE}: ${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
