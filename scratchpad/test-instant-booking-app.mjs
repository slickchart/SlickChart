// The provider app sends an INSTANT booking from her link out to Square / Google (2026-11-11).
//   (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-instant-booking-app.mjs
//   ENGINE=webkit (or bash scratchpad/run-in-safari.sh) for Safari's engine.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899; const ENGINE = process.env.ENGINE || 'chromium';
const launchOpts = ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium' };
const br = await pw[ENGINE].launch(launchOpts);
const R = []; const check = (n, p, d) => R.push({ n, pass: !!p, d: d || '' });
const DAY = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
const PAST = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
const ev = (id, extra, date) => ({ id, client_id: 'c1', kind: 'booking', seen: false, created_at: Date.now(), payload: Object.assign({ treatment: 'Facial', date: date || DAY, dateLabel: 'x', time: '10:00 AM', via: 'booking-link', autoConfirmed: true }, extra || {}) });

async function run(label, { events, live, squareHas, localBookings, polls = 2 }) {
  const kv = { sc_hide_sample: '1', sc_onboarded: '1', sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Ann One', email: 'ann@x.com' } }) };
  if (localBookings) { kv.sc_bookings = JSON.stringify(localBookings); kv.sc_seen_events = JSON.stringify(events.map(e => e.id)); }
  let ready = false;   // the app polls on its own at boot: hand it the events only once the stubs are in
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
    if (u.includes('/api/store')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (/\/api\/clients(\?|$)/.test(u) && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [{ id: 'c1', name: 'Ann One', email: 'ann@x.com', opened_at: null }], events: ready ? events : (localBookings ? events.map(e => Object.assign({}, e, { payload: Object.assign({}, e.payload, { autoConfirmed: false }) })) : []) }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 });
  await p.evaluate((cfg) => {
    const calls = window.__calls = [], modals = window.__modals = [];
    window._sqFetch = async function (path, opts) {
      calls.push({ path, body: (opts && opts.body) || null });
      if (path === '/api/square/booking-options') return { services: [{ name: 'Facial', variationId: 'V1', variationVersion: 7, durationMinutes: 60, teamMemberIds: ['TM1'] }], teamMembers: [{ id: 'TM1' }] };
      if (path === '/api/square/book') return { ok: true, booking: { id: 'BKAPP' } };
      return {};
    };
    window._apptsLive = function () { return !!cfg.live; };
    window._loadSquareAppts = async function () { squareAppts = cfg.squareHas ? [{ at: _apptWhen(cfg.day, '10:00 AM'), client: 'Someone Else', tx: 'Wax', dur: 30 }] : []; };
    window.confirmModal = function (o) { modals.push((o && o.title) || ''); };
    window._gcalPushSoon = function () {};
  }, { live, squareHas, day: DAY });
  ready = true;
  const out = await p.evaluate(async (cfg) => {
    const calls = window.__calls, modals = window.__modals;
    for (let i = 0; i < cfg.polls; i++) { try { syncClientEvents._last = null; } catch (e) {} await syncClientEvents(); await new Promise(r => setTimeout(r, 900)); }
    const bks = SlickBridge.getBookings();
    return { books: calls.filter(c => c.path === '/api/square/book').map(c => c.body), modals, bks: bks.map(b => ({ id: b.id, status: b.status, outSent: !!b.outSent, sq: b.squareBookingId || '' })),
      manual: manualAppts.filter(a => a.client === 'Ann One').map(a => a.id + '|' + a.date + '|' + a.time), confirmed: confirmedAppts.filter(a => a.client === 'Ann One').length };
  }, { live, squareHas, polls, day: DAY });
  out.errs = errs; await ctx.close(); return out;
}

let r = await run('server already booked it', { events: [ev('evA', { squareBookingId: 'BK1' })], live: true });
check('already in Square (server did it): app does not book again', r.books.length === 0 && r.bks[0] && r.bks[0].status === 'confirmed' && r.bks[0].outSent && r.bks[0].sq === 'BK1', JSON.stringify(r));
check('...and it is on her SlickChart calendar', r.confirmed === 1 && r.manual.length === 0, JSON.stringify(r));

r = await run('server could not, Square live', { events: [ev('evB')], live: true });
check('server could not: app books it in her Square, once over two polls', r.books.length === 1 && r.books[0].idempotencyKey === 'req-evB' && r.bks[0].outSent, JSON.stringify(r));

r = await run('no Square', { events: [ev('evC')], live: false });
check('no Square: goes to Google through her appointments, once', r.books.length === 0 && r.manual.length === 1 && r.manual[0].startsWith('ma_req_evC|'), JSON.stringify(r));

r = await run('older instant booking, before the fix', { events: [ev('evD')], live: true, localBookings: [{ id: 'evD', clientId: 'c1', client: 'Ann One', treatment: 'Facial', date: DAY, time: '10:00 AM', status: 'confirmed', decidedAt: Date.now() }] });
check('an older instant booking still waiting is sent to Square now', r.books.length === 1 && r.bks.find(b => b.id === 'evD').outSent, JSON.stringify(r));

r = await run('past booking', { events: [ev('evE', {}, PAST)], live: true });
check('a past booking is left alone', r.books.length === 0 && r.manual.length === 0, JSON.stringify(r));

r = await run('a plain request', { events: [ev('evF', { autoConfirmed: false })], live: true });
check('a request she has not confirmed is not sent anywhere', r.books.length === 0 && r.bks[0] && r.bks[0].status === 'pending', JSON.stringify(r));

r = await run('something already at that time', { events: [ev('evG')], live: true, squareHas: true });
check('something already in Square at that time: no double-book, she is asked', r.books.length === 0 && r.modals.includes('Not added to Square'), JSON.stringify(r));
check('no page errors', !r.errs.length, r.errs.join(' | '));

await br.close();
let fail = 0; for (const x of R) { console.log((x.pass ? 'PASS ' : 'FAIL ') + x.n + (x.pass ? '' : '  ' + x.d)); if (!x.pass) fail++; }
console.log('[' + ENGINE + '] ' + (fail ? fail + ' FAILED' : 'ALL ' + R.length + ' PASS')); process.exit(fail ? 1 : 0);
