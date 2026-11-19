// Long real-world names on a phone (2026-11-19 LONG=1 crawl): Take Payment was 634px wide on a 390px
// phone with a long hyphenated client name and a long email, so the whole screen slid sideways. The
// client's name and contact now wrap. Also: the client app's initials circle reads at AA (4.5:1+).
//   PLAYWRIGHT_BROWSERS_PATH=<webkit> node scratchpad/test-long-names-phone.mjs   (needs :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE = process.env.ENGINE || 'webkit';
const res = []; const ok = (c, m, d) => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const w of [390, 320]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 760 }, serviceWorkers: 'block' }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(4500);
  for (const [scr, label] of [['checkout', 'Take Payment'], ['client', 'client file']]) {
    await p.evaluate(s => { CL.x = { id: 'x', name: 'Ava Montgomery-Vanderbilt-Lane Alexandrina-Rosalind', email: 'alexandrina.montgomery.vanderbilt.cust0@extremelylongdomainname-example.com', treatment: 'Facial' }; nav(s, 'x'); }, scr);
    await p.waitForTimeout(700);
    const wide = await p.evaluate(() => { const S = document.getElementById('S'); let m = 0; S.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect(); if (r.width > 0) { let q = e.parentElement, clip = false; while (q && q !== S) { if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(q).overflowX)) { clip = true; break; } q = q.parentElement; } if (!clip) m = Math.max(m, r.right); } }); return Math.round(m); });
    ok(wide <= w + 2, label + ' fits a ' + w + 'px phone with a long name and email', wide + 'px');
  }
  ok(!errs.length, 'no page errors at ' + w, errs.join(' | '));
  await ctx.close();
}
// client app initials circle, default brand, light theme
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
await p.goto('http://localhost:8899/slickchart-client.html'); await p.waitForTimeout(1500);
const c = await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); try { applyClientTheme(); } catch (e) {} const d = document.createElement('div'); d.className = 'avatar'; d.textContent = 'MR'; document.body.appendChild(d);
  const px = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); const L = a => { const c = a.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const st = getComputedStyle(d); const f = L(px(st.color)), g = L(px(st.backgroundColor)); return Math.round(((Math.max(f, g) + 0.05) / (Math.min(f, g) + 0.05)) * 100) / 100; });
ok(c >= 4.5, 'client app initials circle reads at 4.5:1 or better', String(c));
await b.close();
const f = res.filter(x => !x).length; console.log(f ? f + ' FAILED' : 'ALL PASS'); process.exit(f ? 1 : 0);
