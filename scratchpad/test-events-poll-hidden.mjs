// _evTick (2026-11-18): the 15 s check for client submissions runs every tick while the app is on
// screen, at most every 2 minutes while hidden, and at once when the app comes back on screen.
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const p = await b.newPage();
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await p.goto('file://' + new URL('../slickchart-vercel/slickchart.html', import.meta.url).pathname);
await p.waitForFunction(() => typeof _evTick === 'function');
const r = await p.evaluate(async () => {
  let n = 0; window.syncClientEvents = function () { n++; };
  let hidden = false; Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const now0 = Date.now(); let t = now0; const realNow = Date.now; Date.now = () => t;
  const out = {};
  for (let i = 0; i < 8; i++) { _evTick(); t += 15000; } out.visible = n; n = 0;      // 2 min on screen
  hidden = true; for (let i = 0; i < 40; i++) { _evTick(); t += 15000; } out.hidden10min = n; n = 0;
  hidden = false; document.dispatchEvent(new Event('visibilitychange')); out.onReturn = n;
  Date.now = realNow; return out;
});
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' — ' + JSON.stringify(d))); ok ? pass++ : fail++; };
check('on screen: every 15 s tick checks', r.visible === 8, r);
check('hidden: about every 2 minutes (10 min -> 5 checks, not 40)', r.hidden10min >= 4 && r.hidden10min <= 6, r);
check('coming back on screen checks at once', r.onReturn >= 1, r);
await b.close(); console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
