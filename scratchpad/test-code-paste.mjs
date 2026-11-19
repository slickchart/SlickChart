// A sign-in code pasted with spaces ("123 456", " 123456") still signs in (2026-11-19 sweep): the code
// boxes held only 6 characters, so a leading space cut off the last digit. Client email code and the
// authenticator box. usage: [PW_ENGINE=chromium] node scratchpad/test-code-paste.mjs (serves slickchart-vercel)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(0);
const cr = process.env.PW_ENGINE === 'chromium';
const b = await (cr ? pw.chromium : pw.webkit).launch(cr ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' })).newPage();
const bodies = [];
await page.route('**/api/**', r => { const u = r.request().url(); if (/client-code|login/.test(u) && r.request().method() === 'POST') bodies.push(r.request().postData() || ''); if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }); return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"That code did not match."}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.goto(`http://localhost:${srv.address().port}/slickchart.html`); await page.waitForTimeout(3000);
for (const paste of [' 123456', '123 456', '123-456\n']) {
  await page.evaluate(() => { try { _clientCodeEmail = 'jo@example.com'; } catch (e) {} _setLoginMode('clientcode'); }); await page.waitForTimeout(200);
  await page.locator('#client-code').tap(); await page.keyboard.insertText(paste); await page.waitForTimeout(100);
  const v = await page.inputValue('#client-code'); ok(`client code pasted as ${JSON.stringify(paste)} becomes 123456`, v === '123456', v);
  bodies.length = 0; await page.evaluate(() => _clientVerifyCode()); await page.waitForTimeout(500);
  ok(`  ...and 123456 is what is sent`, bodies.some(x => x.includes('123456')), bodies);
}
await page.evaluate(() => { _pendingTotpEmail = 'a@b.com'; _pendingTotpPw = 'x'; _setLoginMode('totp'); }); await page.waitForTimeout(200);
await page.locator('#login-totp').tap(); await page.keyboard.insertText(' 654 321'); ok('authenticator code pasted with spaces becomes 654321', await page.inputValue('#login-totp') === '654321', await page.inputValue('#login-totp'));
await page.locator('#login-totp').fill(''); await page.locator('#login-totp').tap(); await page.keyboard.type('12345678'); ok('typing past 6 digits stops at 6', await page.inputValue('#login-totp') === '123456', await page.inputValue('#login-totp'));
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
