// REGRESSION: sign in / sign up / forgot password with no signal or a server error (2026-11-18).
// The browser's own "Failed to fetch" / "Load failed" reached a new provider. Both engines:
// PW_ENGINE=chromium node ... ; bash scratchpad/run-in-safari.sh is not needed (WebKit is the default).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
let mode = 'offline'; const hits = {};
await page.route('**/api/**', async r => { const u = new URL(r.request().url()).pathname; hits[u] = (hits[u] || 0) + 1;
  if (/\/api\/(login|signup|request-reset|reset)$/.test(u)) {
    if (mode === 'offline') return r.abort('internetdisconnected');
    if (mode === '502') return r.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' });
    if (mode === 'slow') { await new Promise(x => setTimeout(x, 1500)); return r.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"That email already has an account. Log in instead."}' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  }
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.goto('http://localhost:' + PORT + '/slickchart.html'); await page.waitForTimeout(5000);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const err = () => page.evaluate(() => (document.getElementById('login-err') || {}).textContent || '');
const fill = (sel, v) => page.evaluate(([s, v]) => { const e = document.getElementById(s); if (e) e.value = v; }, [sel, v]);
const BAD = /Failed to fetch|Load failed|NetworkError|TypeError/;
// Log in
await page.evaluate(() => _setLoginMode('login')); await fill('login-email', 'new@spa.com'); await fill('login-pw', 'password123');
for (const m of ['offline', '502']) { mode = m; await page.evaluate(() => doLogin()); await page.waitForTimeout(800); const t = await err();
  ok(t && !BAD.test(t) && (m === 'offline' ? /internet/.test(t) : /our side/.test(t)), 'log in ' + m + ': plain words (' + t + ')'); }
// Sign up
await page.evaluate(() => _setLoginMode('signup')); await fill('login-name', 'Frances'); await fill('login-email', 'new@spa.com'); await fill('login-pw', 'password123');
for (const m of ['offline', '502']) { mode = m; await page.evaluate(() => doSignup()); await page.waitForTimeout(800); const t = await err();
  ok(t && !BAD.test(t) && (m === 'offline' ? /internet/.test(t) : /our side/.test(t)), 'sign up ' + m + ': plain words (' + t + ')'); }
// Double tap = one request
mode = 'slow'; hits['/api/signup'] = 0;
await page.evaluate(() => { doSignup(); doSignup(); doSignup(); }); await page.waitForTimeout(2500);
ok(hits['/api/signup'] === 1, 'sign up tapped 3 times sends 1 request (' + hits['/api/signup'] + ')');
ok(/already has an account/.test(await err()), 'the server’s own answer still shows');
const dis = await page.evaluate(() => { const b = document.querySelector('#login-screen button[onclick^="doSignup"]'); return b ? b.disabled : 'nobtn'; });
ok(dis === false, 'button is usable again after the answer (' + dis + ')');
// Forgot password
await page.evaluate(() => _setLoginMode('forgot')); await fill('login-email', 'new@spa.com');
mode = 'offline'; await page.evaluate(() => doRequestReset()); await page.waitForTimeout(800);
let st = await page.evaluate(() => ({ mode: _loginMode, err: (document.getElementById('login-err') || {}).textContent || '' }));
ok(st.mode !== 'sent' && /internet/.test(st.err), 'forgot password offline: does not claim it sent (' + JSON.stringify(st) + ')');
mode = 'ok'; await page.evaluate(() => doRequestReset()); await page.waitForTimeout(800);
st = await page.evaluate(() => ({ mode: _loginMode }));
ok(st.mode === 'sent', 'forgot password online: says sent');
ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
await browser.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
