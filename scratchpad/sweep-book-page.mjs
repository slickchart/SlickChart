// BOOKING PAGE SWEEP (rotation area 3, 2026-11-18). Renders the real api/book-page.js (db stubbed), serves
// it, and drives what a stranger booking from Instagram does, at phone and computer size, with
// /api/book-slots and /api/book-request answering: ok | 500 | offline | taken | html (a Vercel error page).
// usage: MODE=request|instant SIZE=phone|mac SLOTS=ok|500|offline REQ=ok|500|offline|taken|html node scratchpad/sweep-book-page.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';
const MODE = process.env.MODE || 'instant', SIZE = process.env.SIZE || 'phone', SLOTS = process.env.SLOTS || 'ok', REQ = process.env.REQ || 'ok';
const src = path.resolve(new URL('../slickchart-vercel/', import.meta.url).pathname);
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bookpg-')); fs.mkdirSync(d + '/api'); fs.mkdirSync(d + '/lib');
fs.copyFileSync(src + '/api/book-page.js', d + '/api/book-page.js');
fs.copyFileSync(src + '/lib/public-brand.js', d + '/lib/public-brand.js');
fs.writeFileSync(d + '/package.json', '{"type":"module"}');
fs.writeFileSync(d + '/lib/db.js', 'export const dbEnabled=()=>true; export async function getKVValue(){return null;}');
fs.writeFileSync(d + '/lib/consult.js', 'export async function getProviderBySlug(s){return {id:"p1",name:"Rose Glow Skin"};}');
const all = '{sun:{open:true,start:"09:00",end:"17:00"},mon:{open:true,start:"09:00",end:"17:00"},tue:{open:true,start:"09:00",end:"17:00"},wed:{open:true,start:"09:00",end:"17:00"},thu:{open:true,start:"09:00",end:"17:00"},fri:{open:true,start:"09:00",end:"17:00"},sat:{open:true,start:"09:00",end:"17:00"}}';
fs.writeFileSync(d + '/lib/booking.js', `
export const DAY_KEYS=['sun','mon','tue','wed','thu','fri','sat'];
export const toMins=s=>{const [h,m]=String(s).split(':').map(Number);return h*60+(m||0);};
export const openDayKeys=h=>DAY_KEYS.filter(k=>h[k]&&h[k].open);
export const serviceMins=(s,c)=>s.mins||60; export const serviceDeposit=(s)=>s.dep||0;
export async function getBookingConfig(){return {on:true,mode:'${MODE}',horizonDays:30,leadHours:0,requirePhone:true,note:'Parking behind the building.'};}
export async function getHours(){return ${all};}
export async function getServices(){return [{name:'Signature facial',mins:60,desc:'Our most popular.'},{name:'Brow lamination',mins:45,dep:25}];}
`);
const mod = await import(d + '/api/book-page.js');
let html = ''; const res = { setHeader() {}, status() { return res; }, send(b) { html = b; }, end(b) { html = b || html; } };
await mod.default({ query: { slug: 'rose-glow' }, headers: {} }, res);
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { s.setHeader('content-type', 'text/html'); s.end(html); }).listen(PORT);
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const b = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const VP = SIZE === 'mac' ? { viewport: { width: 1440, height: 900 } } : { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const ctx = await b.newContext({ ...VP, serviceWorkers: 'block' }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
let posted = null;
await p.route('**/api/book-slots**', r => SLOTS === 'offline' ? r.abort('internetdisconnected') : SLOTS === '500' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Something went wrong."}' }) : r.fulfill({ status: 200, contentType: 'application/json', body: '{"slots":["9:00 AM","10:00 AM","2:30 PM"]}' }));
await p.route('**/api/book-request**', r => { posted = r.request().postData();
  if (REQ === 'offline') return r.abort('internetdisconnected');
  if (REQ === '500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Something went wrong. Please try again."}' });
  if (REQ === 'html') return r.fulfill({ status: 504, contentType: 'text/html', body: '<html>An error occurred with your deployment</html>' });
  if (REQ === 'taken') return r.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Sorry — that time was just taken. Please pick another.","code":"taken"}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, confirmed: MODE === 'instant', when: 'Fri, Nov 20 at 10:00 AM' }) }); });
await p.goto('http://localhost:' + PORT + '/book/rose-glow'); await p.waitForTimeout(1500);
const out = { MODE, SIZE, SLOTS, REQ };
const T = () => p.evaluate(() => document.body.innerText);
out.first = (await T()).slice(0, 900);
const sh = (n) => p.screenshot({ path: `/tmp/claude-0/book-${MODE}-${SIZE}-${SLOTS}-${REQ}-${n}.png`, fullPage: true });
await sh('1');
// Submit with nothing filled.
await p.click('#go'); await p.waitForTimeout(300); out.empty = await p.evaluate(() => document.getElementById('err').innerText);
await p.fill('#f-name', 'Jo Test'); await p.fill('#f-email', 'jo@ex.com'); await p.fill('#f-phone', '5550001111');
await p.selectOption('#f-svc', { index: 1 }); await p.waitForTimeout(800);
out.afterSvc = (await p.evaluate(() => [document.getElementById('slots').innerText, document.getElementById('go').innerText, (document.getElementById('depnote') || {}).innerText])).join(' | ');
const slot = await p.$('.slot'); if (slot) await slot.click(); else { const t = await p.$('#f-time'); if (t && await t.isVisible()) await t.fill('10:00'); }
await p.click('#go'); await p.waitForTimeout(1200);
out.after = (await T()).slice(0, 700); out.err = await p.evaluate(() => (document.getElementById('err') || {}).innerText || '');
out.btn = await p.evaluate(() => (document.getElementById('go') || {}).innerText || '');
out.posted = posted ? JSON.parse(posted).time : null;
out.overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
await sh('2'); out.errs = errs;
console.log(JSON.stringify(out, null, 1));
await b.close(); srv.close();
