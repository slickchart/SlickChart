// Client profile photo that could not reach the provider is sent again on the next open, only on the
// same provider link (2026-11-19 sweep: "Saved here, couldn't reach your provider" was never retried).
// usage: [PW_ENGINE=chromium] node scratchpad/test-client-avatar-retry.mjs (server on 8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const cr = process.env.PW_ENGINE === 'chromium';
const b = await (cr ? pw.chromium : pw.webkit).launch(cr ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
let net = false; const sent = [];
await page.route('**/api/**', r => { const u = r.request().url();
  if (u.includes('/api/client-submit')) { if (!net) return r.abort('internetdisconnected'); sent.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await page.goto('http://localhost:8899/slickchart-client.html', { waitUntil: 'load' }); await page.waitForTimeout(1500);
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
await page.evaluate(img => { client._real = true; client._token = 'tokA'; _setClientAvatar(img); }, IMG); await page.waitForTimeout(2500);
ok('offline: photo marked unsent for this link', await page.evaluate(() => localStorage.getItem('sc_client_avatar_unsent')) === 'tokA');
net = true;
await page.evaluate(() => { client._token = 'tokB'; _retryUnsentAvatar(); }); await page.waitForTimeout(800);
ok('another provider link: not sent there', sent.length === 0, sent.map(s => s.t));
await page.evaluate(() => { client._token = 'tokA'; _retryUnsentAvatar(); }); await page.waitForTimeout(800);
ok('same link on the next open: photo sent', sent.length === 1 && sent[0].t === 'tokA' && sent[0].kind === 'contact' && /^data:image/.test(sent[0].payload && sent[0].payload.avatar || ''), sent.map(s => [s.t, s.kind]));
ok('...and the mark is cleared', await page.evaluate(() => localStorage.getItem('sc_client_avatar_unsent')) === null);
sent.length = 0; await page.evaluate(() => _retryUnsentAvatar()); await page.waitForTimeout(500);
ok('nothing sent twice', sent.length === 0, sent.length);
await page.evaluate(img => _setClientAvatar(img), IMG); await page.waitForTimeout(800);
ok('online change: sent once, no mark left', sent.length === 1 && await page.evaluate(() => localStorage.getItem('sc_client_avatar_unsent')) === null, sent.length);
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
