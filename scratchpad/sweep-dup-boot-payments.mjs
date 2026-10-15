// _paySyncSquare() (Payments screen render + its 60s poll + a Square payment webhook via
// _checkSquareActivity) imports Square invoices into _payments by squareInvoiceId. It has no
// "account read yet" guard. Before the pull lands, _payments is this device's copy (empty on a new
// phone), so every Square invoice the account already records is added again under a NEW id, and
// _savePayments() pushes at once. sc_payments merges by id, so after the pull the account holds two
// records per invoice (revenue doubled); if the pull never lands, the server's LWW write leaves only
// the Square copies and her manual (cash) payments are gone from the account.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const invoices = [{ id: 'INV1', status: 'paid', total: 120, amountPaid: 120, client: 'Jane Real', createdAt: '2026-10-01T18:00:00Z', updatedAt: '2026-10-01T18:00:00Z' },
  { id: 'INV2', status: 'paid', total: 85, amountPaid: 85, client: 'Mia Real', createdAt: '2026-10-03T18:00:00Z', updatedAt: '2026-10-03T18:00:00Z' }];
const acctPayments = [
  { id: 'pay_a1', clientName: 'Jane Real', amount: 120, amountPaid: 120, status: 'paid', method: 'Square', source: 'square', squareInvoiceId: 'INV1', date: '2026-10-01', _ts: Date.now() - 86400000 },
  { id: 'pay_a2', clientName: 'Mia Real', amount: 85, amountPaid: 85, status: 'paid', method: 'Square', source: 'square', squareInvoiceId: 'INV2', date: '2026-10-03', _ts: Date.now() - 86400000 },
  { id: 'pay_cash', clientName: 'Walk In', amount: 60, status: 'paid', method: 'Cash', source: 'manual', date: '2026-10-05', _ts: Date.now() - 86400000 }];
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [label, delay, fail] of [['slow account answer (10s)', 10000, false], ['account pull fails', 1500, true]]) {
  const kv = { sc_payments: JSON.stringify(acctPayments), sc_hide_sample: '1', sc_onboarded: '1' };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') { const snap = JSON.stringify({ data: { ...kv } }); await new Promise(z => setTimeout(z, delay)); if (fail) return r.abort('connectionreset'); return r.fulfill({ status: 200, contentType: 'application/json', body: snap }); }
    if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.includes('/api/square/invoices')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invoices }) });
    if (u.includes('/api/square/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"appointments":[],"customers":[],"retail":[],"services":[]}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(3000);
  await p.evaluate(() => { try { nav('payments'); } catch (e) {} });   // she opens Payments while it loads
  await p.waitForTimeout(delay + 12000);
  const dev = await p.evaluate(() => _payments.map(x => x.squareInvoiceId || x.method));
  let acct = []; try { acct = JSON.parse(kv.sc_payments).map(x => x.squareInvoiceId || x.method); } catch (e) {}
  const perInv = id => acct.filter(x => x === id).length;
  check(label + ': each Square invoice is recorded once on the account', perInv('INV1') === 1 && perInv('INV2') === 1, 'account=' + JSON.stringify(acct) + ' device=' + JSON.stringify(dev));
  check(label + ': her manual cash payment is still on the account', acct.includes('Cash'), 'account=' + JSON.stringify(acct));
  await ctx.close();
}
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 300) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
