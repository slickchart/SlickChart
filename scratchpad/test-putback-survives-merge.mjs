// Ashley 2026-10-21: Cooper Howard put back several times, deleted again each time. A put-back copy
// sharing a Square id with a deleted canonical copy must survive the duplicate cleanup and the purge.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(2000);
const r = await page.evaluate(() => {
  const t = Date.now();
  window._rosterNotReadYet = () => false;
  CL['sq_coop'] = { id: 'sq_coop', name: 'Cooper Howard', squareId: 'COOP' };
  CL['c_hand'] = { id: 'c_hand', name: 'Cooper Howard', squareId: 'COOP', notes: 'skin notes' };
  _deletedClientIds['sq_coop'] = t - 50000; _deletedClientIds['c_hand'] = t - 50000;
  localStorage.setItem('sc_undeleted_clients', JSON.stringify({ c_hand: t - 1000 }));
  CL['sq_b'] = { id: 'sq_b', name: 'Bea Lane', squareId: 'B' }; CL['c_b'] = { id: 'c_b', name: 'Bea Lane', squareId: 'B' };
  const n = _autoMergeSquareDuplicates();
  _purgeRemovedClients();
  const gone = JSON.parse(localStorage.getItem('scl_clients_gone') || '[]');
  return { n, has: Object.keys(CL).filter(k => /coop|hand|_b|sq_b/.test(k)), ud: Object.keys(_unDeletedClientIds()), gone };
});
check('two duplicate groups merged', r.n === 2, JSON.stringify(r));
check('the put-back copy survives (with her notes)', r.has.includes('c_hand') && !r.has.includes('sq_coop'), JSON.stringify(r.has));
check('it is still a put-back after the merge', r.ud.includes('c_hand'), JSON.stringify(r.ud));
check('ordinary duplicates still keep the Square copy', r.has.includes('sq_b') && !r.has.includes('c_b'));
check('why each one left the list is recorded', r.gone.some(g => g.id === 'sq_coop' && /auto-merged into c_hand/.test(g.why)), JSON.stringify(r.gone));
const rep = await page.evaluate(() => typeof _recoverDeviceLines === 'function' ? _recoverDeviceLines({ devices: [{ report: { clientsGone: 'sq_coop|auto-merged into c_hand|' + Date.now() } }], clients: [{ id: 'sq_coop', name: 'Cooper Howard' }] }) : 'nofn');
check('founder screen names who a device took off the list', /Cooper Howard/.test(JSON.stringify(rep)), String(JSON.stringify(rep)).slice(0, 300));
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
