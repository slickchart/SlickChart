// sweep3: the client file's product plan editor (addSummaryProd / removeSummaryProd / recMove / recDrop /
// toggleProdInOffice) saves through _rerenderRecs -> persistWorkspace() ONLY. _reloadAll() then runs
// 'workspace' (loadWorkspace) and later 'recommendations' (loadClientRecs, the dedicated sc_client_recs)
// and 'shop products' (loadAffiliateLinks), which read the OLD values back over the edit. Any pull
// before she navigates (focus, 5-minute resume, another device's change) undoes the edit.
import { FIX } from './sweep3-recs-fix.mjs';
import { results, check, sleep, makeServer, launch, device, flush, resync, report } from './sweep-dup-xdevice-lib.mjs';
const P = (o) => Object.assign({ brand: 'Acme', icon: '🧴', active: true, custom: true, url: '', site: 'shop.example.com/x', amazon: '', siteCode: '', urlCode: '', amazonCode: '', inOffice: false, _ts: 1000 }, o);
const links = [P({ id: 'p1', name: 'Glow Serum' }), P({ id: 'p2', name: 'Barrier Cream' }), P({ id: 'p3', name: 'Mineral SPF' })];
const c1 = { id: 'c1', name: 'Amber Lee', email: 'amber@example.com', notes: [], summaries: [] };
const ws = { clientRecs: { c1: ['p1', 'p2'] }, recReasons: {}, clientHomecare: {}, customProducts: links, inOffice: { p1: false, p2: false, p3: false }, codes: {} };
const srv = makeServer({ sc_affiliate_links: JSON.stringify(links), sc_affiliate_custom: '1', sc_workspace: JSON.stringify(ws),
  sc_client_recs: JSON.stringify({ c1: ['p1', 'p2'] }), sc_rec_reasons: '{}', sc_clients: JSON.stringify({ c1 }) }, { c1 });
const b = await launch();
const A = await device(b, srv, 'A', null, FIX);
const B = await device(b, srv, 'B', null, FIX);
await A.evaluate(() => { nav('client', 'c1'); });
await sleep(500);
// Her edits on the client file: take Glow Serum off, add Mineral SPF, move Mineral SPF to the top,
// and flag Barrier Cream "available in office" - each exactly what the buttons call.
const steps = await A.evaluate(() => {
  const btn = document.querySelector('[aria-label="Remove Glow Serum"]');
  if (btn) btn.click(); else removeSummaryProd('c1', 'p1');
  addSummaryProd('c1', 'p3');
  recMove('c1', 1, -1);
  toggleProdInOffice('c1', 'p2');
  return { viaButton: !!btn, plan: clientRecs.c1.slice(), inOffice: affiliateLinks.find(a => a.id === 'p2').inOffice };
});
await sleep(300); await flush(A);
check('A: edits applied in memory', JSON.stringify(steps.plan) === '["p3","p2"]' && steps.inOffice === true, steps);
check('server sc_client_recs got the plan edit', JSON.stringify(JSON.parse(srv.kv.sc_client_recs).c1) === '["p3","p2"]', srv.kv.sc_client_recs);
check('server sc_affiliate_links got the in-office flag', JSON.parse(srv.kv.sc_affiliate_links).find(a => a.id === 'p2').inOffice === true);
await resync(A);
const a2 = await A.evaluate(() => ({ plan: (clientRecs.c1 || []).slice(), inOffice: affiliateLinks.find(a => a.id === 'p2').inOffice, client: (_assembleClientData('c1').products || []).map(p => p.name) }));
check('A: plan edit survives its own next pull (Glow Serum stays removed)', JSON.stringify(a2.plan) === '["p3","p2"]', a2);
check('A: in-office flag survives its own next pull', a2.inOffice === true, a2);
await resync(B);
const b2 = await B.evaluate(() => ({ plan: (clientRecs.c1 || []).slice(), inOffice: affiliateLinks.find(a => a.id === 'p2').inOffice, client: (_assembleClientData('c1').products || []).map(p => p.name) }));
check('B: other device gets the plan edit', JSON.stringify(b2.plan) === '["p3","p2"]', b2);
check('B: what the client would be sent matches', JSON.stringify(b2.client) === '["Mineral SPF","Barrier Cream"]', b2.client);
// Then A navigates (persistence sweep writes the reverted memory) - is the edit now gone everywhere?
await A.evaluate(() => nav('home')); await sleep(300); await flush(A);
const C = await device(b, srv, 'C', null, FIX);
const c2 = await C.evaluate(() => (clientRecs.c1 || []).slice());
check('fresh device C has the edited plan', JSON.stringify(c2) === '["p3","p2"]', c2);
const bad = report(); await b.close(); process.exit(bad ? 1 : 0);
