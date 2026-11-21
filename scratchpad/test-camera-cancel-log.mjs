// Closing the camera or photo picker herself was logged as camera-fail, so the provider watch flagged a
// camera problem that was not one (Ashley's Android, 2026-11-20). Requires: cancel -> 'camera-closed'
// and nothing else happens; a refused camera -> 'camera-fail'. PORT (default 8900); ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(2500);
const r = await p.evaluate(() => { const got = []; window._alAdd = (e, d) => got.push(e); let after = 0, toasts = 0; const pt = window.proToast; window.proToast = () => { toasts++; };
  _ncLastErr = 'User cancelled photos app'; _ncCameraFailed(null, () => { after++; }); const a = got.slice(); got.length = 0;
  _ncLastErr = 'User denied access to camera'; _ncCameraFailed(null, () => {}); window.proToast = pt; return { cancel: a, denied: got.slice(), after, toasts }; });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
ok(r.cancel.includes('camera-closed') && !r.cancel.includes('camera-fail') && r.after === 1, 'cancel is logged as camera-closed and the screen carries on (' + JSON.stringify(r.cancel) + ')');
ok(r.denied.includes('camera-fail') && r.toasts === 1, 'a refused camera is still camera-fail and says how to turn it on');
await b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
