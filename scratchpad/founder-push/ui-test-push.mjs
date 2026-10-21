// The founder "Test my push notifications" rows always end in a popup, the delayed one and a server error too.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const FILE = new URL('../../slickchart-vercel/slickchart.html', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
let mode = 'ok';
await p.route('**/api/**', r => {
  if (r.request().url().includes('/api/admin/test-push')) {
    if (mode === 'err') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Something went wrong."}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sent: 0, devices: 1, message: '1 device registered, but the push didn’t go through (send 401).' }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
await p.goto('file://' + FILE); await p.waitForTimeout(2500);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const run = async (delay) => p.evaluate(async (d) => {
  let got = null; const orig = window.confirmModal; window.confirmModal = (o) => { got = o; };
  const row = document.createElement('div'); row.innerHTML = '<div><div>a</div><div>b</div></div>';
  await _founderTestPush(row.firstChild ? row : row, d); window.confirmModal = orig; return got;
}, delay);
let g = await run(6); ok(g && /Couldn’t deliver/.test(g.title) && /send 401/.test(g.body), 'delayed test shows its result: ' + JSON.stringify(g));
g = await run(0); ok(g && /send 401/.test(g.body), 'instant test shows its result');
mode = 'err'; g = await run(6); ok(g && /didn’t run/.test(g.title) && /Something went wrong/.test(g.body), 'server error shows a popup: ' + JSON.stringify(g));
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
