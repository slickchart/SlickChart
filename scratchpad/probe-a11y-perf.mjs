import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8899/slickchart-provider-demo.html'); await p.waitForTimeout(2800);
const r = await p.evaluate(() => { nav('clients'); const n = document.querySelectorAll('*').length; const t0 = performance.now(); for (let i = 0; i < 10; i++) _a11yPatch(document.body); const per = (performance.now() - t0) / 10;
  const t1 = performance.now(); nav('forms'); nav('clients'); const navMs = performance.now() - t1;
  const unl = Array.from(document.querySelectorAll('input,textarea')).filter(e => !e.getAttribute('aria-label') && !e.closest('label')).length; return { nodes: n, patchMs: per.toFixed(1), twoNavsMs: navMs.toFixed(0), unl }; });
console.log(JSON.stringify(r), errs); await b.close();
