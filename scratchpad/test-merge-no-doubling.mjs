// 2026-11-17: sc_autos (rows with no id) and sc_imported_products (objects in an id-list merge)
// grew by the whole account copy on EVERY sync: Lisa's sc_autos reached 85 MB, Jennie's 17 MB, and
// another provider's imported products 21 MB, so every upload was refused as too large and the
// "photo too large" warning kept coming back. Launch a device three times against an account that
// already holds repeats; the lists must come back to their real size and stay there.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const A1 = { name: 'Birthday note', icon: '🎂', trigger: "On client's birthday", on: true, sent: 0, opened: 0 };
const A2 = { name: 'Rebook nudge', icon: '💌', trigger: '30 days after visit', on: true, sent: 0, opened: 0 };
const P1 = { id: 'ipa', name: 'Serum', brand: 'X', imported: true }, P2 = { id: 'ipb', name: 'SPF', brand: 'Y', imported: true };
const rep = (a, n) => [].concat(...Array(n).fill(a));
const srv = makeServer({
  sc_autos: JSON.stringify(rep([A1, A2], 3)),
  sc_imported_products: JSON.stringify(rep([P1, P2], 3)),
});
const b = await launch();
let seed = { sc_autos: JSON.stringify(rep([A1, A2], 4)), sc_imported_products: JSON.stringify(rep([P1, P2], 4)) };
for (let i = 1; i <= 3; i++) {
  const D = await device(b, srv, 'phone-' + i, seed);
  await flush(D); await sleep(100); await flush(D);
  const st = await D.evaluate(() => ({ autos: autos.length, la: JSON.parse(_lsGet('sc_autos') || '[]').length, ip: JSON.parse(_lsGet('sc_imported_products') || '[]').length, ipm: _importedProducts.length }));
  check(`launch ${i}: automations on the device are 2, not repeats`, st.autos === 2 && st.la === 2, st);
  check(`launch ${i}: imported products on the device are 2`, st.ip === 2 && st.ipm === 2, st);
  const sa = JSON.parse(srv.kv.sc_autos || '[]').length, sp = JSON.parse(srv.kv.sc_imported_products || '[]').length;
  check(`launch ${i}: the account copy shrank to 2 and 2`, sa === 2 && sp === 2, { sa, sp });
  seed = await D.evaluate(() => ({ sc_autos: _lsGet('sc_autos'), sc_imported_products: _lsGet('sc_imported_products') }));
  await D.close?.();
}
// A real second automation that only differs by one field is NOT dropped.
const D = await device(b, srv, 'phone-edit', seed);
await D.evaluate(() => { autos.push({ name: 'Birthday note', icon: '🎂', trigger: "On client's birthday", on: false, sent: 0, opened: 0 }); persistAutos(); });
await flush(D); await sleep(100);
check('two different automations with the same name both stay', JSON.parse(srv.kv.sc_autos).length === 3, JSON.parse(srv.kv.sc_autos).length);
await b.close();
report();
