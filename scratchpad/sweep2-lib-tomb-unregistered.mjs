// sweep2: the four delete records named in _LIB_TOMB but NOT in _TOMB_OBJ
// (sc_deleted_svc, sc_deleted_msg_tmpls, sc_deleted_starters, sc_deleted_reminders).
// (1) After deleting one row, the shrink guard refuses EVERY later upload of that library.
// (2) A stale device's plain-overwrite of the delete record resurrects the deleted row.
import { makeServer, launch, device, flush, resync, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const now = Date.now();
const rem = (id, t) => ({ id, title: t, at: now + 86400000, _ts: now - 1000 });
const svc = (id, n, p) => ({ id, name: n, price: p, _ts: now - 1000 });
const srv = makeServer({
  sc_reminders: JSON.stringify([rem('r1', 'Order retinol'), rem('r2', 'Call landlord')]),
  sc_service_menu: JSON.stringify([svc('s1', 'Facial', 90), svc('s2', 'Peel', 120)]),
  sc_service_menu_custom: '1',
});
if (+(process.env.FIX || 0) >= 2) srv.newest = { sc_deleted_svc: 1, sc_deleted_msg_tmpls: 1, sc_deleted_starters: 1, sc_deleted_reminders: 1 };
// FIX=1 applies the proposed client fix in-page; FIX=2 also server-merges every _TOMB_OBJ key.
const FIX = +(process.env.FIX || 0);
const b = await launch();
const applyFix = (p) => FIX ? p.evaluate(() => { ['sc_deleted_svc','sc_deleted_msg_tmpls','sc_deleted_starters','sc_deleted_reminders'].forEach(k => { _TOMB_OBJ[k] = 1; }); }) : null;
const A = await device(b, srv, 'A');
const B = await device(b, srv, 'B');   // second device, booted with the same account copy
await applyFix(A); await applyFix(B);

// --- control: an edit with NO delete reaches the account
await A.evaluate(() => { _remSave({ id: 'r1', title: 'Order retinol x2', at: Date.now() + 86400000 }); });
await flush(A);
check('control: plain edit reaches the account', /retinol x2/.test(srv.kv.sc_reminders || ''), srv.kv.sc_reminders);
// --- (1) delete on A, then edit another row on A
await A.evaluate(() => { _remDelete('r1'); });
await flush(A);
await A.evaluate(() => { _remSave({ id: 'r2', title: 'Call landlord TODAY', at: Date.now() + 86400000 }); });
await A.evaluate(() => { const i = _svcMenu.findIndex(x => x.id === 's1'); _svcDelDo(i); });
await flush(A);
await A.evaluate(() => { _svcMenu.forEach(x => { if (x.id === 's2') { x.price = 150; x._ts = Date.now(); } }); _saveSvcMenu(); });
await flush(A);
check('A pushed its delete record', /"r1"/.test(srv.kv.sc_deleted_reminders || ''), srv.kv.sc_deleted_reminders);
const kvRem = JSON.parse(srv.kv.sc_reminders || '[]');
const kvSvc = JSON.parse(srv.kv.sc_service_menu || '[]');
check('A: deleted reminder r1 left the account', !kvRem.some(x => x.id === 'r1'), kvRem.map(x => x.id + ':' + x.title));
check('A: edit to r2 reached the account', kvRem.some(x => x.id === 'r2' && /TODAY/.test(x.title)), kvRem.map(x => x.id + ':' + x.title));
check('A: deleted service s1 left the account', !kvSvc.some(x => x.id === 's1'), kvSvc.map(x => x.id + ':' + x.price));
check('A: price change on s2 reached the account', kvSvc.some(x => x.id === 's2' && x.price === 150), kvSvc.map(x => x.id + ':' + x.price));
const warns = await A.evaluate(() => 0);
// --- (2) stale device B (has not pulled since) deletes a different reminder -> pushes its own
// sc_deleted_reminders without r1; then a third device boots
await B.evaluate(() => { _remDelete('r2'); });
await flush(B);
check('server delete record still holds r1 after B\'s push', /"r1"/.test(srv.kv.sc_deleted_reminders || ''), srv.kv.sc_deleted_reminders);
const C = await device(b, srv, 'C');
const cRem = await C.evaluate(() => (reminders || []).map(x => x.id));
check('fresh device C does not show deleted r1', !cRem.includes('r1'), cRem);
console.log('puts of sc_reminders:', srv.puts.filter(p => p.keys.includes('sc_reminders')).map(p => p.dev));
await b.close();
process.exit(report() ? 1 : 0);
