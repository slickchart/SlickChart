// A save that fails while the phone has the app in the background is not a real problem, so no warning
// (2026-11-19 sweep: Ashley's Android showed "Changes couldn't back up to the cloud yet" four times, each
// while the app was hidden or 26ms after it came back). On return the save is retried at once; a save
// that still fails once she is back warns as before.
// usage: [PW_ENGINE=chromium] node scratchpad/test-sync-toast-hidden.mjs (serves slickchart-vercel)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(0);
const cr = process.env.PW_ENGINE === 'chromium';
const b = await (cr ? pw.chromium : pw.webkit).launch(cr ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' })).newPage();
let storeOk = false, stores = 0;
await page.route('**/api/**', r => { const u = r.request().url(); if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && r.request().method() === 'PUT') { stores++; return storeOk ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.abort('internetdisconnected'); }
  return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.goto(`http://localhost:${srv.address().port}/slickchart.html`); await page.waitForTimeout(3000);
await page.evaluate(() => {
  window.__vis = 'visible'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__vis === 'hidden' });
  Cloud.token = 'test'; Cloud._holdUploads = () => false; Cloud._passive = false;
  window.__setVis = v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange')); };
});
const toast = () => page.evaluate(() => { const t = document.getElementById('pro-toast'); return t ? t.textContent : ''; });
const clearToast = () => page.evaluate(() => { const t = document.getElementById('pro-toast'); if (t) t.remove(); _cloudSyncToastAt = 0; });
// 1. App goes to the background, a save fails there (the retry path that used to warn).
await page.evaluate(() => { __setVis('hidden'); _cloudSyncShownAt = 0; }); await clearToast();
await page.evaluate(() => { Cloud._queue.sc_test_key = '{"a":1}'; return Cloud._flush(1); }); await page.waitForTimeout(400);
ok('no warning for a save that failed while the app was hidden', !/back up to the cloud/.test(await toast()), await toast());
// 2. She comes back: the queued save goes again at once, and a failure in the first moment stays quiet.
stores = 0; storeOk = false;
await page.evaluate(() => __setVis('visible')); await page.waitForTimeout(1500);
ok('coming back retries the save right away', stores >= 1, stores);
ok('no warning in the moment after coming back', !/back up to the cloud/.test(await toast()), await toast());
// 3. Back in the app for a while and the save still fails: she is told, as before.
await clearToast(); await page.evaluate(() => { _cloudSyncShownAt = Date.now() - 20000; Cloud._queue.sc_test_key = '{"a":2}'; return Cloud._flush(1); }); await page.waitForTimeout(400);
ok('a save still failing while she is in the app warns', /back up to the cloud/.test(await toast()), await toast());
// 4. Once the connection works, the queued save lands.
storeOk = true; stores = 0; await page.evaluate(() => { clearTimeout(Cloud._timer); Cloud._queue.sc_test_key = '{"a":3}'; return Cloud._flush(0); }); await page.waitForTimeout(400);
ok('the save lands once it can', stores >= 1 && !Object.keys(await page.evaluate(() => Cloud._queue)).includes('sc_test_key'), stores);
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
