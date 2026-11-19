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
let REFUND = 'ok'; let refundCalls = 0;
await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('/api/square/refund')) { refundCalls++; if (REFUND === 'offline') return r.abort('internetdisconnected'); const b = { ok: [200, { ok: true, status: 'COMPLETED' }], nosquare: [401, { error: 'Connect your own Square account to sync your customers.', code: 'nosquare' }], revoked: [401, { error: 'Square API error (401)' }], already: [400, { error: 'The requested refund amount exceeds the amount available to refund.' }] }[REFUND]; return r.fulfill({ status: b[0], contentType: 'application/json', body: JSON.stringify(b[1]) }); }
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
const run = async (mode) => {
  REFUND = mode;
  await page.evaluate(() => { _payments.length = 0; _payments.push({ id: 'p', clientName: 'P', amount: '100', status: 'paid', date: _todayISO(), squarePaymentId: 'sq1' }); document.querySelectorAll('#pay-detail,#pro-toast').forEach(e => e.remove()); try { nav('payments'); } catch (e) {} });
  await page.waitForTimeout(300);
  await page.evaluate(() => _payOpen('p'));
  await page.click('#pay-detail button:has-text("Refund in Square")');
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Refund")').last().click();
  await page.waitForTimeout(800);
  return page.evaluate(() => { const t = document.getElementById('pro-toast'); if (!t) return { none: true };
    const b = t.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { text: t.innerText, err: !!t.querySelector('.ti-alert-triangle'), visible: !!top && t.contains(top), status: (_payments.find(x => x.id === 'p') || {}).status, sheet: !!document.getElementById('pay-detail'), screen: _navCur && _navCur.screen }; });
};
let o = await run('nosquare'); console.log(JSON.stringify(o));
ok(o.visible && o.err && /isn’t connected right now, so nothing was refunded/.test(o.text) && !/sync your customers/.test(o.text) && o.status === 'paid' && o.screen === 'square-sync', 'disconnected: plain words, warning style, visible, goes to Square');
o = await run('revoked'); ok(o.visible && o.err && /isn’t connected/.test(o.text) && !/API error/.test(o.text), 'revoked token: same plain words');
o = await run('already'); console.log(JSON.stringify(o)); ok(o.visible && o.err && /didn’t go through: The requested refund amount exceeds/.test(o.text) && /Nothing was refunded/.test(o.text) && o.status === 'paid' && o.sheet, 'Square refused: says so over the open sheet, stays paid');
o = await run('offline'); console.log(JSON.stringify(o)); ok(o.visible && o.err && /nothing was refunded/.test(o.text) && o.status === 'paid', 'offline/unreachable: visible warning');
o = await run('ok'); console.log(JSON.stringify(o)); ok(o.visible && !o.err && /Refunded \$100\.00/.test(o.text) && o.status === 'refunded', 'success: green Refunded');
// Generic: a failure toast with no tone looks like a warning; a success stays green.
const g = await page.evaluate(() => { const st = m => { proToast(m); return !!document.querySelector('#pro-toast .ti-alert-triangle'); };
  return { a: st('Could not reach the server'), b: st('Couldn’t copy — screenshot instead'), c: st('Payment logged ✓'), d: st('Saved'), e: st('Square connection failed'), f: st('Refunded $5.00') }; });
ok(g.a && g.b && g.e && !g.c && !g.d && !g.f, 'untoned failures look like failures, successes stay green ' + JSON.stringify(g));
await browser.close(); srv.close();
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
