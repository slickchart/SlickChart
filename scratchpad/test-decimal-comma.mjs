// A price typed with a decimal comma ("45,50", what a phone set to a comma-decimal region puts on the
// price keypad) is $45.50, never $4,550 (2026-11-20 sweep). A thousands comma ("1,200") still reads 1200.
// usage: [PW_ENGINE=chromium] node scratchpad/test-decimal-comma.mjs (serves slickchart-vercel)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(0);
const cr = process.env.PW_ENGINE === 'chromium';
const b = await (cr ? pw.chromium : pw.webkit).launch(cr ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', locale: 'es-ES' })).newPage();
await page.route('**/api/**', r => r.request().url().includes('cloud-status') ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }) : r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.goto(`http://localhost:${srv.address().port}/slickchart.html`); await page.waitForTimeout(3000);
const cases = [['45,50', 45.5], ['45,5', 45.5], ['$45,50', 45.5], ['45.50', 45.5], ['1,200', 1200], ['1,200.50', 1200.5], ['1.234,50', 1234.5], ['$45', 45], ['45', 45], [' 12,00 ', 12], ['', 0], ['-5', 0], ['abc', 0]];
for (const [v, want] of cases) { const got = await page.evaluate(v => _price(v), v); ok(`_price(${JSON.stringify(v)}) = ${want}`, got === want, got); }
// Through the real checkout screen: typed amount on the price keypad.
await page.evaluate(() => { document.getElementById('login-screen')?.remove(); CL.c1 = { id: 'c1', name: 'Ava Lane', email: 'a@b.co' }; nav('checkout', 'c1'); }); await page.waitForTimeout(300);
await page.locator('#co-amt').tap(); await page.keyboard.insertText('45,50');
ok('checkout amount typed 45,50 is 45.50', await page.evaluate(() => _coAmount()) === 45.5, await page.evaluate(() => _coAmount()));
// Tax rate typed 8,25 is 8.25 (was 8).
const tr = await page.evaluate(() => { _saveTaxRate('8,25'); return _taxRate; }); ok('tax rate 8,25 is 8.25', tr === 8.25, tr);
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
