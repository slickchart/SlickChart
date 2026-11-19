// The client app fills a phone's screen, portrait and sideways: the menu sits on the bottom edge
// (2026-11-19 sweep: the computer-size frame's max-height calc(100vh - 72px) was never lifted on phones,
// leaving 72px of empty screen under the menu, and a thin strip of app with the phone turned sideways).
// A computer still gets the framed phone. usage: [PW_ENGINE=chromium] node scratchpad/test-client-fills-screen.mjs (needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const cr = process.env.PW_ENGINE === 'chromium';
const b = await (cr ? pw.chromium : pw.webkit).launch(cr ? { executablePath: '/opt/pw-browsers/chromium' } : {});
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
for (const [w, h, phone] of [[390, 844, 1], [320, 568, 1], [412, 915, 1], [844, 390, 1], [1032, 1376, 1], [1440, 900, 0]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: !!phone, isMobile: cr && !!phone, serviceWorkers: 'block' }); const page = await ctx.newPage();
  await mockApi(page, { records: { TOK: clientRecord('c1', 'Jo Rivera', { providerName: 'Ashley' }) } });
  await page.goto(BASE + '?c=TOK'); await page.waitForTimeout(2000);
  const m = await page.evaluate(() => { const s = document.querySelector('.shell').getBoundingClientRect(), n = document.querySelector('.shell>.nav').getBoundingClientRect(), S = document.getElementById('S').getBoundingClientRect(); return { shellBottom: Math.round(s.bottom), navBottom: Math.round(n.bottom), content: Math.round(S.height), coarse: matchMedia('(pointer:coarse)').matches, H: innerHeight }; });
  if (phone && !m.coarse && w > 480) { console.log(`SKIP ${w}x${h}: this engine does not report a touch screen here`); await ctx.close(); continue; }
  if (phone) ok(`${w}x${h}: menu on the bottom edge, no empty band`, Math.abs(m.navBottom - m.H) <= 1 && Math.abs(m.shellBottom - m.H) <= 1, m);
  else ok(`${w}x${h} computer: still the framed phone`, m.shellBottom < m.H, m);
  await ctx.close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
