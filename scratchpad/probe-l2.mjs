import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[]}' }));
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(2800);
console.log(await p.evaluate(() => { nav('add-resource'); const e = document.getElementById('res-tips'); const ps = e.previousElementSibling; return [String(_a11yPatch).includes("querySelector('input,textarea,select,button')"), ps && ps.outerHTML.slice(0, 200)]; }));
await b.close();
