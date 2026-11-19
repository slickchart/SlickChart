// A full book from Square on a phone (2026-11-19 BUSY crawl): the "First visit for Ava / Next: ... · Send
// the first-visit package" card on Home could not shrink, so Home was 496px wide on a 390/320 phone.
// And its Send tap showed nothing at all while the package was pushed (seconds on a weak signal), and a
// second tap pushed it again. Now Home fits, the tap answers at once, and a second tap is ignored.
//   node scratchpad/test-first-visit-card.mjs        (ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=... for Safari)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const PORT = 8600 + Math.floor(Math.random() * 90);
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const ENGINE = process.env.ENGINE || 'chromium';
const b = await pw[ENGINE].launch(ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); if (!c) fails++; };
const now = Date.now();
const clients = {}; for (let i = 0; i < 6; i++) { const id = 'sq_CUST' + i; clients[id] = { id, name: ['Ava', 'Bea', 'Cora'][i % 3] + ' Montgomery-Vanderbilt-Lane ' + i, email: 'c' + i + '@ex.com', phone: '', sqId: 'CUST' + i, source: 'square', created: now - 864e5, _ts: now - 864e5, _token: 'tok_' + id }; }
for (const W of [390, 320]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 800 }, hasTouch: true, serviceWorkers: 'block' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_hide_sample', '1'); window.open = () => null; });
  let slow = false; const posts = [];
  await p.route('**/api/**', async r => { const u = r.request().url(), m = r.request().method(); const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('cloud-status')) return J({ enabled: true });
    if (u.includes('/api/store') && m === 'GET') return J({ data: { sc_clients: JSON.stringify(clients), sc_onboarded: '1' } });
    if (u.includes('/api/square/connection')) return J({ oauth: true, connected: true, env: 'production', merchantName: 'Studio' });
    if (u.includes('/api/square/appointments')) { const d0 = new Date(); d0.setHours(23, 0, 0, 0); return J({ appointments: [0, 1, 2].map(i => ({ id: 'b' + i, version: 1, startAt: new Date(d0.getTime() + (i + 1) * 864e5).toISOString(), status: 'ACCEPTED', locationId: 'L1', customerId: 'CUST' + i, customerName: clients['sq_CUST' + i].name, customerEmail: 'c' + i + '@ex.com', createdAt: new Date(now - 864e5).toISOString(), durationMinutes: 60, serviceName: 'Signature Hydrating Oxygen Facial with LED', teamMemberId: 'TM1' })) }); }
    if (u.includes('/api/clients') && m === 'POST') { if (slow) { posts.push(u); await new Promise(z => setTimeout(z, 3000)); } const j = JSON.parse(r.request().postData() || '{}'); return J({ ok: true, clients: (j.clients || []).map(c => ({ id: c.id, token: 'tok_' + c.id })) }); }
    return J({ ok: true, data: {}, clients: [], events: [], items: [] }); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(9000);
  await p.evaluate(() => nav('home')); await p.waitForTimeout(1500);
  const card = await p.evaluate(() => /First visit for/.test(document.getElementById('S').innerText));
  ok(card, W + ': Home shows a First visit card');
  const g = await p.evaluate(() => { const S = document.getElementById('S'); return [S.scrollWidth, S.clientWidth, document.documentElement.scrollWidth, innerWidth]; });
  ok(g[0] <= g[1] + 2 && g[2] <= g[3] + 2, W + ': Home fits the phone, no sideways scroll', g.join(','));
  const ov = await p.evaluate(() => [...document.querySelectorAll('.sc-tile')].filter(t => t.offsetParent).map(t => { const x = t.querySelector(':scope > button'), ch = t.querySelector(':scope > div > i.ti-chevron-right'); if (!x || !ch) return 0; const a = x.getBoundingClientRect(), b = ch.getBoundingClientRect(); return (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) ? 1 : 0; }));
  ok(ov.length > 0 && !ov.some(Boolean), W + ': a card\'s clear (x) never sits on its chevron', JSON.stringify(ov));
  ok(!fs.readFileSync(ROOT + 'slickchart.html', 'utf8').includes('color:#a0c4b5;cursor:pointer'), W + ': the check-in clear (x) is drawn in ink, not pale green on grey');
  slow = true;
  const t = await p.evaluate(() => { const el = [...document.querySelectorAll('#S [onclick]')].find(e => /sendFirstVisitPackage\(/.test(e.getAttribute('onclick')) && e.offsetParent); if (!el) return 'none';
    el.click(); const t1 = (document.getElementById('pro-toast') || {}).innerText || ''; setTimeout(() => el.isConnected && el.click(), 250); return t1; });
  ok(/ready/i.test(t), W + ': Send answers at once while the package goes up', t);
  await p.waitForTimeout(5000);
  ok(posts.length === 1, W + ': a second tap while it is sending pushes nothing more', String(posts.length));
  ok(await p.evaluate(() => document.querySelectorAll('#invite-sheet').length) <= 1, W + ': at most one invite sheet');
  ok(!errs.length, W + ': no page errors', errs.join(' | '));
  await ctx.close();
}
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
