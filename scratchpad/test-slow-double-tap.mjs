// Weak signal on a phone (2026-11-19 SLOW sweep): the link for a client is prepared on the server first,
// and a second tap while that took 3 s sent it twice and stacked two invite sheets. One tap = one send.
//   node scratchpad/test-slow-double-tap.mjs        (ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=... for Safari)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const PORT = 8700 + Math.floor(Math.random() * 200);
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const ENGINE = process.env.ENGINE || 'chromium';
const b = await pw[ENGINE].launch(ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); if (!c) fails++; };
async function run(what) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const clients = {}; for (let i = 0; i < 3; i++) { const id = 'sq_C' + i; clients[id] = { id, name: 'Ava Lane ' + i, email: 'c' + i + '@ex.com', phone: '555010000' + i, created: Date.now() }; }
  await p.addInitScript(() => { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_hide_sample', '1'); window.open = () => null; });
  let slow = false; const posts = [];
  await p.route('**/api/**', async r => { const u = r.request().url(), m = r.request().method(); const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (slow && m !== 'GET' && !/store|device-report|launch|log/.test(u)) { posts.push(u.replace(/^.*\/api/, '/api').split('?')[0]); await new Promise(z => setTimeout(z, 3000)); }
    if (u.includes('cloud-status')) return J({ enabled: true });
    if (u.includes('/api/store') && m === 'GET') return J({ data: { sc_clients: JSON.stringify(clients), sc_onboarded: '1' } });
    if (u.includes('/api/clients') && m === 'POST') { const j = JSON.parse(r.request().postData() || '{}'); return J({ ok: true, clients: (j.clients || []).map(c => ({ id: c.id, token: 'tok_' + c.id })) }); }
    return J({ ok: true }); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(8000); slow = true;
  const dbl = async (screen, d, re) => { await p.evaluate(([s, d]) => d ? nav(s, d) : nav(s), [screen, d]); await p.waitForTimeout(500);
    return p.evaluate(re => { const el = [...document.querySelectorAll('#S button,#S [onclick]')].filter(e => e.offsetParent).find(e => new RegExp(re).test(e.textContent)); if (!el) return false;
      el.click(); setTimeout(() => { if (el.isConnected) el.click(); }, 250); return true; }, re); };
  if (what === 'invite') {
    ok(await dbl('invite-clients', null, 'Ava Lane 1'), 'invite list row found');
    await p.waitForTimeout(4500);
    ok(posts.filter(x => x === '/api/clients').length === 1, 'double tap on a client in Invite prepares the link once', posts.join(','));
    ok(await p.evaluate(() => document.querySelectorAll('#invite-sheet').length) === 1, 'and opens one invite sheet, not two');
    await p.evaluate(() => document.querySelectorAll('#invite-sheet').forEach(x => x.remove()));
    await p.evaluate(() => { inviteClientToApp('sq_C1'); inviteClientToApp('sq_C1'); });
    ok(await p.evaluate(() => document.querySelectorAll('#invite-sheet').length) === 1, 'with the link ready, a double tap still shows one sheet');
  }
  if (what === 'rebook') {
    ok(await dbl('rebook', 'sq_C2', 'Send rebook invite'), 'rebook button found');
    await p.waitForTimeout(8000);
    ok(posts.filter(x => x === '/api/clients').length === 1, 'double tap on Send rebook invite prepares the link once', posts.join(','));
    ok(posts.filter(x => x === '/api/provider-message').length === 1, 'and sends the client ONE message', posts.join(','));
  }
  ok(!errs.length, 'no page errors (' + what + ')', errs.join(' | '));
  await ctx.close();
}
await run('invite'); await run('rebook');
await b.close(); srv.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
