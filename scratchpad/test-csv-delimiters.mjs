// REGRESSION: client/product import reads semicolon (European Excel) and tab (pasted from a spreadsheet) files (2026-11-18). PW_ENGINE=chromium|webkit
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
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const files = {
  semicolon: 'Name;Email;Phone\nZara Semi;zs@x.com;5551110001\nYuki Semi;ys@x.com;5551110002\n',
  tab: 'First Name\tLast Name\tEmail\nXena\tTabb\txt@x.com\n',
  comma: '﻿Name,Email,Notes\nWren Comma,wc@x.com,"Likes; quiet, warm room"\n'
};
for (const [k, t] of Object.entries(files)) {
  const before = await page.evaluate(() => Object.keys(CL).length);
  await page.evaluate(() => { _impSource = 'spreadsheet'; _csvImportScreen('clients'); });
  await page.waitForTimeout(500);
  await page.evaluate(t => { const ta = document.getElementById('csv-text'); ta.value = t; _csvPreview(); }, t);
  await page.waitForTimeout(300);
  await page.evaluate(() => _csvDoImport()); await page.waitForTimeout(500);
  const got = await page.evaluate(b => Object.values(CL).slice(-5).map(c => ({ name: c.name, email: c.email || '' })), before);
  const n = await page.evaluate(() => Object.keys(CL).length) - before;
  const want = { semicolon: ['Zara Semi|zs@x.com', 'Yuki Semi|ys@x.com'], tab: ['Xena Tabb|xt@x.com'], comma: ['Wren Comma|wc@x.com'] }[k];
  const names = got.map(c => c.name + '|' + c.email);
  ok(n === want.length && want.every(w => names.includes(w)), k + ': ' + n + ' new client(s), named and emailed right ' + JSON.stringify(names.slice(-want.length)));
  ok(!names.some(x => /[;\t]/.test(x.split('|')[0])), k + ': no client named with a whole line');
}
const notes = await page.evaluate(() => { const c = Object.values(CL).find(c => c.name === 'Wren Comma'); return c ? String(c.concerns || '') : ''; });
ok(notes === 'Likes; quiet, warm room', 'comma file with a ; inside quotes keeps the note whole ' + notes.slice(0, 80));
// Products: a semicolon file.
const pn = await page.evaluate(() => { const rows = _parseCSV('Name;Brand;Link\nGlow Drops;Acme;acme.example.com\n'); const m = _mapProductRows(rows); return m.map(x => x.name + '|' + x.brand); });
ok(pn.length === 1 && pn[0] === 'Glow Drops|Acme', 'products: semicolon file maps name and brand ' + JSON.stringify(pn));
ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
await browser.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
