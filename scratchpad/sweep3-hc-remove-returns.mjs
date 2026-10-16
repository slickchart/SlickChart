// sweep3: removeHomecareTag / editHomecareItem / moveHomecareItem / addHomecareTag (+ undo) only call
// persistWorkspace(); none of them writes sc_client_homecare. _reloadAll() runs loadWorkspace() and
// THEN loadClientHomecare() (the 'homecare' step), and the pull merges sc_client_homecare with the
// ACCOUNT copy winning per client. So until the next nav()/background sweep, any pull (the app's own
// _resumePull on window focus or its 5-minute timer, or another device's launch) brings back the
// stale list: removed steps return, added/edited ones vanish, and the next sweep pushes that.
// FIX=1 applies the proposed fix (dedicated key written with the workspace).
import { makeServer, launch, device, flush, resync, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const FIX_JS = `(function(){const o=persistWorkspace;persistWorkspace=function(){const r=o.apply(this,arguments);try{persistClientHomecare();}catch(e){}return r;};})();`;
const P = process.env.FIX ? FIX_JS : null;
const C = { c1: { id: 'c1', name: 'Amber Test', email: 'a@x.com', _ts: 1 } };
const HC = { c1: ['Cleanse', 'Vitamin C', 'SPF 50'] };
const srv = makeServer({ sc_clients: JSON.stringify(C), sc_client_homecare: JSON.stringify(HC),
  sc_workspace: JSON.stringify({ clientRecs: {}, recReasons: {}, clientHomecare: HC, customProducts: [], inOffice: {}, codes: {} }) });
const b = await launch();
const phone = await device(b, srv, 'phone', null, P);
await phone.evaluate(() => { nav('client', 'c1'); });
await sleep(500); await flush(phone);
const hc = () => phone.evaluate(() => getClientHomecare('c1').slice());
const rm = (txt) => phone.evaluate((t) => removeHomecareTag('c1', getClientHomecare('c1').indexOf(t), 'profile'), txt);
const resume = () => phone.evaluate(async () => { Cloud._lastPullAt = Date.now() - 60000; if (document.activeElement) document.activeElement.blur(); await _resumePull(); });
check('phone loaded the routine', (await hc()).length === 3, await hc());

// 1. Remove a step while on the client's profile; then window focus / 5-min timer (_resumePull).
await rm('Vitamin C'); await flush(phone);
check('account sc_client_homecare lost Vitamin C', !/Vitamin C/.test(srv.kv.sc_client_homecare), srv.kv.sc_client_homecare);
await resume(); await flush(phone);
check('removed step stays removed after _resumePull (focus / 5-min timer)', (await hc()).indexOf('Vitamin C') < 0, await hc());
// 2. The computer launches meanwhile.
const comp = await device(b, srv, 'computer', null, P);
const c2 = await comp.evaluate(() => getClientHomecare('c1').slice());
check('removed step stays removed on the computer', c2.indexOf('Vitamin C') < 0, c2);
// 3. Add a typed step, then _resumePull.
await phone.evaluate(() => { nav('client', 'c1'); }); await sleep(400); await flush(phone);
await phone.evaluate(() => addHomecareTag('c1', 'Hydrating mask Sundays', 'profile')); await flush(phone);
await resume(); await flush(phone);
check('added step survives _resumePull', (await hc()).indexOf('Hydrating mask Sundays') >= 0, await hc());
// 4. Edit a line in place (oninput + onblur), then _resumePull.
await phone.evaluate(() => { nav('client', 'c1'); }); await sleep(400); await flush(phone);
const first = (await hc())[0];
await phone.evaluate((f) => { editHomecareItem('c1', 0, f + ' twice'); _pushRoutine('c1'); }, first); await flush(phone);
await resume(); await flush(phone);
check('edited line survives _resumePull', (await hc())[0] === first + ' twice', await hc());
// 5. The client-facing blob the phone would push now
const blob = await phone.evaluate(() => _assembleClientData('c1').aftercare);
check('client blob matches what she sees', JSON.stringify(blob) === JSON.stringify(await hc()), blob);
await b.close();
process.exit(report() ? 1 : 0);
