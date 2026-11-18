// 2026-11-18: the account refuses a save over its size limit (413). Before, the app dropped that
// value and showed "A photo was too large" on every launch, even when the value was only big because
// the same rows were in it hundreds of times (sc_autos at 85 MB). Now a value made of repeats is
// shrunk to one of each and saved; a value that is genuinely big still warns, without blaming a photo.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const srv = makeServer({});
srv.maxBody = 200000;
const b = await launch();
const D = await device(b, srv, 'phone', {});
await flush(D); await sleep(300);
await D.evaluate(() => { window._toasts = []; const o = window.proToast; window.proToast = function (m) { window._toasts.push(String(m)); try { return o && o.apply(this, arguments); } catch (e) {} }; });
// 1. a list that is only big because of repeats
await D.evaluate(() => { const row = { name: 'Gauze', sku: 'G1', qty: 50, note: 'x'.repeat(200) }, row2 = { name: 'Retinol', sku: 'R1', qty: 3 };
  const a = []; for (let i = 0; i < 1500; i++) { a.push(row, row2); } localStorage.setItem('sc_inventory', JSON.stringify(a)); });
for (let i = 0; i < 6; i++) { await flush(D); await sleep(1200); }
const acct = JSON.parse(srv.kv.sc_inventory || '[]');
check('repeats: the account gets the 2 real rows', acct.length === 2, acct.length);
const loc = await D.evaluate(() => JSON.parse(_lsGet('sc_inventory') || '[]').length);
check('repeats: the device keeps the 2 real rows', loc === 2, loc);
let t = await D.evaluate(() => window._toasts.filter(m => /too large/i.test(m)));
check('repeats: no warning shown', t.length === 0, t);
// 2. a value that is genuinely too big (no repeats) still warns once, and never blames a photo
await D.evaluate(() => { const a = []; for (let i = 0; i < 3000; i++) a.push({ id: 'v' + i, name: 'Vendor ' + i, note: 'y'.repeat(100) }); localStorage.setItem('sc_vendors', JSON.stringify(a)); });
for (let i = 0; i < 6; i++) { await flush(D); await sleep(1200); }
t = await D.evaluate(() => window._toasts.filter(m => /too large/i.test(m)));
check('genuinely big: warned once', t.length === 1, t);
check('genuinely big: the warning does not say photo', t.every(m => !/photo/i.test(m)), t);
const lv = await D.evaluate(() => JSON.parse(_lsGet('sc_vendors') || '[]').length);
check('genuinely big: still all on the device', lv === 3000, lv);
check('no page errors', D._errs.length === 0, D._errs);
await b.close();
report();
