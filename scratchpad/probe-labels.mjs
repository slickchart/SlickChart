import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[]}' }));
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(2800);
for (const s of ['new-client', 'new-protocol', 'add-vendor', 'add-partner', 'add-resource', 'messages']) {
  await p.evaluate(s => nav(s), s); await p.waitForTimeout(100);
  const r = await p.evaluate(() => Array.from(document.querySelectorAll('#S input:not([type=hidden]):not([type=checkbox]):not([type=radio]),#S textarea')).map(e => (e.id || e.tagName) + '=' + (e.getAttribute('aria-label') || (e.closest('label') ? '[label]' : 'NONE'))));
  console.log(s.padEnd(13), r.join(' | ').slice(0, 300));
}
await b.close();
