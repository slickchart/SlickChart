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

const X = '<img src=x onerror=window.__xss=(window.__xss||0)+1>';
const T = () => new Date(Date.now() - 60000).toISOString();
const evs = [
  { id: 'e1', kind: 'booking', client_id: 'sq_CUST1', created_at: T(), payload: { client: 'Eve' + X, treatment: 'Facial' + X, date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), dateLabel: 'Fri' + X, time: '10:00 AM' + X, note: 'note' + X, phone: '555' + X, email: 'a@b.co' + X } },
  { id: 'e2', kind: 'message', client_id: 'sq_CUST2', created_at: T(), payload: { text: 'hi' + X, client: 'Cora' + X } },
  { id: 'e3', kind: 'checkin', client_id: 'sq_CUST3', created_at: T(), payload: { client: 'Dana' + X, treatment: 'Peel' + X, notes: 'n' + X, dateLabel: 'Sat' + X, time: '9' + X, groups: [{ title: 'G' + X, items: [{ q: 'Q' + X, a: 'A' + X }] }], flagged: ['F' + X] } },
  { id: 'e4', kind: 'form', client_id: 'sq_CUST4', created_at: T(), payload: { client: 'Ava' + X, formName: 'Intake' + X, name: 'Intake' + X, answers: [{ q: 'Q' + X, a: 'A' + X, label: 'L' + X, value: 'V' + X }], fields: [{ label: 'L' + X, value: 'V' + X }] } },
  { id: 'e5', kind: 'contact', client_id: 'sq_CUST5', created_at: T(), payload: { client: 'Bea' + X, name: 'Bea' + X, phone: '555' + X, email: 'x@y.co' + X } },
  { id: 'e6', kind: 'vc_submit', client_id: 'sq_CUST6', created_at: T(), payload: { client: 'Vic' + X, concern: 'C' + X, notes: 'N' + X, answers: [{ q: 'Q' + X, a: 'A' + X }] } },
  { id: 'e7', kind: 'delete-request', client_id: 'sq_CUST8', created_at: T(), payload: { client: 'Del' + X, reason: 'R' + X } },
];
const SQ = process.env.SQ || 'expired';
const sqBody = { none: [200, { oauth: false, connected: false }], expired: [200, { oauth: false, expired: true }], err500: [200, { oauth: true, connected: true }], nosquare: [200, { oauth: false }], offline: [200, { oauth: true, connected: true }] }[SQ];
await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/clients') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [], events: evs }) });
  if (u.includes('/api/consult-requests')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, requests: [{ id: 'cr1', name: 'Zed' + X, email: 'z@z.co' + X, phone: '5' + X, concern: 'c' + X, message: 'm' + X, created_at: T(), photos: [] }] }) });
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
await page.evaluate(async () => { try { if (typeof syncClientEvents === 'function') await syncClientEvents(); } catch (e) {} });
await page.waitForTimeout(3000);
const bad = [];
const steps = ["nav('home')", "nav('notifications-feed')", "nav('messages')", "nav('chat','sq_CUST2')", "nav('requests')", "nav('checkins')", "nav('vc-inbox')", "nav('calendar')", "nav('client','sq_CUST1')", "nav('client','sq_CUST3')", "nav('client','sq_CUST4')", "nav('client','sq_CUST5')", "nav('client','sq_CUST6')", "nav('client','sq_CUST8')", "nav('forms')", "nav('clients')", "nav('virtual')"];
for (const f of steps) {
  await page.evaluate(f => { try { eval(f); } catch (e) { window.__ferr = (window.__ferr || []).concat(f + ': ' + e.message); } }, f); await page.waitForTimeout(700);
  // open every card/row on the screen once to reach detail sheets
  const x = await page.evaluate(() => window.__xss || 0); if (x) { bad.push(f + ': XSS ' + x); await page.evaluate(() => { window.__xss = 0; }); }
  const raw = await page.evaluate(() => (document.getElementById('S').innerText.match(/<img src=x[^>]*>/g) || []).length);
  bad.push(f + ' shown-as-text:' + raw);
}
for (const scr of ["nav('requests')", "nav('checkins')", "nav('notifications-feed')", "nav('client','sq_CUST3')", "nav('client','sq_CUST4')", "nav('client','sq_CUST6')", "nav('vc-inbox')", "nav('home')"]) {
  await page.evaluate(f => eval(f), scr); await page.waitForTimeout(600);
  const n = await page.evaluate(() => document.querySelectorAll('#S [onclick]').length);
  for (let i = 0; i < Math.min(n, 40); i++) {
    await page.evaluate(([f, i]) => { eval(f); }, [scr, i]); await page.waitForTimeout(250);
    const did = await page.evaluate(([i, SK]) => { const el = document.querySelectorAll('#S [onclick]')[i]; if (!el) return ''; const oc = el.getAttribute('onclick') || ''; if (new RegExp(SK, 'i').test(oc) || /decline|delete|remove|_bkDecline|reject/i.test(oc)) return 'skip'; try { el.click(); } catch (e) {} return oc.slice(0, 60); }, [i, SKIP.source]);
    await page.waitForTimeout(400);
    const x = await page.evaluate(() => window.__xss || 0); if (x) { bad.push(scr + ' click ' + did + ': XSS ' + x); await page.evaluate(() => { window.__xss = 0; }); }
    await page.evaluate(() => document.querySelectorAll('body > div[id], .shell > div[id]').forEach(e => { if (/sheet|detail|modal|overlay|ov|viewer/i.test(e.id) && e.id !== 'S') e.remove(); }));
  }
}
const seen = await page.evaluate(() => ({ msgs: JSON.stringify(msgStore).includes('onerror'), bk: JSON.stringify((SlickBridge.getBookings && SlickBridge.getBookings()) || []).includes('onerror'), notif: notifFeed.length }));
console.log(JSON.stringify(seen));
console.log('ferr', await page.evaluate(() => window.__ferr || []));
console.log(bad.join('\n'));
console.log('errs', errs.slice(0, 5));
await browser.close(); srv.close();
