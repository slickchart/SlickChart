// REGRESSION (2026-11-26 sweep, area 2): Clients > "tidy up the ones no longer in Square" said
// "Couldn't reach your Square directory just now ... Try again in a moment" when Square was not
// connected or its sign-in had expired, where waiting never helps. Now it says which, and offers
// Reconnect Square. A real outage (500 / offline) keeps the "try again" wording.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const SIZE = process.env.SIZE || 'phone';
const VP = { mac: { width: 1440, height: 900 }, ipad: { width: 1032, height: 1376 }, phone: { width: 390, height: 844 } }[SIZE];
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});

let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + '[' + SIZE + '] ' + m); if (!c) fails++; };
const seed = { sc_onboarded: '1', sc_professions: JSON.stringify(['esthetician']), sc_clients: JSON.stringify({ sq_A: { id: 'sq_A', name: 'Ava Lane', sqId: 'A', source: 'square' }, c2: { id: 'c2', name: 'Bea Moss' } }) };
async function run(SQ) {
  const ctx = await browser.newContext({ viewport: VP, serviceWorkers: 'block' }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_login_email', 'new@spa.com'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {} });
  const conn = { expired: { oauth: false, expired: true }, nosquare: { oauth: false }, err500: { oauth: true, connected: true }, offline: { oauth: true, connected: true } }[SQ];
  await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: seed }) });
    if (u.includes('/api/square/connection') || u.includes('/api/square/token-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conn) });
    if (u.includes('/api/square/')) {
      if (SQ === 'offline') return r.abort('internetdisconnected');
      if (SQ === 'err500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Square is having trouble right now."}' });
      if (SQ === 'expired') return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Square sign-in expired","code":"expired"}' });
      return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Connect Square first.","code":"nosquare"}' });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[],"items":[]}' }); });
  await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await page.goto('http://localhost:' + PORT + '/slickchart', { waitUntil: 'load' }); await page.waitForTimeout(6000);
  await page.evaluate(() => { window.__conn = 0; window._sqConnect = function () { window.__conn++; }; openClientCleanup(); });
  await page.waitForTimeout(2500);
  const t = await page.evaluate(() => (document.getElementById('cleanup-body') || {}).innerText || '');
  const btn = await page.$('#cleanup-body button');
  let tapped = false; if (btn) { await btn.click(); await page.waitForTimeout(300); tapped = await page.evaluate(() => window.__conn === 1 && !document.getElementById('client-cleanup')); }
  await ctx.close(); return { t: t.replace(/\s+/g, ' '), tapped, errs };
}
for (const SQ of ['expired', 'nosquare']) {
  const r = await run(SQ);
  ok(!/Try again in a moment/.test(r.t), SQ + ': no "try again in a moment" (' + r.t.slice(0, 120) + ')');
  ok(SQ === 'expired' ? /sign-in expired/.test(r.t) : /isn’t connected/.test(r.t), SQ + ': says why');
  ok(/Nothing has been changed/.test(r.t), SQ + ': says nothing was changed');
  ok(SQ === 'expired' ? /Reconnect Square/.test(r.t) : (/Connect Square/.test(r.t) && !/Reconnect/.test(r.t)), SQ + ': button says Reconnect only when it was connected before');
  ok(r.tapped, SQ + ': the (Re)connect Square button starts it and closes the sheet');
  ok(!r.errs.length, SQ + ': no page errors ' + r.errs.join(';'));
}
for (const SQ of ['err500', 'offline']) {
  const r = await run(SQ);
  ok(/Couldn’t reach your Square directory/.test(r.t) && /Try again in a moment/.test(r.t), SQ + ': a real outage keeps "try again" (' + r.t.slice(0, 80) + ')');
  ok(!r.errs.length, SQ + ': no page errors');
}
await browser.close(); srv.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
