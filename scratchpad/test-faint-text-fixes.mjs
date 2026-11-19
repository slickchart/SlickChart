// Words that were too faint to read (2026-11-19 phone sweep, TINY=1): the analysis cards' teal rows
// (light teal on mint, 1.9:1) and the purple "Start voice note" button (dark text on purple, 2.6:1).
// Both themes. usage: [ENGINE=webkit] node scratchpad/test-faint-text-fixes.mjs (needs :8899, build-demo run)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const eng = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const b = await eng.launch(process.env.ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium' });
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
for (const theme of ['light', 'dark']) {
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.addInitScript(t => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_provider_theme', t); } catch (e) {} }, theme);
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":false}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await page.goto('http://localhost:8899/slickchart-provider-demo.html'); await page.waitForTimeout(2500);
  const ratio = sel => page.evaluate(sel => { const L = c => { const m = (c || '').match(/[\d.]+/g); const [r, g, b] = m.slice(0, 3).map(v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    return [...document.querySelectorAll(sel)].filter(e => e.offsetParent).map(e => { let p = e, bg; while (p) { bg = getComputedStyle(p).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) break; p = p.parentElement; } const a = L(getComputedStyle(e).color), c = L(bg); return { t: e.textContent.trim().slice(0, 20), r: +((Math.max(a, c) + .05) / (Math.min(a, c) + .05)).toFixed(2) }; }); }, sel);
  await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach(m => m.remove()); document.getElementById('S').innerHTML = '<div id="mc">' + _metricCardsHTML([['Pigmentation', 'PIH Gr.2', 'note', 'var(--accent)', 'var(--accent-tint)'], ['Hydration', '62%', 'note', 'var(--p-blue)', 'var(--p-blue-bg)']]) + '</div>'; });
  for (const x of await ratio('#mc span')) ok(`${theme}: analysis card "${x.t}" readable (${x.r}:1)`, x.r >= 4.5, x);
  await page.evaluate(() => { aiEnabled = true; nav('notes', Object.keys(CL)[0]); }); await page.waitForTimeout(500);
  const v = await ratio('button[onclick^="startVoiceNote"]');
  ok(`${theme}: Start voice note button is there`, v.length === 1, v); for (const x of v) ok(`${theme}: "${x.t}" readable (${x.r}:1)`, x.r >= 4.5, x);
  await page.context().close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
