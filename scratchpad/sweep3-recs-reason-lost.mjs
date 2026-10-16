// sweep3: a "Why you recommend this" note is saved only into sc_workspace (_setRecReason ->
// _persistWorkspaceSoon). _reloadAll() runs loadWorkspace() and THEN loadRecReasons(), which reads
// the stale dedicated sc_rec_reasons key over it. So after any pull, on the same device and on the
// other device, the note disappears from memory, from the editor, and from the client's data.
import { FIX } from './sweep3-recs-fix.mjs';
import { results, check, sleep, makeServer, launch, device, flush, resync, report } from './sweep-dup-xdevice-lib.mjs';
const prod = { id: 'p1', name: 'Glow Serum', brand: 'Acme', icon: '🧴', custom: true, active: true, site: 'shop.example.com/serum', _ts: 1000 };
const c1 = { id: 'c1', name: 'Amber Lee', email: 'amber@example.com', phone: '', notes: [], summaries: [] };
const ws = { clientRecs: { c1: ['p1'] }, recReasons: {}, clientHomecare: {}, customProducts: [prod], inOffice: { p1: false }, codes: {} };
const srv = makeServer({ sc_affiliate_links: JSON.stringify([prod]), sc_affiliate_custom: '1', sc_workspace: JSON.stringify(ws),
  sc_client_recs: JSON.stringify({ c1: ['p1'] }), sc_rec_reasons: JSON.stringify({}), sc_clients: JSON.stringify({ c1 }) }, { c1 });
const b = await launch();
const A = await device(b, srv, 'A', null, FIX);
const B = await device(b, srv, 'B', null, FIX);
check('A has client c1 with p1 on plan', await A.evaluate(() => !!CL.c1 && (clientRecs.c1 || []).includes('p1')));
// A: open the client's file and type the note into the real textarea (oninput -> _setRecReason).
await A.evaluate(() => { try { nav('client', 'c1'); } catch (e) {} });
await sleep(500);
const typed = await A.evaluate(() => {
  const ta = [...document.querySelectorAll('textarea')].find(t => /_setRecReason\('c1','p1'/.test(t.getAttribute('oninput') || ''));
  if (ta) { ta.value = 'Use nightly after cleansing'; ta.dispatchEvent(new Event('input')); return 'textarea'; }
  _setRecReason('c1', 'p1', 'Use nightly after cleansing'); return 'direct';
});
await sleep(900);   // past the 500ms workspace debounce
await flush(A);
check('A: note in memory right after typing (' + typed + ')', (await A.evaluate(() => _recReason('c1', 'p1'))) === 'Use nightly after cleansing');
check('server sc_workspace carries the note', (JSON.parse(srv.kv.sc_workspace).recReasons.c1 || {}).p1 === 'Use nightly after cleansing');
check('server sc_rec_reasons carries the note', ((JSON.parse(srv.kv.sc_rec_reasons || '{}') || {}).c1 || {}).p1 === 'Use nightly after cleansing', srv.kv.sc_rec_reasons);
// A comes back to the foreground: pull + _reloadAll (what _resumePull does).
await resync(A);
const aAfter = await A.evaluate(() => _recReason('c1', 'p1'));
check('A: note survives its own resync', aAfter === 'Use nightly after cleansing', JSON.stringify(aAfter));
// B resyncs and builds the client's data.
await resync(B);
const bAfter = await B.evaluate(() => _recReason('c1', 'p1'));
check('B: note arrives on the other device', bAfter === 'Use nightly after cleansing', JSON.stringify(bAfter));
const why = await B.evaluate(() => { try { return (_assembleClientData('c1').products || [])[0].why; } catch (e) { return 'ERR ' + e.message; } });
check('B: client data (what Amber sees) carries the note', why === 'Use nightly after cleansing', JSON.stringify(why));
// One more nav on A then a resync: does the stale reasons map get written back over the account?
await A.evaluate(() => { try { nav('home'); } catch (e) {} }); await sleep(300); await flush(A);
check('server sc_workspace still carries the note after A navigates', ((JSON.parse(srv.kv.sc_workspace).recReasons || {}).c1 || {}).p1 === 'Use nightly after cleansing', JSON.parse(srv.kv.sc_workspace).recReasons);
// A then reorders/edits the plan (any persistWorkspace): the account's copy of the note.
await A.evaluate(() => { addClientProd('c1', 'p1'); persistWorkspace(); }); await flush(A);
check('server sc_workspace still carries the note after A edits the plan', ((JSON.parse(srv.kv.sc_workspace).recReasons || {}).c1 || {}).p1 === 'Use nightly after cleansing', JSON.parse(srv.kv.sc_workspace).recReasons);
const C = await device(b, srv, 'C', null, FIX);
check('fresh device C shows the note', (await C.evaluate(() => _recReason('c1', 'p1'))) === 'Use nightly after cleansing');
const bad = report(); await b.close(); process.exit(bad ? 1 : 0);
