// FIXES FROM THE NEW-PROVIDER SWEEP (test-new-provider-wide.mjs). Boot copied from sweep-new-provider-wide.mjs (2026-11-18, after Frances cancelled her trial saying
// "there were several options that I couldnt get to work properly"). She used an iMac in Safari, an iPad
// app and an iPhone app, Square connected, 293 imported clients. Every earlier whole-app sweep ran at
// phone width on the demo page, so this one runs the REAL provider page, signed in, as a brand-new
// account with Square connected, at: Mac Safari (WebKit, mouse, 1440x900), iPad app (WebKit, touch,
// Capacitor, 1032x1376) and a big iMac window (2048x1152).
// For every screen reachable by nav(...) it records: render errors, sideways overflow, and then taps
// every control on a freshly drawn copy of the screen and records page errors, taps that change nothing,
// and any sheet/popup that opens OFF the visible window or with its buttons out of reach.
// usage: SIZE=mac|ipad|imac [PW_ENGINE=chromium] node scratchpad/sweep-new-provider-wide.mjs [out.json]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const SIZE = process.env.SIZE || 'mac';
const OUT = process.argv[2] || `/tmp/claude-0/sweep-wide-${SIZE}.json`;
const SHOTS = process.env.SHOTS || '';
const VP = { mac: { width: 1440, height: 900 }, ipad: { width: 1032, height: 1376 }, imac: { width: 2048, height: 1152 }, phone: { width: 390, height: 844 } }[SIZE];
const TOUCH = SIZE === 'ipad' || SIZE === 'phone';
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const SKIP = /logout|_doLogout|signOut|sign out|deleteAccount|delete-account|_doDelete|wipe|purge|_resetApp|resetAll|clearAll|_doDeleteClientData|location\.reload|_reloadApp|window\.location|location\.href=|_hardRefresh|_forceUpdate|removeDemoClients|_setShotMode\(true|cancelSub|_sqDisconnect|disconnect/i;
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const ctx = await browser.newContext({ viewport: VP, hasTouch: TOUCH, isMobile: false, serviceWorkers: 'block' });
const page = await ctx.newPage();
let errs = [], cerrs = []; const launchPosts = [];
page.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|net::|favicon|fonts\.g|tabler|ERR_|404|status of|Load failed|access control|due to access/i.test(t)) cerrs.push(t.slice(0, 200)); } });
page.on('dialog', d => d.dismiss().catch(() => {}));
page.on('popup', p => p.close().catch(() => {}));
// A brand-new esthetician, Square connected, clients imported from Square, setup finished.
const now = Date.now();
const clients = {}; for (let i = 0; i < 40; i++) { const id = 'sq_CUST' + i; clients[id] = { id, name: ['Ava', 'Bea', 'Cora', 'Dana', 'Eve'][i % 5] + ' ' + ['Lane', 'Moss', 'Reed', 'Stone'][i % 4] + ' ' + i, email: 'c' + i + '@ex.com', phone: '555010' + String(i).padStart(4, '0'), sqId: 'CUST' + i, source: 'square', created: now - 86400000 * 3, _ts: now - 86400000 * 3, visits: [], notes: [] }; }
const seed = { sc_clients: JSON.stringify(clients), sc_onboarded: '1', sc_professions: JSON.stringify(['esthetician']), sc_wsname: JSON.stringify('Frances Skin Studio'),
  sc_bizinfo: JSON.stringify({ name: 'Frances Skin Studio', phone: '5550100000', email: 'studio@ex.com' }) };
await page.addInitScript(([app, native]) => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_login_email', 'new@spa.com'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {}
  if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; };
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
  try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (e) {} }, ['provider', SIZE === 'ipad' || SIZE === 'phone']);
await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('/api/app-launch')) { try { launchPosts.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {} }
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: seed }) });
  if (u.includes('/api/square/connection')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"oauth":true,"connected":true,"env":"production","merchantName":"Frances Skin Studio"}' });
  if (u.includes('/api/billing-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"active":true,"status":"trialing","plan":"pro"}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[],"items":[]}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.goto('http://localhost:' + PORT + '/slickchart.html', { waitUntil: 'load' }); await page.waitForTimeout(9000);


let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + SIZE + ' ' + m); if (!c) fails++; };
const computer = SIZE === 'mac' || SIZE === 'imac';
// 1. Home's app banner never tells a computer to go download the app.
const ban = await page.evaluate(() => { nav('home'); const b = document.getElementById('getapp-banner'); return b ? b.innerText : ''; });
if (SIZE === 'ipad') ok(ban === '', 'the iPad app shows no download banner');
else if (computer) ok(/works right here on your computer/.test(ban) && !/For the best experience, download/.test(ban), 'a computer browser is told SlickChart works right here (got: ' + ban.slice(0, 60).replace(/\n/g, ' ') + ')');
else ok(/download the app/.test(ban) || ban === '', 'a phone still gets the download nudge');
// 2. Calendar: on a wide screen the picked day sits beside the month, inside the window.
const cal = await page.evaluate(() => { nav('calendar'); const m = document.querySelector('.cal-month'), d = document.querySelector('.cal-day'); if (!m || !d) return null;
  const a = m.getBoundingClientRect(), b = d.getBoundingClientRect(); return { side: b.left >= a.right - 2 && Math.abs(b.top - a.top) < 4, dayTop: b.top, vh: innerHeight }; });
