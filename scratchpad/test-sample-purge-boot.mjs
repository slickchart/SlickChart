// "Remove Sample Data" then restart: real data must survive the boot-time sample purge (2026-10-15).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[]}' }));
const boot = async () => { await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(2800); };
await boot();
await p.evaluate(() => { CL.c1 = { name: 'Cooper Howard', _token: 'T' }; saveClients(); affiliateLinks.push({ id: 'p1', name: 'X', active: true }); persistAffiliateLinks(); addClientProd('c1', 'p1');
  vendors.push({ id: 'v-real', name: 'My Real Vendor' }); saveVendors(); inv.push({ id: 'i-real', name: 'My Real Stock' }); saveInv(); partners.push({ id: 'pa-real', name: 'My Real Partner' }); persistPartners();
  autos.push({ id: 'au-real', name: 'My Real Automation' }); persistAutos(); });
await p.waitForTimeout(600);
await p.evaluate(() => _clearSampleData()); await p.waitForTimeout(800);
for (const round of [1, 2]) {
  await boot();
  const s = await p.evaluate(() => ({ recs: clientRecs.c1, vendor: vendors.some(v => v.id === 'v-real'), inv: inv.some(v => v.id === 'i-real'), partner: partners.some(v => v.id === 'pa-real'), auto: autos.some(v => v.id === 'au-real'), sample: !!(CL.maya || CL.sophie || CL.priya), sampleVendor: vendors.some(v => v._sample) }));
  check('restart ' + round + ': client product picks kept', JSON.stringify(s.recs) === '["p1"]', JSON.stringify(s));
  check('restart ' + round + ': vendors, inventory, partners, automations kept', s.vendor && s.inv && s.partner && s.auto, JSON.stringify(s));
  check('restart ' + round + ': sample data still gone', !s.sample && !s.sampleVendor, JSON.stringify(s));
}
check('no page errors', !errs.length, errs.join(' | '));
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + x.detail.slice(0, 200) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
