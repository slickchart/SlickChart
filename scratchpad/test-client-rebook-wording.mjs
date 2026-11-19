// Client app booking: no "she" for the provider (barbers and tattoo artists use SlickChart too).
import { launch, mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
let fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + JSON.stringify(d))); if (!c) fails++; };
const avail = {}; ['sun','mon','tue','wed','thu','fri','sat'].forEach(k => avail[k] = { open: true, start: '09:00', end: '17:00' });
const opts = { records: { TOK: clientRecord('c1', 'Cara Client', { providerName: 'Marco Rossi', availability: avail, bookingAvail: avail, services: [], treatments: [] }) },
  handler: (req, p, t, J) => p === '/api/client-availability' ? J({ ok: false, unknown: true }) : null };
await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { rebookAvail = rebookAvail || {}; ['sun','mon','tue','wed','thu','fri','sat'].forEach(k => rebookAvail[k] = { open: true, start: '09:00', end: '17:00' }); nav('rebook'); });
await page.waitForTimeout(600);
await page.evaluate(() => { const d = new Date(Date.now() + 3 * 864e5); selectRebookDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); });
await page.waitForTimeout(800);
const txt = await page.evaluate(() => document.getElementById('S').innerText);
const who = await page.evaluate(() => client.providerFirst);
ok(!/\b[Ss]he\b|\bher services\b/.test(txt), 'no she/her for the provider on the booking screen', txt.match(/.{0,40}\b[Ss]he\b.{0,40}/));
ok(new RegExp(who + ' will confirm').test(txt), 'uses the provider name: ' + who, txt.slice(0, 400));
await browser.close();
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
