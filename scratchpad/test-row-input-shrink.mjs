// A text box sharing a row (flex:1) could not shrink below its natural width, so on a phone it pushed
// the buttons after it past the edge: check-in settings' heat options lost their Remove button off the
// right side at 412 (Android) and 390 (iPhone) (2026-11-19 sweep). Every button on that screen must be
// inside the window at 320, 390 and 412.
//   node scratchpad/test-row-input-shrink.mjs   (ENGINE=webkit + PLAYWRIGHT_BROWSERS_PATH for Safari; needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE = process.env.ENGINE || 'chromium';
const res = []; const ok = (c, m, d) => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const w of [320, 390, 412]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 860 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(4500);
  await p.evaluate(() => nav('checkin-settings')); await p.waitForTimeout(500);
  const out = await p.evaluate(() => [...document.querySelectorAll('#S button')].filter(e => { const r = e.getBoundingClientRect(); if (!(e.offsetWidth > 0 && (r.right > innerWidth + 2 || r.left < -2))) return false; let q = e.parentElement; while (q && q.id !== 'S' && q !== document.body) { if (/(auto|scroll)/.test(getComputedStyle(q).overflowX)) return false; q = q.parentElement; } return true; }).map(e => e.getAttribute('aria-label') || e.innerText.trim()));
  const rm = await p.evaluate(() => document.querySelectorAll('#S button[aria-label^="Remove"]').length);
  ok(rm > 0 && !out.length, 'check-in settings at ' + w + 'px: every button inside the window (' + rm + ' Remove buttons)', out.join(' | '));
  await ctx.close();
}
await b.close();
const f = res.filter(x => !x).length; console.log(f ? f + ' FAILED' : 'ALL PASS'); process.exit(f ? 1 : 0);
