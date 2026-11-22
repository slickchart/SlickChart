// A new provider (2026-11-22, iPhone Safari) made her account, then tapped Create account again while
// the app was still saving her starter data: a second /api/signup came back "An account with that email
// already exists". Her iPhone app did the same on Sign in (two sign-ins, two sessions). The button was
// live again as soon as the server answered, before the sign-in screen closed. Requires:
//  A. Create account: taps after the account is made, while the save is still running, send no second request
//  B. Sign in: taps after the sign-in answer, while her account is still being read, send no second request
//  C. a refused answer still frees the button at once (try again works)
//  D. no page errors. Both engines (PW_ENGINE=chromium | webkit, default webkit).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const TOK = Buffer.from(JSON.stringify({ u: 'prov_new' })).toString('base64').replace(/=+$/, '') + '.sig';
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  const hits = {}; let refuse = false;
  await page.route('**/api/**', async r => { const u = new URL(r.request().url()).pathname; hits[u] = (hits[u] || 0) + 1;
    if (/\/api\/(login|signup)$/.test(u)) {
      if (refuse) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Email or password is incorrect."}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, token: TOK, email: 'new@spa.com' }) }); }
    if (u.includes('/api/store')) { await new Promise(x => setTimeout(x, 2500)); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{},"ok":true}' }); }
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await page.goto('http://localhost:' + PORT + '/slickchart.html'); await page.waitForTimeout(4000);
  return { ctx, page, errs, hits, setRefuse: v => { refuse = v; } };
}
const fill = (page, sel, v) => page.evaluate(([s, v]) => { const e = document.getElementById(s); if (e) e.value = v; }, [sel, v]);
const tapBtn = (page, fn) => page.evaluate(fn => { const b = document.querySelector('#login-screen button[onclick^="' + fn + '"]'); if (b && !b.disabled) { b.click(); return 'clicked'; } return b ? 'disabled' : 'gone'; }, fn);
{ // A
  const { ctx, page, errs, hits } = await open();
  await page.evaluate(() => _setLoginMode('signup')); await fill(page, 'login-name', 'Pat'); await fill(page, 'login-email', 'new@spa.com'); await fill(page, 'login-pw', 'password123');
  await tapBtn(page, 'doSignup'); await page.waitForTimeout(600);
  const t2 = await tapBtn(page, 'doSignup'); await page.waitForTimeout(300); const t3 = await tapBtn(page, 'doSignup'); await page.waitForTimeout(4000);
  const err = await page.evaluate(() => (document.getElementById('login-err') || {}).textContent || '');
  ok(hits['/api/signup'] === 1 && !/already/.test(err), `A: one account request (${hits['/api/signup']}), taps after: ${t2}/${t3}, err "${err}"`);
  ok(!errs.length, 'D: no page errors A ' + errs.join(' | '));
  await ctx.close();
}
{ // B + C
  const { ctx, page, errs, hits, setRefuse } = await open();
  await page.evaluate(() => _setLoginMode('login')); await fill(page, 'login-email', 'new@spa.com'); await fill(page, 'login-pw', 'password123');
  setRefuse(true); await tapBtn(page, 'doLogin'); await page.waitForTimeout(700);
  const freed = await page.evaluate(() => { const b = document.querySelector('#login-screen button[onclick^="doLogin"]'); return b && !b.disabled; });
  ok(freed && hits['/api/login'] === 1, 'C: a refused sign-in frees the button at once');
  setRefuse(false); await tapBtn(page, 'doLogin'); await page.waitForTimeout(600);
  const t2 = await tapBtn(page, 'doLogin'); await page.waitForTimeout(300); const t3 = await tapBtn(page, 'doLogin'); await page.waitForTimeout(4000);
  ok(hits['/api/login'] === 2, `B: one sign-in request after the good answer (total ${hits['/api/login']} incl. the refused one), taps after: ${t2}/${t3}`);
  ok(!errs.length, 'D: no page errors B ' + errs.join(' | '));
  await ctx.close();
}
await browser.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
