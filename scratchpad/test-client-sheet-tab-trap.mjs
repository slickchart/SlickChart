// Client app on a computer: Tab and Shift+Tab stay inside an open sheet (2026-11-19 keyboard sweep; the
// provider app had this, the client app did not, so focus walked into the covered screen).
// usage: [PW_ENGINE=chromium] node scratchpad/test-client-sheet-tab-trap.mjs (server on 8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const cr = process.env.PW_ENGINE === 'chromium';
const b = await (cr ? pw.chromium : pw.webkit).launch(cr ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
const page = await (await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await page.goto('http://localhost:8899/slickchart-client.html', { waitUntil: 'load' }); await page.waitForTimeout(1500);
for (const [name, open] of [['provider sheet', () => openProviderSheet()], ['input sheet', () => _inputSheet({ title: 'Your name', placeholder: 'Name', action: 'Save' }, () => {})]]) {
  await page.evaluate(`(${open.toString()})()`); await page.waitForTimeout(300);
  const has = await page.evaluate(() => !!_topOverlay()); ok(name + ' opens as a sheet', has);
  if (!has) continue;
  let out = 0, seen = new Set();
  for (let i = 0; i < 25; i++) { await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab'); const r = await page.evaluate(() => { const ov = _topOverlay(); const a = document.activeElement; return { inside: !!(ov && ov.contains(a)), tag: a && (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 20) }; }); if (!r.inside) out++; seen.add(r.tag); }
  ok(name + ': 25 Tab presses never leave the sheet', out === 0, { out, seen: [...seen] });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(name + ': Escape still closes it', !(await page.evaluate(() => !!_topOverlay())));
}
ok('no page errors', errs.length === 0, errs);
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
