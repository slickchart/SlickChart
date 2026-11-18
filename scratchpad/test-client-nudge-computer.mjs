// REGRESSION (2026-11-18, rotation area 8): a client who opens her link on a computer is not told to
// get the iPhone/Android app; on a phone the nudge still shows. Needs :8899. [PW_ENGINE=chromium]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const eng = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await eng.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
for (const [name, opt] of [['computer', { viewport: { width: 1440, height: 900 }, userAgent: MAC }], ['iPhone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE }]]) {
  const page = await (await browser.newContext({ ...opt, serviceWorkers: 'block' })).newPage();
  await mockApi(page, { records: { TOK: clientRecord('c1', 'Jo Rivera', { studio: 'Rose Glow Skin' }) } });
  await page.goto(BASE + '?c=TOK'); await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(2500);
  const shown = await page.evaluate(() => !!document.getElementById('sc-appnudge'));
  ok(name === 'computer' ? !shown : shown, name + ': "get the app" nudge ' + (name === 'computer' ? 'hidden' : 'shown'));
}
await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
