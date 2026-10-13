// "N new online bookings added to your clients" on every launch: _upsertClientsFromSquare created a
// record for a booker she had deleted/merged, _purgeRemovedClients stripped it on the next load, and
// the next launch did it again. Checks the booker is skipped, a genuinely new booker is still added,
// and an existing client is still matched rather than duplicated.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.goto('http://localhost:8899/' + FILE, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  Object.keys(CL).forEach(k => delete CL[k]);
  CL.megan = { name: 'Megan LaMantia-Bishop', squareId: 'SQMEGAN000001' };
  _deletedClientIds[_sqLocalId('SQGONE0000001')] = Date.now();
  mergedSquareIds[_sqLocalId('SQMERGED00001')] = 1;
  const toasts = []; const _t = window.proToast; window.proToast = m => toasts.push(m);
  const appts = [
    { customerId: 'SQGONE0000001', customerName: 'Deleted Person' },
    { customerId: 'SQMERGED00001', customerName: 'Merged Person' },
    { customerId: 'SQMEGAN000001', customerName: 'Megan LaMantia-Bishop' },
    { customerId: 'SQNEW00000001', customerName: 'Brand New' } ];
  const a1 = _upsertClientsFromSquare(appts);
  _purgeRemovedClients();
  const a2 = _upsertClientsFromSquare(appts);   // the next launch
  window.proToast = _t;
  const names = Object.values(CL).map(c => c.name);
  return { a1, a2, toasts, names };
});
check('first run adds only the genuinely new booker', r.a1 === 1, JSON.stringify(r));
check('second run (next launch) adds nobody', r.a2 === 0, r.a2);
check('one toast total, naming the new booker', r.toasts.length === 1 && /Brand/.test(r.toasts[0]), JSON.stringify(r.toasts));
check('deleted and merged bookers never appear', !r.names.includes('Deleted Person') && !r.names.includes('Merged Person'), JSON.stringify(r.names));
check('existing client matched, not duplicated', r.names.filter(n => /Megan/.test(n)).length === 1);
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
