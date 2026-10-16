// sweep3: a SECOND device that is already open (booted before the edit) navigates before it next
// pulls. nav() -> _savePersistenceSweep -> persistClientHomecare pushes its whole in-memory map.
// Does that stale map overwrite the other device's homecare removal on the account?
import { makeServer, launch, device, flush, resync, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const FIX_JS = `(function(){const o=persistWorkspace;persistWorkspace=function(){const r=o.apply(this,arguments);try{persistClientHomecare();}catch(e){}return r;};})();`;
const P = process.env.FIX ? FIX_JS : null;
const C = { c1: { id: 'c1', name: 'Amber Test', email: 'a@x.com', _ts: 1 } };
const HC = { c1: ['Cleanse', 'Vitamin C', 'SPF 50'] };
const srv = makeServer({ sc_clients: JSON.stringify(C), sc_client_homecare: JSON.stringify(HC),
  sc_workspace: JSON.stringify({ clientRecs: {}, recReasons: {}, clientHomecare: HC, customProducts: [], inOffice: {}, codes: {} }) });
const b = await launch();
const phone = await device(b, srv, 'phone', null, P);
const comp = await device(b, srv, 'computer', null, P);
await phone.evaluate(() => { removeHomecareTag('c1', 1, 'profile'); });
await flush(phone);
check('account lost Vitamin C (both keys)', !/Vitamin C/.test(srv.kv.sc_client_homecare) && !/Vitamin C/.test(srv.kv.sc_workspace), [srv.kv.sc_client_homecare, srv.kv.sc_workspace]);
// computer: user taps around (nav) before any pull
await comp.evaluate(() => { try { nav('clients'); } catch (e) {} try { nav('home'); } catch (e) {} });
await sleep(800); await flush(comp);
check('computer nav did not put Vitamin C back on the account', !/Vitamin C/.test(srv.kv.sc_client_homecare) && !/Vitamin C/.test(srv.kv.sc_workspace), [srv.kv.sc_client_homecare, srv.kv.sc_workspace]);
await resync(comp);
const c2 = await comp.evaluate(() => getClientHomecare('c1').slice());
check('computer shows the removal after resync', c2.indexOf('Vitamin C') < 0, c2);
await resync(phone);
const p2 = await phone.evaluate(() => getClientHomecare('c1').slice());
check('phone still has the removal', p2.indexOf('Vitamin C') < 0, p2);
await b.close();
process.exit(report() ? 1 : 0);
