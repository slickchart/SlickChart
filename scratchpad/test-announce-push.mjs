// "What's new" updates she posts also notify every provider (2026-10-23). Drives the real page:
// publishing always notifies, reports the count, and a tapped notification opens What's new.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = [new URL('../slickchart-vercel/', import.meta.url).pathname, new URL('../../slickchart-vercel/', import.meta.url).pathname].find(d => fs.existsSync(d));
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = q.url.split('?')[0]; const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const b = await (process.env.SC_ENGINE === 'webkit' ? pw.webkit.launch() : pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ctx = await b.newContext({ serviceWorkers: 'block' }); const p = await ctx.newPage(); const posts = [];
await p.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('/api/announcements') && m === 'POST') { posts.push(r.request().postDataJSON()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, push: { devices: 41, sent: 39 } }) }); }
  if (u.includes('/api/announcements')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"canPost":true,"you":"a@x.com","ownerSet":true}' });
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/login')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"token":"tok-1","email":"a@x.com"}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"sc_onboarded":"1"}}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart'); await p.waitForFunction(() => !!document.getElementById('login-screen'), null, { timeout: 30000 }).catch(() => {});
await p.evaluate(() => { _setLoginMode('login'); }); await p.waitForTimeout(200);
await p.evaluate(() => { document.getElementById('login-email').value = 'a@x.com'; document.getElementById('login-pw').value = 'pw123456'; doLogin(); });
await p.waitForTimeout(6000);
await p.evaluate(async () => { await _checkNews(); nav('whats-new'); }); await p.waitForTimeout(500);
ok(await p.evaluate(() => !document.getElementById('an-notify') && /Every provider gets a notification/.test(document.body.innerText)), 'no opt-out: the composer says every provider is notified');
await p.fill('#an-title', 'iPhone app fix on the way'); await p.fill('#an-body', 'Should be ready Monday.');
await p.evaluate(() => _postAnnouncement()); await p.waitForTimeout(800);
ok(posts.length === 1 && posts[0].notify === true && posts[0].title === 'iPhone app fix on the way', 'publishing posts it with notify on, no extra question');
ok(await p.evaluate(() => /Sent to 39 of 41/.test(document.body.innerText)), 'and says how many provider devices it reached');
await p.evaluate(() => nav('home')); await p.waitForTimeout(300);
const link = await p.evaluate(() => _pushLinkFromData({ url: '/slickchart?n=news', kind: 'news' }));
await p.evaluate(l => _routeDeepLink(l.kind, l.clientId, l.itemId), link); await p.waitForTimeout(400);
ok(await p.evaluate(() => /What.s new/.test(document.getElementById('tt').textContent)), 'tapping the notification opens What’s new');
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
