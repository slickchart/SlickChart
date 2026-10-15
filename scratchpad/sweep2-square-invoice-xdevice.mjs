// SWEEP 2 / payments: one Square invoice, two devices -> two payment records (revenue doubled).
//
//   node scratchpad/sweep2-square-invoice-xdevice.mjs
//
// _paySyncSquare() adds a Square invoice it has not seen as a NEW payment with a random id
// (_addPayment -> 'pay_'+random). sc_payments merges by id (_mergeAuthoredById). So when her phone and
// her computer both sync the same new invoice before either has pulled the other's copy (Payments open
// on both: 60s poll; or a payment webhook toast on both), the account ends up with two records
// for INV9 under two ids, and the union keeps both forever. Nothing after that dedupes by
// squareInvoiceId: _paySyncSquare uses .find() and updates only the first.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ n, pass: !!p, d: d || '' });
const kv = { sc_hide_sample: '1', sc_onboarded: '1', sc_payments: JSON.stringify([{ id: 'pay_cash', clientName: 'Walk In', amount: 60, status: 'paid', method: 'Cash', source: 'manual', date: '2026-10-05', _ts: 1 }]) };
let invoices = [];
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function device() {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...kv } }) });
    if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(kv, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.includes('/api/square/invoices')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invoices }) });
    if (u.includes('/api/square/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"appointments":[],"customers":[],"orders":[],"services":[]}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  return p;
}
const phone = await device(); const laptop = await device();
// A client pays INV9 in Square. Both devices sync it before either hears from the other.
invoices = [{ id: 'INV9', status: 'paid', total: 150, amountPaid: 150, client: 'Jane Real', createdAt: '2026-10-14T18:00:00Z', updatedAt: '2026-10-14T18:05:00Z' }];
await phone.evaluate(() => _paySyncSquare(false));
await laptop.evaluate(() => _paySyncSquare(false));
await phone.waitForTimeout(1500);
// Each device now pulls the account (its normal poll), and merges.
await phone.evaluate(() => Cloud.pull && Cloud.pull());
await laptop.evaluate(() => Cloud.pull && Cloud.pull());
await phone.waitForTimeout(2500);
const count = arr => arr.filter(x => x === 'INV9').length;
const onPhone = await phone.evaluate(() => _payments.map(x => x.squareInvoiceId || x.method));
const onLaptop = await laptop.evaluate(() => _payments.map(x => x.squareInvoiceId || x.method));
let acct = []; try { acct = JSON.parse(kv.sc_payments).map(x => x.squareInvoiceId || x.method); } catch (e) {}
check('phone shows INV9 once', count(onPhone) === 1, JSON.stringify(onPhone));
check('laptop shows INV9 once', count(onLaptop) === 1, JSON.stringify(onLaptop));
check('account holds INV9 once', count(acct) === 1, JSON.stringify(acct));
// A third device (or either one after its next boot) reads the account.
const tablet = await device();
const onTablet = await tablet.evaluate(() => _payments.filter(x => x.squareInvoiceId === 'INV9').length);
check('a freshly opened device shows INV9 once', onTablet === 1, 'INV9 records on new device: ' + onTablet);
await phone.evaluate(() => Cloud.pull && Cloud.pull()); await phone.waitForTimeout(2500);
const phone2 = await phone.evaluate(() => _payments.filter(x => x.squareInvoiceId === 'INV9').length);
check('phone after a second pull shows INV9 once', phone2 === 1, 'INV9 records: ' + phone2);
// And a later sync does not repair it.
await phone.evaluate(() => { _paySyncSquare._lastAuto = 0; return _paySyncSquare(false); });
const after = await phone.evaluate(() => _payments.filter(x => x.squareInvoiceId === 'INV9').length);
check('a later sync collapses the copies', after === 1, 'INV9 records on phone after another sync: ' + after);
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'SOUND        ' : 'CONFIRMED-BUG') + '  ' + x.n + '  — ' + x.d); }
console.log(`\n${results.length - bad}/${results.length} sound`); process.exit(bad ? 1 : 0);
