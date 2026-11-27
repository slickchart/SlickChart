// Reports showed its period as "2026-11-01 to 2026-11-30", and "All time" as "0000-01-01 to 9999-12-31",
// on screen and in the printed Income Statement (sweep area 6, round 3, 2026-11-27). Requires, at phone,
// iPad and computer: no ISO date and no 0000/9999 on the Reports screen or the statement header for
// every period; This month names the month in words; All time shows no range at all.
// PORT (default 8900) serves slickchart-vercel/. ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig';
const acct = { sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const ISO = /\d{4}-\d{2}-\d{2}|0000|9999/;
for (const [size, vp] of [['phone', { width: 390, height: 844 }], ['ipad', { width: 1032, height: 1376 }], ['mac', { width: 1440, height: 900 }]]) {
  const ctx = await b.newContext({ viewport: vp, serviceWorkers: 'block', locale: 'en-US' });
  const p = await ctx.newPage();
  await p.addInitScript(([a, t]) => { localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    for (const k of Object.keys(a)) localStorage.setItem(k, a[k]); }, [acct, TOK]);
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : r.request().url().includes('/api/store') ? JSON.stringify({ data: acct }) : '{"ok":true,"data":{},"clients":[],"events":[],"items":[]}' }));
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(3000);
  for (const k of ['this-month', 'last-month', 'this-quarter', 'this-year', 'last-year', 'all']) {
    const r = await p.evaluate(k => { _reportKey = k; renderReports(); const txt = document.getElementById('main') ? document.getElementById('main').innerText : document.body.innerText;
      const rr = _reportRange(k); const doc = _reportDocHTML(rr, _reportData(rr.from, rr.to)); const meta = (doc.match(/<div class="meta">[^<]*<\/div>/g) || []).join(' ');
      return { txt: txt.slice(0, 4000), meta, label: rr.label }; }, k);
    ok(!ISO.test(r.txt), `${size} ${k}: Reports screen shows no ISO/0000 date`);
    ok(!ISO.test(r.meta), `${size} ${k}: statement header has no ISO/0000 date (${r.meta.slice(0, 140)})`);
    if (k === 'this-month') { const mon = new Date().toLocaleDateString('en-US', { month: 'short' }); ok(r.txt.includes(mon), `${size} this-month names ${mon}`); }
    if (k === 'all') ok(/All time · 0 paid/.test(r.txt), `${size} all time: no range shown`);
  }
  await ctx.close();
}
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
