// Kristen 2026-11-17: her link could not read her calendar, fell back to "request a time", opened on
// TODAY and refused the time with "has passed or is too soon". The page must open on the first day her
// notice allows, say the notice, and refuse a too-soon day before sending.
// Run: node scratchpad/test-book-lead-notice.mjs   (WebKit: bash scratchpad/run-in-safari.sh <this>)
import fs from 'fs'; import os from 'os'; import path from 'path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const src = path.resolve('slickchart-vercel');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'booklead-')); fs.mkdirSync(d + '/api'); fs.mkdirSync(d + '/lib');
fs.copyFileSync(src + '/api/book-page.js', d + '/api/book-page.js');
fs.copyFileSync(src + '/lib/public-brand.js', d + '/lib/public-brand.js');
fs.writeFileSync(d + '/package.json', '{"type":"module"}');
fs.writeFileSync(d + '/lib/db.js', 'export const dbEnabled=()=>true; export async function getKVValue(){return null;}');
fs.writeFileSync(d + '/lib/consult.js', 'export async function getProviderBySlug(s){return {id:"p1",name:"Wellness"};}');
const LEAD = +(process.env.LEAD || 12);
fs.writeFileSync(d + '/lib/booking.js', `
export const DAY_KEYS=['sun','mon','tue','wed','thu','fri','sat'];
export async function providerTz(){return ${JSON.stringify(process.env.PROV_TZ || 'America/Los_Angeles')};}
export const toMins=s=>{const [h,m]=String(s).split(':').map(Number);return h*60+(m||0);};
export const openDayKeys=h=>DAY_KEYS.filter(k=>h[k]&&h[k].open);
export const serviceMins=(s,c)=>s.mins||60; export const serviceDeposit=()=>0;
export async function getBookingConfig(){return {on:true,mode:'instant',horizonDays:30,leadHours:${LEAD},requirePhone:false,note:''};}
export async function getHours(){const o={open:true,start:'00:00',end:'23:59'};return {sun:o,mon:o,tue:o,wed:o,thu:o,fri:o,sat:o};}
export async function getServices(){return [{name:'Glow Starter Consult',mins:30,desc:'A first visit: skin chat & <b>plan</b>.'},{name:'Glow Membership',mins:45}];}
`);
const mod = await import(d + '/api/book-page.js');
let html = ''; const res = { setHeader() {}, status() { return res; }, send(b) { html = b; } };
await mod.default({ query: { slug: 'wellness' } }, res);

const engine = process.env.PW_ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const browser = await engine.launch(process.env.PW_ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
let posted = 0;
await page.route('**/api/book-slots**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, mode: 'request', unknown: true, slots: [] }) }));
await page.route('**/api/book-request', r => { posted++; r.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"x"}' }); });
await page.route('https://book.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
// Fix the clock at 11:30am local so "today" is inside a 12-hour notice.
await page.clock.install({ time: new Date(2026, 10, 17, 11, 30) });
await page.goto('https://book.test/book/wellness');
await page.waitForTimeout(400);
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const dateVal = await page.$eval('#f-date', e => e.value);
ok(dateVal === (LEAD >= 13 ? '2026-11-18' : (LEAD > 12 ? '2026-11-18' : '2026-11-17')) || (LEAD === 12 && dateVal === '2026-11-17'), 'opens on a day her notice allows: ' + dateVal);
const slotsTxt = await page.$eval('#slots', e => e.textContent);
ok(/need 12 hours of notice/.test(slotsTxt), 'request mode says the notice: ' + slotsTxt);
ok(await page.$eval('#f-time', e => e.style.display !== 'none'), 'time field shown in request mode');
// Pick yesterday-ish: a day already over -> refused on the page, nothing sent.
await page.$eval('#f-date', e => { e.min = ''; e.value = '2026-11-16'; e.dispatchEvent(new Event('change')); });
await page.waitForTimeout(100);
const t2 = await page.$eval('#slots', e => e.textContent);
ok(/too soon/.test(t2) && await page.$eval('#f-time', e => e.style.display === 'none'), 'a day inside the notice is refused on the page: ' + t2);
// A 24h notice: tomorrow 11:30 is the edge; day after is fine.
await page.$eval('#f-date', e => { e.value = '2026-11-19'; e.dispatchEvent(new Event('change')); });
await page.waitForTimeout(100);
ok(await page.$eval('#f-time', e => e.style.display !== 'none'), 'a later day offers a time');
ok(posted === 0, 'nothing was sent');
const desc1 = await page.$eval('#svcdesc', e => e.style.display !== 'none' && e.textContent);
ok(desc1 === 'A first visit: skin chat & <b>plan</b>.', 'service description shows, as text: ' + desc1);
await page.selectOption('#f-svc', 'Glow Membership'); await page.waitForTimeout(50);
ok(await page.$eval('#svcdesc', e => e.style.display === 'none'), 'no description: nothing shown');
await browser.close();
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
