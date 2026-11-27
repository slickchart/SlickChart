// Reminders' notification card said "Get these on your phone" on a computer (and "your phone's Settings"
// in the iPad app). Sweep area 7 round 3, 2026-11-27. Requires the card to name the device in hand:
// computer (mouse, 1440), web iPhone, web iPad, native iPhone app, native iPad app.
// PORT (default 8900) serves slickchart-vercel/. ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig';
const acct = { sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const cases = [
  ['computer', { viewport: { width: 1440, height: 900 } }, false, /Get these on your computer/, /phone/],
  ['web iPhone', { viewport: { width: 390, height: 844 }, userAgent: IPHONE, hasTouch: true, isMobile: ENGINE !== 'webkit' }, false, /Get these on your phone/, /computer|iPad/],
  ['web iPad', { viewport: { width: 1032, height: 1376 }, userAgent: IPAD, hasTouch: true }, false, /Get these on your iPad/, /phone|computer/],
  ['app iPhone', { viewport: { width: 390, height: 844 }, userAgent: IPHONE, hasTouch: true }, true, /Get these on your phone[\s\S]*In your phone’s Settings/, /computer|iPad/],
  ['app iPad', { viewport: { width: 1032, height: 1376 }, userAgent: IPAD, hasTouch: true }, true, /Get these on your iPad[\s\S]*In your iPad’s Settings/, /phone|computer/],
];
for (const [name, opts, native, want, notWant] of cases) {
  const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(([a, t, native]) => { localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    for (const k of Object.keys(a)) localStorage.setItem(k, a[k]);
    if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }; }, [acct, TOK, native]);
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : r.request().url().includes('/api/store') ? JSON.stringify({ data: acct }) : '{"ok":true,"data":{},"clients":[],"events":[],"items":[]}' }));
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(3000);
  await p.evaluate(() => nav('reminders'));
  await p.waitForTimeout(500);
  const card = await p.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => /^(Get these on|Notifications are on)/.test(d.textContent) && d.children.length === 0); return el ? el.parentElement.innerText : ''; });
  ok(want.test(card) && !notWant.test(card), `${name}: ${card.replace(/\s+/g, ' ').slice(0, 150)}`);
  await ctx.close();
}
await b.close();
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
