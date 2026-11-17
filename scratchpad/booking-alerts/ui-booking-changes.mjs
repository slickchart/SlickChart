// Her app, when a client changed or cancelled from their "Change or cancel" link
// (_clientBookingChanges in slickchart.html): the old entry closes and leaves her calendar and her
// Google feed, a move becomes a new entry (a request she confirms, or booked), each change is applied
// once on any number of polls and devices, a stale device cannot undo it, and Booking link shows her
// switch and cut-off. Phone and computer width.
// Run: node scratchpad/booking-alerts/ui-booking-changes.mjs   (WebKit: bash scratchpad/run-in-safari.sh <this>)
import { readFileSync } from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const HTML = readFileSync(new URL('../../slickchart-vercel/slickchart.html', import.meta.url), 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const engine = process.env.PW_ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const browser = await engine.launch(process.env.PW_ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium' });
for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
  const pushed = [];
  await page.route('**/api/**', r => { const u = r.request().url(); if (r.request().method() !== 'GET') pushed.push({ u, b: r.request().postData() || '' });
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"requests":[]}' }); });
  await page.route('https://app.test/slickchart.html', r => r.fulfill({ contentType: 'text/html', body: HTML }));
  await page.goto('https://app.test/slickchart.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const W = width + 'px: ';
  const res = await page.evaluate(() => {
    Cloud._booting = false; Cloud._pulledOnce = true;
    const d = new Date(Date.now() + 5 * 86400000), d2 = new Date(Date.now() + 7 * 86400000);
    const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const A = { id: 'ev_idem_A', clientId: 'cR', client: 'Riley Park', treatment: 'Facial', date: iso(d), time: '2:00 PM', status: 'confirmed', decidedAt: Date.now() - 60000, created: Date.now() - 90000 };
    SlickBridge.setBookings([A]);
    addConfirmedAppt(A);
    manualAppts.unshift({ id: 'ma_req_ev_idem_A', client: 'Riley Park', tx: 'Facial', date: A.date, time: A.time, _ts: Date.now() });
    _saveManualAppts();
    const out = {};
    const nf0 = notifFeed.length;
    const mv = { id: 'ev_idem_M1', kind: 'booking_change', client_id: 'cR', created_at: Date.now(),
      payload: { ref: 'ev_idem_A', prevId: 'ev_idem_A', action: 'move', date: iso(d2), time: '3:00 PM', dateLabel: '', prevDate: A.date, prevTime: A.time,
        treatment: 'Facial', client: 'Riley Park', prevStatus: 'confirmed', confirmed: false, squareDone: true } };
    out.applied = _clientBookingChanges([mv]);
    let all = SlickBridge.getBookings();
    const a = all.find(x => x.id === 'ev_idem_A'), n = all.find(x => x.id === 'ev_idem_M1');
    out.oldStatus = a && a.status; out.movedTo = a && a.movedTo; out.newStatus = n && n.status; out.newTime = n && (n.date + ' ' + n.time);
    out.offCal = !confirmedAppts.some(x => x.client === 'Riley Park' && x.time === '2:00 PM');
    out.offGoogle = !manualAppts.some(x => x.id === 'ma_req_ev_idem_A');
    out.tomb = !!(JSON.parse(localStorage.getItem('sc_deleted_appts') || '{}')['ma_req_ev_idem_A']);
    out.notif = notifFeed[0] && notifFeed[0].title;
    out.pending = pendingRequests().map(x => x.id);
    // the next poll, and a second device that already has the result
    const n1 = SlickBridge.getBookings().length, f1 = notifFeed.length;
    _bkChangeDone = Object.create(null);
    out.again = _clientBookingChanges([mv]);
    out.noDup = SlickBridge.getBookings().length === n1 && notifFeed.length === f1;
    out.notifAdded = f1 - nf0;
    // a stale device still holding the original as confirmed cannot undo the close
    const stale = JSON.stringify([Object.assign({}, A)]);
    const m = _mergeBookings(stale, localStorage.getItem('sc_bookings'));
    const mm = JSON.parse(m.str);
    out.mergeOld = (mm.find(x => x.id === 'ev_idem_A') || {}).status; out.mergeNew = (mm.find(x => x.id === 'ev_idem_M1') || {}).status;
    const m2 = JSON.parse(_mergeBookings(localStorage.getItem('sc_bookings'), stale).str);
    out.mergeOld2 = (m2.find(x => x.id === 'ev_idem_A') || {}).status;
    // then they cancel: it closes the MOVED entry
    const cx = { id: 'ev_idem_C1', kind: 'booking_change', client_id: 'cR', created_at: Date.now() + 5,
      payload: { ref: 'ev_idem_A', prevId: 'ev_idem_M1', action: 'cancel', date: iso(d2), time: '3:00 PM', treatment: 'Facial', client: 'Riley Park', prevStatus: 'pending', squareDone: false } };
    _clientBookingChanges([mv, cx]);
    all = SlickBridge.getBookings();
    out.afterCancel = (all.find(x => x.id === 'ev_idem_M1') || {}).status;
    out.pendingAfter = pendingRequests().length;
    out.cancelNotif = notifFeed[0] && notifFeed[0].title;
    // an instant move Square already re-timed: booked, on her calendar, not sent out again
    const B = { id: 'ev_idem_B', clientId: 'cS', client: 'Sky Lane', treatment: 'Brows', date: iso(d), time: '10:00 AM', status: 'confirmed', instant: true, outSent: true, squareBookingId: 'BK1', decidedAt: Date.now() - 1000 };
    SlickBridge.setBookings([B].concat(SlickBridge.getBookings())); addConfirmedAppt(B);
    _clientBookingChanges([{ id: 'ev_idem_M2', kind: 'booking_change', client_id: 'cS', created_at: Date.now(),
      payload: { ref: 'ev_idem_B', prevId: 'ev_idem_B', action: 'move', date: iso(d2), time: '11:00 AM', treatment: 'Brows', client: 'Sky Lane', prevStatus: 'confirmed', confirmed: true, squareDone: true, squareBookingId: 'BK1' } }]);
    const nb = SlickBridge.getBookings().find(x => x.id === 'ev_idem_M2') || {};
    out.instant = [nb.status, nb.outSent, nb.squareBookingId].join('|');
    out.instantCal = confirmedAppts.some(x => x.client === 'Sky Lane' && x.time === '11:00 AM') && !confirmedAppts.some(x => x.client === 'Sky Lane' && x.time === '10:00 AM');
    // Square could not cancel the old time: she is told to do it
    const C = { id: 'ev_idem_D', clientId: 'cD', client: 'Dee Fox', treatment: 'Facial', date: iso(d), time: '9:00 AM', status: 'confirmed', decidedAt: Date.now() - 1000 };
    SlickBridge.setBookings([C].concat(SlickBridge.getBookings()));
    _clientBookingChanges([{ id: 'ev_idem_C2', kind: 'booking_change', client_id: 'cD', created_at: Date.now(),
      payload: { ref: 'ev_idem_D', prevId: 'ev_idem_D', action: 'cancel', treatment: 'Facial', client: 'Dee Fox', prevStatus: 'confirmed', squareDone: false, squareWhy: 'Square said no' } }]);
    out.sqWarn = notifFeed.slice(0, 3).some(x => x.title === 'Change it in Square too');
    // during boot nothing is applied (the account has not been read yet)
    Cloud._booting = true;
    out.boot = _clientBookingChanges([{ id: 'ev_idem_C3', kind: 'booking_change', client_id: 'cD', created_at: Date.now(), payload: { ref: 'zz', action: 'cancel' } }]);
    Cloud._booting = false;
    return out;
  });
  ok(res.applied === true && res.oldStatus === 'cancelled' && res.movedTo === 'ev_idem_M1', W + 'a move closes the old entry (' + res.oldStatus + ')');
  ok(res.newStatus === 'pending' && /3:00 PM/.test(res.newTime) && res.pending.includes('ev_idem_M1'), W + 'and the new time waits in Booking Requests for her');
  ok(res.offCal && res.offGoogle && res.tomb, W + 'the old time leaves her calendar and her Google feed, with a delete record');
  ok(res.notif === 'New time requested', W + 'her notifications say "New time requested" (' + res.notif + ')');
  ok(res.again === false && res.noDup && res.notifAdded === 1, W + 'the next poll or a second device does not apply it twice');
  ok(res.mergeOld === 'cancelled' && res.mergeOld2 === 'cancelled' && res.mergeNew === 'pending', W + 'a stale device holding the old booking cannot undo it, either way round');
  ok(res.afterCancel === 'cancelled' && res.pendingAfter === 0 && res.cancelNotif === 'Booking cancelled', W + 'a cancel after the move closes the moved request');
  ok(res.instant === 'confirmed|true|BK1' && res.instantCal, W + 'an instant move is booked at the new time and not sent out to Square a second time');
  ok(res.sqWarn, W + 'when Square could not cancel the old time, she is told to');
  ok(res.boot === false, W + 'nothing is applied while the app is still loading her account');

  await page.evaluate(() => nav('requests')); await page.waitForTimeout(300);
  const rq = await page.$eval('#S', e => e.innerText);
  ok(/Moved/.test(rq) && /Cancelled/.test(rq), W + 'Booking Requests shows Moved and Cancelled under recent decisions');

  await page.evaluate(() => { bookCfg.on = true; bookCfg.squareUrl = ''; renderBookingLink(); }); await page.waitForTimeout(200);
  let bl = await page.$eval('#S', e => e.innerText);
  ok(/Changes and cancellations/i.test(bl) && /Let them change or cancel/.test(bl) && /Up to how long before/.test(bl), W + 'Booking link shows her change/cancel switch and cut-off');
  const sel = await page.$eval('#bk-changes select', s => s.options[s.selectedIndex].text);
  ok(sel === '1 day', W + 'the cut-off starts at 1 day, and she can change it (' + sel + ')');
  const before = pushed.length;
  await page.selectOption('#bk-changes select', '48'); await page.waitForTimeout(1200);
  ok(JSON.parse(await page.evaluate(() => localStorage.getItem('sc_booking_page'))).changeHours === 48 && pushed.slice(before).some(p => /sc_booking_page/.test(p.b)), W + 'picking 2 days saves it to her account');
  await page.evaluate(() => _bookSet('clientChanges', false)); await page.waitForTimeout(200);
  bl = await page.$eval('#S', e => e.innerText);
  ok(/Off\. Their email says to reply/.test(bl) && !/Up to how long before/.test(bl), W + 'switching it off says so and hides the cut-off');
  const ov = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(ov, W + 'nothing runs off the side of the screen');
  await page.close();
}
await browser.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
