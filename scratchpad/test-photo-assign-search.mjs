// The "Assign photos to which client?" search finds José by "jose", like every other client search.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(0);
const cr = process.env.PW_ENGINE === 'chromium';
const b = await (cr ? pw.chromium : pw.webkit).launch(cr ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{}' }));
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.goto(`http://localhost:${srv.address().port}/slickchart.html`); await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  CL.a = { id: 'a', name: 'José Núñez' }; CL.b = { id: 'b', name: 'Ava Lane' };
  const ov = document.createElement('div'); ov.id = 'photo-recover'; document.body.appendChild(ov);
  capturedPhotos.x = [{ id: 'p1' }]; _pr_reassign('x', true);
  const vis = () => Array.from(document.querySelectorAll('#photo-recover .pr-cl')).filter(e => e.style.display !== 'none').map(e => e.textContent.trim().slice(0, 20));
  _pr_filterClients('jose'); const a1 = vis(); _pr_filterClients('NUÑEZ'); const a2 = vis(); _pr_filterClients('ava'); const a3 = vis();
  return { a1, a2, a3 }; });
ok('"jose" finds José Núñez', r.a1.length === 1 && /Jos/.test(r.a1[0]), r.a1);
ok('"NUÑEZ" finds José Núñez', r.a2.length === 1 && /Jos/.test(r.a2[0]), r.a2);
ok('"ava" finds Ava only', r.a3.length === 1 && /Ava/.test(r.a3[0]), r.a3);
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
