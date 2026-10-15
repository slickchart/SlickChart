// sweep2: libraries whose EDITS carry no _ts. _mergeAuthoredById falls back to "server copy wins"
// when neither side is stamped, so a computer left open (it never re-pulls after boot) that saves
// anything in the same library puts its OLD copy of every other row on the account, and the phone's
// next launch takes that old copy over its own newer edit. Shown with payments (mark paid) and
// inventory (stock count) — both money/stock records.
// FIX=1 stamps _ts on the edits the way the proposed fix does.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const FIX = +(process.env.FIX || 0);
const srv = makeServer({
  sc_payments: JSON.stringify([{ id: 'pay_inv1', clientId: 'c1', amount: 120, status: 'unpaid', note: 'Peel', date: '2026-10-10' }]),
  sc_inventory: JSON.stringify([{ name: 'Retinol serum', sku: 'R1', qty: 10 }, { name: 'Gauze', sku: 'G1', qty: 50 }]),
});
const b = await launch();
const phone = await device(b, srv, 'phone');
console.log('kv inv after phone boot:', srv.kv.sc_inventory, srv.puts.map(p => p.dev + ':' + p.keys.join('+')).join(' | '));
const comp = await device(b, srv, 'computer');
console.log('kv inv after comp boot:', srv.kv.sc_inventory);
console.log('phone inv:', await phone.evaluate(() => JSON.stringify(inv)));
await phone.evaluate((FIX) => { _payMarkPaid('pay_inv1'); if (FIX) { _payments[0]._ts = Date.now(); _savePayments(); } }, FIX);
console.log('phone inv after pay:', await phone.evaluate(() => JSON.stringify(inv)));
await phone.evaluate((FIX) => { const it = inv.find(x => x.sku === 'R1'); it.qty = 4; if (FIX) it._ts = Date.now(); saveInv(); }, FIX);
await flush(phone);
check('account: invoice paid', /"paid"/.test(srv.kv.sc_payments), srv.kv.sc_payments);
// the computer, open since this morning, records an unrelated cash payment and a gauze count
console.log('comp inv:', await comp.evaluate(() => JSON.stringify(inv)), await comp.evaluate(() => localStorage.getItem('sc_inventory')));
await comp.evaluate((FIX) => { _addPayment({ clientId: 'c2', amount: 60, status: 'paid', note: 'Brow', date: '2026-10-15', _ts: FIX ? Date.now() : undefined });
  const g = inv.find(x => x.sku === 'G1'); g.qty = 45; if (FIX) g._ts = Date.now(); saveInv(); }, FIX);
await flush(comp);
await sleep(300);
// the phone relaunches
const phone2 = await device(b, srv, 'phone-relaunch', await phone.evaluate(() => ({ sc_payments: localStorage.getItem('sc_payments'), sc_inventory: localStorage.getItem('sc_inventory') })));
const st = await phone2.evaluate(() => (_payments.find(x => x.id === 'pay_inv1') || {}).status);
const q = await phone2.evaluate(() => (inv.find(x => x.sku === 'R1') || {}).qty);
check('phone after relaunch: invoice still paid', st === 'paid', st);
check('phone after relaunch: retinol count still 4', q === 4, q);
check('account: invoice paid at the end', /pay_inv1[^}]*"paid"/.test(srv.kv.sc_payments), srv.kv.sc_payments);
await b.close();
process.exit(report() ? 1 : 0);
