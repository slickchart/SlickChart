// Notification preferences: the Bookings, Payments and client switches show ON for a provider whose
// settings were saved before they existed, a tap turns one off and syncs it, and a push tap for a
// Square booking / payment / consult request lands on the right screen.
// Run: node scratchpad/booking-alerts/ui-notif-prefs.mjs   (WebKit: bash scratchpad/run-in-safari.sh <this>)
import { readFileSync } from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const HTML = readFileSync(new URL('../../slickchart-vercel/slickchart.html', import.meta.url), 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const engine = process.env.PW_ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const browser = await engine.launch(process.env.PW_ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium' });
for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.addInitScript(() => { try {
    localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1');
    // Saved by an older build: none of the new switches in it, and her own choice newMessage:false.
    localStorage.setItem('sc_notif_settings', JSON.stringify({ newCheckin: true, formSigned: true, newMessage: false, rebookReminder: false }));
  } catch (e) {} });
  const pushed = [];
  await page.route('**/api/**', r => { const u = r.request().url(); if (r.request().method() !== 'GET') pushed.push({ u, b: r.request().postData() || '' });
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"requests":[]}' }); });
  await page.route('https://app.test/slickchart.html', r => r.fulfill({ contentType: 'text/html', body: HTML }));
  await page.goto('https://app.test/slickchart.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => { loadNotifSettings(); nav('notifications'); return Object.assign({}, notifSettings); });
  await page.waitForTimeout(200);
  ok(['bookingNew','bookingRequest','bookingChanged','bookingCancelled','consultRequest','paymentReceived','refundProcessed','productRequest','clientDetails'].every(k => st[k] === true), width + 'px: every new switch reads ON for an old saved blob');
  ok(st.newMessage === false, width + 'px: her own earlier choice is kept (newMessage off)');
  const txt = await page.$eval('#S', e => e.innerText);
  ok(/Bookings/.test(txt) && /New Booking/.test(txt) && /Booking Cancelled/.test(txt) && /Payment Received/.test(txt) && /Product Request/.test(txt), width + 'px: the screen shows the Bookings, Payments and Product Request switches');
  // Tap "Booking Cancelled" off.
  const before = pushed.length;
  await page.evaluate(() => { notifSettings['bookingCancelled'] = !notifSettings['bookingCancelled']; persistNotifSettings(); renderNotifications(); });
  await page.waitForTimeout(1500);
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('sc_notif_settings')));
  ok(saved.bookingCancelled === false && saved.bookingNew === true, width + 'px: turning one off saves it and leaves the rest on');
  ok(pushed.slice(before).some(p => /sc_notif_settings/.test(p.b)), width + 'px: and it goes up to her account (so the server honours it)');
  const routes = await page.evaluate(() => {
    const out = {};
    for (const k of ['calendar', 'payments', 'consult']) { _routeDeepLink(k, '', 'x'); out[k] = document.getElementById('tt').textContent; }
    return out;
  });
  ok(/Calendar/i.test(routes.calendar), width + 'px: a Square booking alert opens the Calendar (' + routes.calendar + ')');
  ok(/Payments/i.test(routes.payments), width + 'px: a payment alert opens Payments (' + routes.payments + ')');
  ok(/consult/i.test(routes.consult), width + 'px: a consult request opens Photo consults (' + routes.consult + ')');
  await page.close();
}
await browser.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
