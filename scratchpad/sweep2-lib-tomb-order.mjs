// sweep2: _tombSet reads only the delete record ALREADY ON DISK. When the account lists the library
// before its delete record (Postgres returns kv rows unordered), a device that has not yet heard of
// a delete unions the deleted row back in and PUSHES IT BACK to the account (changed:true).
// Affects every _LIB_TOMB library plus sc_courses / sc_resources / sc_forms / sc_manual_appts.
// FIX=1 applies the proposed fix (_tombSet also reads Cloud._incoming) on device B.
import { makeServer, launch, device, flush, resync, check, report } from './sweep-dup-xdevice-lib.mjs';
const FIX = +(process.env.FIX || 0);
const now = Date.now();
const doc = (id, t) => ({ id, title: t, body: 'x', _ts: now - 1000 });
const srv = makeServer({ sc_protocols: JSON.stringify([doc('p1', 'Peel aftercare'), doc('p2', 'Dermaplane')]), sc_protocols_custom: '1' });
const b = await launch();
const A = await device(b, srv, 'A');
const B = await device(b, srv, 'B');
if (FIX) await B.evaluate(() => {
  const orig = _tombSet;
  window._tombSet = function (keys) {
    const out = orig(keys);
    [].concat(keys || []).forEach(function (tk) {
      try { const inc = (typeof Cloud !== 'undefined' && Cloud && Cloud._incoming) ? Cloud._incoming[tk] : null; const v = JSON.parse(inc || 'null');
        if (Array.isArray(v)) v.forEach(function (x) { if (x != null) out[String(x)] = 1; });
        else if (v && typeof v === 'object') Object.keys(v).forEach(function (x) { out[x] = 1; }); } catch (e) {}
    });
    return out;
  };
});
// A deletes p1 the way the Protocols screen does: record + save.
await A.evaluate(() => { const L = JSON.parse(localStorage.getItem('sc_protocols')); const g = L.find(x => x.id === 'p1'); _libForget('sc_protocols', g);
  const v = JSON.stringify(L.filter(x => x.id !== 'p1')); localStorage.setItem('sc_protocols', v); _pushKeyNow('sc_protocols', v); });
await flush(A);
console.log('server key order:', Object.keys(srv.kv).join(','));
check('A: p1 gone from the account', !/"p1"/.test(srv.kv.sc_protocols), srv.kv.sc_protocols);
await resync(B);
const bList = await B.evaluate(() => JSON.parse(localStorage.getItem('sc_protocols') || '[]').map(x => x.id));
check('B after one pull does not hold p1', !bList.includes('p1'), bList);
check('account still has no p1 after B\'s pull', !/"p1"/.test(srv.kv.sc_protocols), srv.kv.sc_protocols);
await b.close();
process.exit(report() ? 1 : 0);
