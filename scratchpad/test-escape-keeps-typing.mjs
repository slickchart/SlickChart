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
const clients = {}; for (let i = 0; i < 40; i++) { const id = 'sq_CUST' + i; clients[id] = { id, name: ['Ava', 'Bea', 'Cora', 'Dana', 'Eve'][i % 5] + ' ' + ['Lane', 'Moss', 'Reed', 'Stone'][i % 4] + ' ' + i, email: 'c' + i + '@ex.com', phone: '555010' + String(i).padStart(4, '0'), sqId: 'CUST' + i, source: 'square', created: now - 86400000 * 3, _ts: now - 86400000 * 3, visits: [], notes: [] }; }
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
const t = (m, c, d) => { ok(c, m); if (!c) console.log('   ', JSON.stringify(d)); };
const clear = () => page.evaluate(() => { document.querySelectorAll('#confirm-modal').forEach(e => e.remove()); document.querySelectorAll('.shell > div, body > div').forEach(el => { const cs = getComputedStyle(el); if ((+cs.zIndex || 0) > 500 && cs.position === 'fixed') el.remove(); }); });
const field = (sel) => page.locator(sel).first();
const isOpen = (sel) => page.evaluate(s => { const e = document.querySelector(s); return !!(e && e.offsetParent); }, sel);
const modal = () => page.evaluate(() => { const m = document.getElementById('confirm-modal'); return m ? m.innerText : ''; });
// 1. feedback note typed, Escape asks; Escape again keeps it; Close discards
await clear(); await page.evaluate(() => openBetaFeedback()); await page.waitForTimeout(300);
await field('#beta-fb-text').click(); await page.keyboard.type('The calendar would not save my booking');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
t('Escape with typed words asks first', /Close without saving/.test(await modal()) && await isOpen('#beta-fb-text'), await modal());
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
t('Escape on the question keeps her words', await isOpen('#beta-fb-text') && (await field('#beta-fb-text').inputValue()) === 'The calendar would not save my booking' && !(await modal()), await modal());
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.locator('#confirm-modal button', { hasText: 'Close' }).first().click(); await page.waitForTimeout(250);
t('choosing Close closes the sheet', !(await isOpen('#beta-fb-text')), '');
// 2. nothing typed: Escape closes at once
await clear(); await page.evaluate(() => openBetaFeedback()); await page.waitForTimeout(300);
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
t('empty sheet closes on Escape with no question', !(await isOpen('#beta-fb-text')) && !(await modal()), await modal());
// 3. a sheet that filled its own box (not typed by her) closes on Escape
await clear(); await page.evaluate(() => openQuickAdd()); await page.waitForTimeout(300);
await page.evaluate(() => { const e = document.getElementById('qa-client'); e.value = 'Prefilled by the app'; });
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
t('app-filled box does not make Escape ask', !(await isOpen('#qa-client')) && !(await modal()), await modal());
// 4. typed into quick add: asks
await clear(); await page.evaluate(() => openQuickAdd()); await page.waitForTimeout(300);
await field('#qa-client').click(); await page.keyboard.type('Ann');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
t('typed into a booking: Escape asks', /Close without saving/.test(await modal()) && await isOpen('#qa-client'), await modal());
// 5. a search box alone never asks
await clear(); await page.evaluate(() => _newMessageSheet()); await page.waitForTimeout(300);
await field('#newmsg-q').click(); await page.keyboard.type('ann');
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
t('a search box alone does not ask', !(await modal()) && !(await isOpen('#newmsg-q')), await modal());
t('no page errors', errs.length === 0, errs);
await browser.close(); srv.close(); console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);
