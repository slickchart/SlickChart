// A "What's new" update lands in the notification BELL, never as a toast (Ashley, 2026-10-23).
// Drives the real page as the installed app: a foreground push of kind 'news' adds a bell entry
// (no toast), tapping it opens What's new and reads it, and a relaunch keeps exactly one, still read.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = [new URL('../slickchart-vercel/', import.meta.url).pathname, new URL('../../slickchart-vercel/', import.meta.url).pathname].find(d => fs.existsSync(d));
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = q.url.split('?')[0]; const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const b = await (process.env.SC_ENGINE === 'webkit' ? pw.webkit.launch() : pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let items = []; const kv = {};
const ctx = await b.newContext({ serviceWorkers: 'block' }); const p = await ctx.newPage();
await p.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('/api/announcements')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, canPost: false }) });
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_onboarded: '1', ...kv } }) });
  if (u.includes('/api/store') && m !== 'GET') { try { const j = r.request().postDataJSON(); if (j && j.key) kv[j.key] = j.value; if (j && j.data) Object.assign(kv, j.data); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await p.addInitScript(() => {
  try { localStorage.setItem('sc_token', 'sess-main'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {}
  const L = {}; window.__L = L;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {
    PushNotifications: { checkPermissions: async () => ({ receive: 'granted' }), requestPermissions: async () => ({ receive: 'granted' }),
      addListener: (k, f) => { L['pn:' + k] = f; }, unregister: async () => {}, register: async () => { setTimeout(() => L['pn:registration'] && L['pn:registration']({ value: 'tok-1' }), 20); } },
    App: { addListener: () => {}, getLaunchUrl: async () => ({}) }, StatusBar: {} } };
  window.__toasts = [];
  setInterval(() => { const t = document.getElementById('pro-toast'); if (t && !t.__seen) { t.__seen = 1; window.__toasts.push(t.textContent); } }, 30);
});
await p.goto('http://localhost:' + PORT + '/slickchart'); await p.waitForTimeout(11000);
ok(await p.evaluate(() => typeof window.__L['pn:pushNotificationReceived'] === 'function'), 'the app listens for pushes (setup check)');
items = [{ id: 7, title: 'iPhone app fix on the way', body: 'Should be ready Monday.', ts: Date.now() }];
await p.evaluate(() => window.__L['pn:pushNotificationReceived']({ title: 'iPhone app fix on the way', body: 'Should be ready Monday.', data: { kind: 'news', url: '/slickchart?n=news' } }));
await p.waitForTimeout(1500);
ok(!(await p.evaluate(() => window.__toasts.some(t => /iPhone app fix/.test(t)))), 'no toast for an update');
ok(await p.evaluate(() => notifFeed.filter(n => n.id === 'news:7' && !n.read).length === 1 && unreadCount() >= 1), 'it is an unread entry in the bell');
await p.evaluate(() => nav('notifications-feed')); await p.waitForTimeout(500);
ok(await p.evaluate(() => /iPhone app fix on the way/.test(document.getElementById('content') ? document.getElementById('content').innerText : document.body.innerText)), 'the bell screen shows it');
await p.evaluate(() => { const el = [...document.querySelectorAll('[onclick]')].find(x => /nav\('whats-new'\)/.test(x.getAttribute('onclick')) && /iPhone app fix/.test(x.textContent)); el.click(); }); await p.waitForTimeout(600);
ok(await p.evaluate(() => /What.s new/.test(document.getElementById('tt').textContent)), 'tapping it opens What’s new');
ok(await p.evaluate(() => notifFeed.some(n => n.id === 'news:7' && n.read)), 'and it is marked read');
await p.evaluate(() => window.__L['pn:pushNotificationReceived']({ title: 'New booking', body: 'Amy', data: { kind: 'booking' } })); await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__toasts.some(t => /New booking/.test(t))), 'other pushes still show as before');
await p.reload(); await p.waitForTimeout(11000);
ok(await p.evaluate(() => notifFeed.filter(n => n.id === 'news:7').length === 1 && notifFeed.find(n => n.id === 'news:7').read), 'after a relaunch it is in the bell once, still read');
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
