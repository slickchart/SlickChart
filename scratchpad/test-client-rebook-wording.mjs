// Client app booking: no "she" for the provider (barbers and tattoo artists use SlickChart too).
import { launch, mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
let fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + JSON.stringify(d))); if (!c) fails++; };
const avail = {}; ['sun','mon','tue','wed','thu','fri','sat'].forEach(k => avail[k] = { open: true, start: '09:00', end: '17:00' });
const opts = { records: { TOK: clientRecord('c1', 'Cara Client', { providerName: 'Marco Rossi', availability: avail, bookingAvail: avail, services: [], treatments: [] }) },
  handler: (req, p, t, J) => p === '/api/client-availability' ? J({ ok: false, unknown: true }) : (p === '/api/client-submit' && globalThis.__fail ? J({ error: 'x' }, 500) : null) };
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
// Send with no service listed: the confirmation does not read "requested a  on"
await page.evaluate(() => { rebookState.treatment = ''; const b = document.querySelector('.time-btn'); if (b) selectRebookTime(b.dataset.time); submitRebook(); });
await page.waitForTimeout(1500);
const sent = await page.evaluate(() => document.getElementById('S').innerText);
ok(/requested a visit on/.test(sent), 'no service picked: says "a visit"', sent.slice(0, 300));
// Accepting a suggested time while the send fails keeps the suggestion
globalThis.__fail = true;
await page.evaluate(() => { localStorage.removeItem('sc_suggestion_handled'); client._suggestedBooking = { date: '2027-03-05', time: '10:00 AM', treatment: '' }; _acceptSuggestedTime(); });
await page.waitForTimeout(4500);
let sg = await page.evaluate(() => ({ h: localStorage.getItem('sc_suggestion_handled'), s: !!client._suggestedBooking, txt: document.getElementById('S').innerText.slice(0, 120) }));
ok(!sg.h && sg.s, 'failed send: suggestion kept so she can accept it again', sg);
globalThis.__fail = false;
await page.evaluate(() => submitRebook());
await page.waitForTimeout(2000);
sg = await page.evaluate(() => ({ h: localStorage.getItem('sc_suggestion_handled'), s: !!client._suggestedBooking, txt: document.getElementById('S').innerText.slice(0, 200) }));
ok(sg.h === '2027-03-05|10:00 AM' && !sg.s && /requested a Facial on/.test(sg.txt), "retry succeeds: suggestion marked handled, her real treatment kept", sg);
await browser.close();
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