if (SIZE === 'phone') ok(cal && !cal.side, 'phone calendar stays stacked');
else ok(cal && cal.side && cal.dayTop < cal.vh, 'the picked day shows beside the month, in view (' + JSON.stringify(cal) + ')');
const pick = await page.evaluate(() => { _calPick(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-15'); const d = document.querySelector('.cal-day'); return d ? d.innerText.slice(0, 40) : ''; });
ok(/15/.test(pick), 'clicking a day updates the day panel (' + pick.replace(/\n/g, ' ') + ')');
// 3. Setup: the Next button is in view on the long profession step, and profession names are readable.
const ob = await page.evaluate(() => { showOnboarding(); onboardStep = ONBOARD_STEPS.indexOf('profession'); renderOnboard();
  const o = document.getElementById('onboard-overlay'); const nx = [...o.querySelectorAll('button')].find(b => /^Next$/.test(b.textContent.trim())); const r = nx.getBoundingClientRect();
  const nm = o.querySelector('.prof-pick span:nth-child(2)'); const col = getComputedStyle(nm).color; const out = { inView: r.bottom <= innerHeight && r.top >= 0, col };
  o.remove(); return out; });
ok(ob.inView, 'setup Next is in view without scrolling');
ok(!/204, 204, 204/.test(ob.col), 'profession names are not light grey (' + ob.col + ')');
// 4. The Square card's logo is a real icon (it drew an empty box).
const sq = await page.evaluate(() => { showOnboarding(); onboardStep = ONBOARD_STEPS.indexOf('square'); renderOnboard(); const o = document.getElementById('onboard-overlay');
  const blank = [...o.querySelectorAll('i.ti')].filter(i => { const c = getComputedStyle(i, '::before').content; return !c || c === 'none' || c === 'normal'; }).map(i => i.className); o.remove(); return blank; });
ok(sq.length === 0, 'every icon on the Square step draws (' + sq.join(',') + ')');
// 5. Native camera: refused -> says how to turn it on; cancelled -> silent; no plugin -> browser picker opens.
const cam = await page.evaluate(async () => {
  const out = {}; const realNative = window._isNativeApp; window._isNativeApp = () => true; const saveCap = window.Capacitor;
  const toasts = []; const oT = window.proToast; window.proToast = function (m) { toasts.push(String(m)); };
  let clicked = 0; const oE = window._ensureCamInput; window._ensureCamInput = function () { return { click() { clicked++; }, set value(v) {}, files: null }; };
  const run = async (plug) => { window.Capacitor = Object.assign({}, saveCap || {}, { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: plug }); toasts.length = 0; clicked = 0;
    let after = 0; takePhoto('sq_CUST1', '', () => { after++; }); await new Promise(r => setTimeout(r, 50)); return { toasts: toasts.slice(), clicked, after }; };
  out.denied = await run({ Camera: { getPhoto: () => Promise.reject(new Error('User denied access to camera')) } });
  out.cancel = await run({ Camera: { getPhoto: () => Promise.reject(new Error('User cancelled photos app')) } });
  out.noplug = await run({});
  window._isNativeApp = realNative; window.Capacitor = saveCap; window.proToast = oT; window._ensureCamInput = oE; return out; });
ok(cam.denied.toasts.some(t => /Settings/.test(t)) && cam.denied.after === 1, 'camera refused: tells her to turn it on in Settings');
ok(cam.cancel.toasts.length === 0 && cam.cancel.clicked === 0 && cam.cancel.after === 1, 'camera cancelled: nothing shown');
ok(cam.noplug.clicked === 1, 'no camera plugin: the photo picker opens instead of nothing');
// 6. A signed-in browser keeps a launch log now, with what failed, and no client data in it.
if (computer) {   // ipad and phone boot as the store app (Capacitor), which always logged
  const lg = await page.evaluate(() => { proToast('Couldn’t send to Ava Lane 0 at c0@ex.com or 555-010-0000', 0, 'error'); return JSON.parse(localStorage.getItem('scnat_log') || '[]'); });
  const te = lg.filter(e => e.e === 'toast-err').map(e => e.d);
  ok(lg.some(e => e.e === 'launch') && lg.some(e => e.e === 'screen'), 'the browser logs its launch and screens');
  ok(te.length && !/Ava|Lane|c0@ex|555/.test(te.join(' ')) && /\[client\]/.test(te.join(' ')), 'the "did not work" message is logged without the client’s name, email or phone (' + te.join(' | ') + ')');
  await page.evaluate(() => _alSend(true)); await page.waitForTimeout(400);
  const plat = (launchPosts[launchPosts.length - 1] || {}).platform;
  ok(process.env.PW_ENGINE === 'chromium' ? /^web/.test(plat || '') : plat === 'web-mac', 'the log names the kind of browser (' + plat + ')');
}
ok(errs.length === 0, 'no page errors (' + errs.join(' | ') + ')');
await browser.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
