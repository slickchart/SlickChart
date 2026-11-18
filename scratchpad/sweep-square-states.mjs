// SQUARE STATES SWEEP (rotation area 2). Boot copied from sweep-new-provider-wide.mjs.
// SQ=none|expired|err500|nosquare|offline: how Square answers. Visits every Square screen, taps every
// Square-ish control, and records what she is TOLD (toasts and on-screen error boxes) plus page errors.
// Original header: (2026-11-18, after Frances cancelled her trial saying
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
await page.goto('http://localhost:' + PORT + '/slickchart.html', { waitUntil: 'load' }); await page.waitForTimeout(9000);
const SQSHOTS = process.env.SQSHOTS || '/tmp/claude-0/sq';
fs.mkdirSync(SQSHOTS, { recursive: true });
const screens = ['home', 'clients', 'square-sync', 'integrations', 'import-clients', 'data-setup', 'calendar', 'today-appts', 'payments', 'build-invoice', 'square-guide', 'service-menu', 'shop', 'booking-link'];
const report = [];
const RX = /square|sync|import|connect|refresh|add from menu|catalog|services|reconnect|pull|send invoice|payment link|charge/i;
for (const s of screens) {
  errs = [];
  const base = await page.evaluate(s => { try { nav(s); } catch (e) { return 'NAV ERR ' + e.message; } const S = document.getElementById('S'); return S ? S.innerText.slice(0, 4000) : ''; }, s);
  await page.waitForTimeout(1500);
  const shown = await page.evaluate(() => { const S = document.getElementById('S'); return S ? S.innerText : ''; });
  await page.screenshot({ path: SQSHOTS + '/' + SQ + '-' + SIZE + '-' + s + '.png' }).catch(() => {});
  const words = (shown.match(/[^\n]*(couldn|could not|can.t|cannot|error|went wrong|try again|expired|not connected|reconnect|vercel|deployed|sync service)[^\n]*/gi) || []).slice(0, 6);
  report.push({ s, onScreen: words, errs: errs.slice() });
  const n = await page.evaluate(([s, rx]) => { nav(s); const R = new RegExp(rx, 'i'); return Array.from(document.getElementById('S').querySelectorAll('button,[onclick]')).filter(e => (e.offsetParent || e.getClientRects().length) && R.test(e.textContent || '')).length; }, [s, RX.source]);
  for (let i = 0; i < Math.min(n, 12); i++) {
    errs = [];
    const lab = await page.evaluate(([s, rx, i]) => { document.querySelectorAll('.shell > div[id], body > div[id]').forEach(x => { try { if (getComputedStyle(x).position === 'fixed' && x.id !== 'app') x.remove(); } catch (e) {} });
      window.__said = []; nav(s); const R = new RegExp(rx, 'i'); const el = Array.from(document.getElementById('S').querySelectorAll('button,[onclick]')).filter(e => (e.offsetParent || e.getClientRects().length) && R.test(e.textContent || ''))[i]; if (!el) return null;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50); if (/disconnect|delete|remove|cancel/i.test(t + (el.getAttribute('onclick') || ''))) return '(skip) ' + t; window.__snapS = document.getElementById('S').innerHTML; el.click(); return t; }, [s, RX.source, i]);
    if (!lab || lab.startsWith('(skip)')) continue;
    await page.waitForTimeout(2500);
    const out = await page.evaluate(() => { const S = document.getElementById('S'); const txt = (S ? S.innerText : '') + '\n' + Array.from(document.querySelectorAll('body > div, .shell > div')).filter(d => { try { return getComputedStyle(d).position === 'fixed'; } catch (e) { return false; } }).map(d => d.innerText).join('\n');
      return { said: window.__said.slice(), words: (txt.match(/[^\n]*(couldn|could not|can.t|cannot|error|went wrong|try again|expired|not connected|reconnect|vercel|deployed|sync service|loading|checking)[^\n]*/gi) || []).slice(0, 5), changed: !!(S && S.innerHTML !== window.__snapS) }; });
    report.push({ s, tap: lab, ...out, errs: errs.slice() });
  }
}
console.log(JSON.stringify(report, null, 1));
await browser.close(); srv.close();
