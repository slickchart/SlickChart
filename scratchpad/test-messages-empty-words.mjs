// Messages with no conversations told her to "Tap New message", but the button says "New" (sweep, area 7,
// 2026-11-20). Requires the words to name a button that is on the screen. PORT (default 8900); ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const acct = { sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const ctx = await b.newContext({ viewport: vp, serviceWorkers: 'block' }); const p = await ctx.newPage();
  await p.addInitScript(([a, t]) => { localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1'); for (const k of Object.keys(a)) localStorage.setItem(k, a[k]); }, [acct, b64({ u: 'prov_ash' }) + '.sig']);
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : r.request().url().includes('/api/store') ? JSON.stringify({ data: acct }) : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(3000);
  await p.evaluate(() => nav('messages')); await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const t = (document.getElementById('S') || document.body).innerText; const m = t.match(/Tap ([A-Z][a-z]+(?: [a-z]+)?) to start/); const btns = [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.innerText.trim());
    return { said: m && m[1], btns }; });
  ok(r.said && r.btns.includes(r.said), vp.width + 'px: "Tap ' + r.said + '" names a button on screen (' + r.btns.filter(Boolean).slice(0, 6).join(' | ') + ')');
  await ctx.close();
}
await b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
