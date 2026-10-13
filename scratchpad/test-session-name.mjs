// Session names default to "<date> · <service booked that day>", or just the date. A name she set
// with Rename (or an old renamed one like "Test A") survives a later save of the same session.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.goto('http://localhost:8899/' + FILE, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  CL.mg = { name: 'Megan LaMantia-Bishop', treatment: 'New client' };
  CL.nb = { name: 'No Booking', treatment: 'New client' };
  squareAppts = [{ at: new Date(2026, 9, 13, 16, 0), client: 'Megan LaMantia-Bishop', tx: 'Signature Facial' },
                 { at: new Date(2026, 9, 14, 16, 0), client: 'Megan LaMantia-Bishop', tx: 'Wrong Day Peel' }];
  manualAppts.push({ id: 'm1', clientId: 'nb', client: 'No Booking', tx: 'Appointment', date: '2026-10-13' });
  const out = { withSvc: _sessionDefaultName('mg', '2026-10-13'), noSvc: _sessionDefaultName('nb', '2026-10-13'), otherDay: _sessionDefaultName('mg', '2026-10-15') };
  out.keepNamed = _sessionNameFor({ treatment: 'My name', _named: true }, 'mg', '2026-10-13');
  out.keepOld = _sessionNameFor({ treatment: 'Test A' }, 'mg', '2026-10-13');
  out.replacePlaceholder = _sessionNameFor({ treatment: 'New client' }, 'mg', '2026-10-13');
  return out;
});
check('date + booked service', r.withSvc === 'Oct 13, 2026 · Signature Facial', r.withSvc);
check('no named service: just the date', r.noSvc === 'Oct 13, 2026', r.noSvc);
check('another day\'s booking is not used', r.otherDay === 'Oct 15, 2026', r.otherDay);
check('a Rename is kept', r.keepNamed === 'My name');
check('an older renamed session ("Test A") is kept', r.keepOld === 'Test A');
check('the placeholder "New client" is replaced', r.replacePlaceholder === 'Oct 13, 2026 · Signature Facial', r.replacePlaceholder);
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
