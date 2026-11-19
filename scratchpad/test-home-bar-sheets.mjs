// iPhone home-screen app (black-translucent status bar, viewport-fit=cover): a sheet that slides up from
// the bottom must keep its last button above the home bar (34px). The 2026-11-19 SAFE=1 crawl found 16
// sheets with it ON the bar. Here env(safe-area-inset-*) is served as an iPhone's values, and with 0
// (a computer, Android, the native app's own inset) nothing may move.
//   PLAYWRIGHT_BROWSERS_PATH=<webkit> node scratchpad/test-home-bar-sheets.mjs     (needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899, ENGINE = process.env.ENGINE || 'webkit';
const res = []; const ok = (c, m, d) => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function open(file, safe) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  if (safe) await p.route('**/' + file + '*', async r => { const x = await r.fetch(); const body = (await x.text()).replace(/env\(\s*safe-area-inset-top\s*(,[^)]*)?\)/g, '47px').replace(/env\(\s*safe-area-inset-bottom\s*(,[^)]*)?\)/g, '34px');
    return r.fulfill({ status: 200, contentType: 'text/html', body }); });
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await p.goto('http://localhost:' + PORT + '/' + file); await p.waitForTimeout(4500); return { p, errs };
}
const lastBtn = (p, sel) => p.evaluate(s => { const ov = document.querySelector(s); const bs = [...ov.querySelectorAll('button')].filter(x => x.getBoundingClientRect().height > 1); const r = bs[bs.length - 1].getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: innerHeight, border: getComputedStyle(ov.firstElementChild).borderBottomWidth }; }, sel);
for (const safe of [true, false]) {
  const { p, errs } = await open('slickchart.html', safe);
  await p.evaluate(() => { CL.a = { name: 'Ava Lane' }; nav('payments'); _payLogOpen(); }); await p.waitForTimeout(500);
  const pay = await lastBtn(p, '#pay-log');
  if (safe) ok(pay.bottom <= pay.h - 34, 'iPhone home bar: "Log a payment" Cancel sits above the home bar', JSON.stringify(pay));
  else ok(pay.border === '0px', 'no home bar: the sheet is exactly as before', JSON.stringify(pay));
  // a sheet built from a style attribute written as text (spaces after colons) is covered too
  const t = await p.evaluate(() => { const m = document.createElement('div'); m.style.cssText = 'position:fixed;inset:0;display:flex;align-items:flex-end;'; m.innerHTML = '<div style="background:#fff;padding:10px"><button>x</button></div>'; document.body.appendChild(m); const w = getComputedStyle(m.firstElementChild).borderBottomWidth; m.remove(); return w; });
  ok(t === (safe ? '34px' : '0px'), 'a sheet whose style was set in code is covered (' + (safe ? 'iPhone' : 'no home bar') + ')', t);
  ok(!errs.length, 'no page errors', errs.join(' | '));
  await p.context().close();
  const c = await open('slickchart-client.html?c=TOK', safe);
  const cw = await c.p.evaluate(() => { const m = document.createElement('div'); m.style.cssText = 'position:fixed;top:0;bottom:0;left:0;right:0;display:flex;flex-direction:column;justify-content:flex-end;'; m.innerHTML = '<div style="background:#fff;padding:10px 10px 28px"><button>x</button></div>'; document.body.appendChild(m); const w = getComputedStyle(m.firstElementChild).borderBottomWidth; m.remove(); return w; });
  ok(cw === (safe ? '34px' : '0px'), 'client app: a bottom sheet keeps clear of the home bar (' + (safe ? 'iPhone' : 'no home bar') + ')', cw);
  await c.p.context().close();
}
await b.close();
const f = res.filter(x => !x).length; console.log(f ? f + ' FAILED' : 'ALL PASS'); process.exit(f ? 1 : 0);
