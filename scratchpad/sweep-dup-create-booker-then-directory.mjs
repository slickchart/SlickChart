// A brand-new online booker: the appointments poll sees her first (Square's customer search lags the
// booking), _upsertClientsFromSquare creates her under a RANDOM id (c…) with squareId set. On a later
// poll the customer directory includes her, and _autoSyncCustomers only checks CL['sq_'+id] — not
// "any record with this squareId" — so it creates a SECOND chart. _autoMergeSquareDuplicates is not
// run by that path, so both copies stay until the next launch.
// Also checks: Settings "Sync from Square" (_syncSquareClientsNow) and Square "Import all".
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const acct = { real1: { name: 'Ashley Watson', email: 'a@x.com' } };
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
let customers = [];
const appts = [{ id: 'apNEW', customerName: 'Brand Newperson', customerId: 'NEWCUST123', customerEmail: 'brand@x.com', startAt: new Date(Date.now() + 86400000 * 3).toISOString(), status: 'ACCEPTED' }];
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(acct), sc_hide_sample: '1' } }) });
  if (u.includes('/api/square/customers')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customers }) });
  if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(12000);
const s1 = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Brand Newperson').map(k => k + ':' + CL[k].squareId));
check('booking upsert created exactly one chart for the new booker', s1.length === 1, JSON.stringify(s1));
check('...under the deterministic sq_ id (so other devices and the directory sync land on the same record)', s1.length === 1 && s1[0].startsWith('sq_'), JSON.stringify(s1));
// Square's customer directory now lists her
customers = [{ id: 'NEWCUST123', name: 'Brand Newperson', email: 'brand@x.com', phone: '' }];
await p.evaluate(async () => { _autoSyncCustomers({ force: true }); await new Promise(z => setTimeout(z, 1500)); });
const s2 = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Brand Newperson'));
check('directory auto-sync does not add a second copy of a booker it already has', s2.length === 1, JSON.stringify(s2));
// Reset to one copy, then the manual Sync button
await p.evaluate(() => { Object.keys(CL).filter(k => k.startsWith('sq_')).forEach(k => delete CL[k]); });
await p.evaluate(async () => { await _syncSquareClientsNow(); });
const s3 = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Brand Newperson'));
check('"Sync from Square" does not add a second copy', s3.length === 1, JSON.stringify(s3));
await p.evaluate(() => { Object.keys(CL).filter(k => k.startsWith('sq_')).forEach(k => delete CL[k]); window._sqCust = [{ id: 'NEWCUST123', name: 'Brand Newperson', email: 'brand@x.com' }]; _sqImportAll(); });
const s4 = await p.evaluate(() => Object.keys(CL).filter(k => CL[k].name === 'Brand Newperson'));
check('Square "Import all" does not add a second copy', s4.length === 1, JSON.stringify(s4));
await ctx.close(); await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 260) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
