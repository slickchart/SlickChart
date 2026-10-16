// sweep3 (companion to sweep3-recs-reason-lost): the same reload-order loss for a homecare line.
// sweep3: a "Why you recommend this" note is saved only into sc_workspace (_setRecReason ->
// _persistWorkspaceSoon). _reloadAll() runs loadWorkspace() and THEN loadRecReasons(), which reads
// the stale dedicated sc_rec_reasons key over it. So after any pull, on the same device and on the
// other device, the note disappears from memory, from the editor, and from the client's data.
import { FIX } from './sweep3-recs-fix.mjs';
import { results, check, sleep, makeServer, launch, device, flush, resync, report } from './sweep-dup-xdevice-lib.mjs';
const prod = { id: 'p1', name: 'Glow Serum', brand: 'Acme', icon: '🧴', custom: true, active: true, site: 'shop.example.com/serum', _ts: 1000 };
const c1 = { id: 'c1', name: 'Amber Lee', email: 'amber@example.com', phone: '', notes: [], summaries: [] };
const ws = { clientRecs: { c1: ['p1'] }, recReasons: {}, clientHomecare: { c1: ['Gentle cleanser'] }, customProducts: [prod], inOffice: { p1: false }, codes: {} };
const srv = makeServer({ sc_affiliate_links: JSON.stringify([prod]), sc_affiliate_custom: '1', sc_workspace: JSON.stringify(ws),
  sc_client_homecare: JSON.stringify({ c1: ['Gentle cleanser'] }), sc_client_recs: JSON.stringify({ c1: ['p1'] }), sc_rec_reasons: JSON.stringify({}), sc_clients: JSON.stringify({ c1 }) }, { c1 });
const b = await launch();
const A = await device(b, srv, 'A', null, FIX);
const B = await device(b, srv, 'B', null, FIX);
// The homecare plan, which the product suggestions are built from. addHomecareTag is what the
// homecare editor calls; it saves sc_workspace only.
const before = await A.evaluate(() => getClientHomecare('c1').slice());
await A.evaluate(() => addHomecareTag('c1', 'SPF 50 every morning', 'profile'));
await sleep(300); await flush(A);
check('A: homecare line in memory', await A.evaluate(() => getClientHomecare('c1').includes('SPF 50 every morning')), before);
check('server sc_workspace has it', ((JSON.parse(srv.kv.sc_workspace).clientHomecare || {}).c1 || []).includes('SPF 50 every morning'));
check('server sc_client_homecare has it', ((JSON.parse(srv.kv.sc_client_homecare || '{}') || {}).c1 || []).includes('SPF 50 every morning'), srv.kv.sc_client_homecare);
await resync(A);
check('A: homecare line survives its own resync', await A.evaluate(() => getClientHomecare('c1').includes('SPF 50 every morning')), await A.evaluate(() => clientHomecare.c1));
await resync(B);
check('B: homecare line arrives', await B.evaluate(() => getClientHomecare('c1').includes('SPF 50 every morning')), await B.evaluate(() => clientHomecare.c1));
await A.evaluate(() => { try { nav('home'); } catch (e) {} addClientProd('c1', 'p1'); persistWorkspace(); }); await sleep(300); await flush(A);
check('server sc_workspace still has the line after A navigates + edits the plan', ((JSON.parse(srv.kv.sc_workspace).clientHomecare || {}).c1 || []).includes('SPF 50 every morning'), JSON.parse(srv.kv.sc_workspace).clientHomecare);
const C = await device(b, srv, 'C', null, FIX);
check('fresh device C has the line', await C.evaluate(() => getClientHomecare('c1').includes('SPF 50 every morning')), await C.evaluate(() => clientHomecare.c1));
const bad = report(); await b.close(); process.exit(bad ? 1 : 0);
