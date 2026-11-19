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
let errs = [], cerrs = [];
page.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|net::|favicon|fonts\.g|tabler|ERR_|404|status of|Load failed|access control|due to access/i.test(t)) cerrs.push(t.slice(0, 200)); } });
page.on('dialog', d => d.dismiss().catch(() => {}));
page.on('popup', p => p.close().catch(() => {}));
// A brand-new esthetician, Square connected, clients imported from Square, setup finished.
const now = Date.now();
const clients = {}; for (let i = 0; i < 40; i++) { const id = 'sq_CUST' + i; clients[id] = { id, name: (i < 3 ? 'Ana <img src=x onerror=window.__xss=(window.__xss||0)+1> O\'Neil \"Jo\" ' : '') + ['Ava', 'Bea', 'Cora', 'Dana', 'Eve'][i % 5] + ' ' + ['Lane', 'Moss', 'Reed', 'Stone'][i % 4] + ' ' + i, email: 'c' + i + '@ex.com', phone: '555010' + String(i).padStart(4, '0'), sqId: 'CUST' + i, source: 'square', created: now - 86400000 * 3, _ts: now - 86400000 * 3, visits: [], notes: [] }; }
const seed = { sc_clients: JSON.stringify(clients), sc_onboarded: '1', sc_professions: JSON.stringify(['esthetician']), sc_wsname: JSON.stringify('Frances Skin Studio'),
  sc_bizinfo: JSON.stringify({ name: 'Frances Skin Studio', phone: '5550100000', email: 'studio@ex.com' }) };
await page.addInitScript(([app, native]) => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_login_email', 'new@spa.com'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {}
  if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; };
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
  try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (e) {} }, ['provider', SIZE === 'ipad' || SIZE === 'phone']);

const SQ = process.env.SQ || 'expired';
const sqBody = { none: [200, { oauth: false, connected: false }], expired: [200, { oauth: false, expired: true }], err500: [200, { oauth: true, connected: true }], nosquare: [200, { oauth: false }], offline: [200, { oauth: true, connected: true }] }[SQ];
await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: seed }) });
  if (u.includes('/api/square/connection') || u.includes('/api/square/token-status')) return r.fulfill({ status: sqBody[0], contentType: 'application/json', body: JSON.stringify(sqBody[1]) });
  if (u.includes('/api/square/')) {
    if (SQ === 'offline') return r.abort('internetdisconnected');
    if (SQ === 'err500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Square is having trouble right now."}' });
    if (SQ === 'expired') return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Square sign-in expired","code":"expired"}' });
    return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Connect Square first.","code":"nosquare"}' });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[],"items":[]}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.addInitScript(() => { window.__said = []; const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { window.__said.push('TOAST ' + String(m)); return o.apply(this, arguments); }; clearInterval(iv); } }, 20); });
await page.goto('http://localhost:' + PORT + '/slickchart.html', { waitUntil: 'load' }); await page.waitForTimeout(8000);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
errs.length = 0;
await page.evaluate(() => { try { bizInfo.name = 'Botanical Aesthetics and Advanced Skin Rejuvenation Studio'; } catch (e) {} 
  _payments.length = 0; _payments.push({ id: 'p1', clientId: 'sq_CUST0', clientName: CL.sq_CUST0.name, amount: '1234.56', status: 'unpaid', date: _todayISO(), items: [{ name: 'Signature HydraFacial with Dermaplaning and LED Light Therapy Add-on', price: 1234.56, qty: 1 }] }); });
const screens = [['home'], ['clients'], ['client', 'sq_CUST0'], ['payments'], ['messages'], ['chat', 'sq_CUST0'], ['calendar'], ['forms'], ['settings'], ['account'], ['biz-info'], ['booking-link'], ['team-access'], ['security-billing'], ['notifications'], ['reports'], ['inventory'], ['shop']];
const bad = [];
for (const [s, a] of screens) {
  try { await page.evaluate(([s, a]) => nav(s, a), [s, a]); } catch (e) { bad.push(s + ': nav error'); continue; }
  await page.waitForTimeout(500);
  { const x = await page.evaluate(() => window.__xss || 0); if (x) bad.push(s + ': XSS ' + x); }
  const o = await page.evaluate(() => { const W = document.documentElement.clientWidth; const out = [];
    document.querySelectorAll('#S *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 2 && getComputedStyle(el).position !== 'fixed') { let p = el.parentElement, clip = false; while (p && p.id !== 'S') { const cs = getComputedStyle(p); if (/hidden|auto|scroll/.test(cs.overflowX)) { clip = true; break; } p = p.parentElement; } if (!clip) out.push((el.tagName + '.' + (el.className || '').toString().slice(0, 20) + ' ' + (el.innerText || '').slice(0, 40)).replace(/\n/g, ' ') + ' r=' + Math.round(r.right)); } });
    return out.slice(0, 4); });
  if (o.length) bad.push(s + ': ' + o.join(' | '));
}
for (const f of ["_payOpen('p1')", "_newMessageSheet()", "nav('checkout','sq_CUST0')", "nav('build-invoice')", "sendFormToClient(Object.keys(formTmpls)[0])", "nav('client-edit','sq_CUST0')", "nav('room','sq_CUST0')", "nav('photos','sq_CUST0')", "nav('new-appt')", "nav('reminders')", "nav('automations')", "nav('virtual-consults')", "nav('client-forms','sq_CUST0')"]) {
  await page.evaluate(f => { try { eval(f); } catch (e) { window.__ferr = (window.__ferr || []).concat(f + ': ' + e.message); } }, f); await page.waitForTimeout(600);
  const x = await page.evaluate(() => window.__xss || 0); if (x) { bad.push(f + ': XSS ' + x); await page.evaluate(() => { window.__xss = 0; }); }
  await page.evaluate(() => document.querySelectorAll('#pay-detail,#newmsg-sheet,#send-prod-sheet').forEach(e => e.remove()));
}
console.log('ferr', await page.evaluate(() => window.__ferr || []));
console.log(bad.length ? bad.join('\n') : 'no overflow');
console.log('XSS fired', await page.evaluate(() => window.__xss || 0), 'imgs', await page.evaluate(() => document.querySelectorAll('img[src="x"]').length));
console.log('errs', errs.slice(0, 5));
await browser.close(); srv.close();
