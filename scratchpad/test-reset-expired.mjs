// REGRESSION (2026-11-19): an old password-reset email opened "Set password" with no way out: an expired link said so and offered nothing else. Now it offers a new link and back to log in.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await page.route('**/api/**', r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/reset')) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"This reset link is invalid or has expired."}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.goto('http://localhost:' + PORT + '/slickchart.html?reset=OLDTOKEN', { waitUntil: 'load' });
await page.waitForSelector('#login-pw', { timeout: 15000 });
await page.fill('#login-pw', 'newpassword1'); await page.press('#login-pw', 'Enter'); await page.waitForTimeout(800);
const err = await page.textContent('#login-err');
const fail = [];
if (!/expired/.test(err || '')) fail.push('expired error not shown: ' + err);
const b = page.locator('#login-screen button', { hasText: 'Send reset link' });
if (!(await b.count())) fail.push('no Send reset link on the set-password screen');
else { await b.first().click(); await page.waitForTimeout(400); if (!(await page.$('#login-email'))) fail.push('Send reset link did not open the email box'); }
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS (expired reset link offers a new link)', errs.length ? '\npage errors: ' + errs.join(' | ') : '');
await browser.close(); srv.close(); process.exit(fail.length || errs.length ? 1 : 0);
