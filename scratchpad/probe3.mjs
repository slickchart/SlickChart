import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[]}' }));
const boot = async () => { await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(2800); };
await boot();
for (const scr of ['biz-info', 'business-branding']) {
  const r1 = await p.evaluate(scr => { nav(scr); const before = bizHours && bizHours.tue.open; toggleBizDay('tue');
    const save = Array.from(document.querySelectorAll('#S button')).filter(b => /save/i.test(b.textContent)).pop(); const lbl = save ? save.textContent.trim() : 'none'; if (save) save.click();
    return { before, after: bizHours.tue.open, lbl, ls: JSON.parse(localStorage.getItem('sc_availability') || 'null') }; }, scr);
  await p.waitForTimeout(800); await boot();
  const r2 = await p.evaluate(() => ({ mem: (nav('biz-info'), bizHours.tue.open), ls: (JSON.parse(localStorage.getItem('sc_availability') || 'null') || {}).tue, bridge: (SlickBridge.getAvailability() || {}).tue }));
  console.log(scr, JSON.stringify(r1).slice(0, 300), '=> after reload', JSON.stringify(r2));
}
console.log(errs); await b.close();
