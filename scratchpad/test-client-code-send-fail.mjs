// REGRESSION (2026-11-19): "Email me a code" moved to the code screen even when the server said too many tries or failed, so the client waited for an email that never came.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const fail = []; const errs = [];
for (const mode of ['429', '500', 'ok']) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await page.route('**/api/**', r => { const u = r.request().url();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/client-link')) return mode === 'ok' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"message":"If that email is on file, your secure link is on its way."}' }) : r.fulfill({ status: 500, contentType: 'text/html', body: 'oops' });
    if (u.includes('/api/client-code')) {
      if (mode === '429') return r.fulfill({ status: 429, contentType: 'application/json', body: '{"ok":false,"error":"Too many tries. Please wait a minute and try again."}' });
      if (mode === '500') return r.fulfill({ status: 500, contentType: 'text/html', body: 'oops' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"message":"If that email is on file..."}' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await page.goto('http://localhost:' + PORT + '/slickchart.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof _setLoginMode === 'function', null, { timeout: 15000 });
  await page.evaluate(() => _setLoginMode('client')); await page.waitForSelector('#client-email', { timeout: 5000 });
  await page.fill('#client-email', 'cara@ex.com');
  await page.evaluate(() => _clientSendCode(false)); await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({ codeScreen: !!document.getElementById('client-code'), msg: (document.getElementById('client-link-msg') || {}).textContent || '' }));
  await page.evaluate(() => _setLoginMode('client')); await page.waitForSelector('#client-email'); await page.fill('#client-email', 'cara@ex.com');
  await page.evaluate(() => _requestClientLink()); await page.waitForTimeout(800);
  const lk = await page.evaluate(() => (document.getElementById('client-link-msg') || {}).textContent || '');
  if (mode === 'ok' ? !/on its way/.test(lk) : /on its way/.test(lk)) fail.push(mode + ' link: ' + lk);
  if (mode === 'ok' && !st.codeScreen) fail.push('ok: did not move to code screen ' + JSON.stringify(st));
  if (mode !== 'ok' && (st.codeScreen || !st.msg || /Sending/.test(st.msg))) fail.push(mode + ': ' + JSON.stringify(st));
  await page.context().close();
}
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS (too many tries / server error stay on the email screen and say so; success moves on)', errs.length ? '\npage errors: ' + errs.join(' | ') : '');
await browser.close(); srv.close(); process.exit(fail.length || errs.length ? 1 : 0);
