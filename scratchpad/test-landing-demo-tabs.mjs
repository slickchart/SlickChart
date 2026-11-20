// Landing page demo phone: the bottom tabs of BOTH demos sit inside the frame, and the app starts below the
// "Live demo" banner, at phone and computer sizes (2026-11-20: the client demo's tabs were cut off, because
// its own sample banner stacked on the demo banner and pushed a full-height app 40px down).
// usage: [PW_ENGINE=chromium] node scratchpad/test-landing-demo-tabs.mjs   (vercel-like server on 8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const cr = process.env.PW_ENGINE === 'chromium';
const b = await (cr ? pw.chromium : pw.webkit).launch();
let fails = 0;
const sizes = [[390, 844, 1], [375, 667, 1], [360, 740, 1], [320, 568, 1], [430, 932, 1], [768, 1024, 1], [1280, 800, 0], [1440, 900, 0], [1920, 1080, 0]];
for (const which of ['provider', 'client']) for (const [w, h, m] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: !!m, serviceWorkers: 'block', ...(cr ? { isMobile: !!m } : {}) });
  const p = await ctx.newPage();
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.goto('http://localhost:8899/');
  if (which === 'client') await p.click('#tgCli');
  await p.locator('#demoFrame').scrollIntoViewIfNeeded(); await p.waitForTimeout(3500);
  const f = p.frames().find(x => x.url().includes(which + '-demo'));
  const r = f ? await f.evaluate(() => {
    const n = document.querySelector('nav'), sh = document.querySelector('.shell'), bn = document.getElementById('sc-demo-banner');
    const fixed = [...document.body.children].filter(e => getComputedStyle(e).position === 'fixed' && e.offsetHeight).length;
    return { navBottom: n.getBoundingClientRect().bottom, vh: innerHeight, shellTop: sh.getBoundingClientRect().top, bannerBottom: bn.getBoundingClientRect().bottom, fixed };
  }) : null;
  const ok = r && r.navBottom <= r.vh + 0.5 && r.shellTop >= r.bannerBottom - 0.5 && r.fixed === 1;
  console.log((ok ? 'PASS ' : 'FAIL ') + which + ' ' + w + 'x' + h + (ok ? '' : '  ' + JSON.stringify(r)));
  if (!ok) fails++;
  await ctx.close();
}
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
