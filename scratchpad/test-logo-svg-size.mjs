// _pickLogo (2026-11-18): a small SVG logo is kept as-is; a big one (a photo saved inside an SVG)
// is drawn to the same 320px PNG as any other picture, so the branding clients load stays small.
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const p = await b.newPage();
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await p.goto('file://' + new URL('../slickchart-vercel/slickchart.html', import.meta.url).pathname);
await p.waitForFunction(() => typeof _pickLogo === 'function');
const run = svg => p.evaluate(async (svg) => {
  const orig = document.createElement.bind(document); let inp = null;
  document.createElement = (t) => { const e = orig(t); if (t === 'input') inp = e; return e; };
  const out = new Promise(res => _pickLogo(res));
  document.createElement = orig;
  const dt = new DataTransfer(); dt.items.add(new File([svg], 'logo.svg', { type: 'image/svg+xml' }));
  inp.files = dt.files; inp.onchange();
  const url = await out; return { head: url.slice(0, 22), len: url.length };
}, svg);
const small = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="teal"/></svg>';
const pad = '<!--' + 'x'.repeat(400000) + '-->';
const big = '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1000">' + pad + '<rect width="2000" height="1000" fill="teal"/></svg>';
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' — ' + JSON.stringify(d))); ok ? pass++ : fail++; };
const s = await run(small); check('small SVG kept as SVG', s.head.startsWith('data:image/svg+xml'), s);
const g = await run(big); check('big SVG becomes a small PNG', g.head.startsWith('data:image/png') && g.len < 60000, g);
await b.close(); console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
