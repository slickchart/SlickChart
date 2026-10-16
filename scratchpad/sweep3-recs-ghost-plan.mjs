// sweep3: deleteAffiliate() removes a product from the library but leaves its id on every client's plan
// (clientRecs). The client-file plan editor counts the ghost (n) so the top visible row gets an enabled
// "Move up" that swaps with the invisible ghost (tap does nothing visible), and a plan holding only
// ghosts shows neither products nor the "no products" empty state.
import { results, check, sleep, makeServer, launch, device, flush, report } from './sweep-dup-xdevice-lib.mjs';
const P = (o) => Object.assign({ brand: 'Acme', icon: '🧴', active: true, custom: true, url: '', site: 'shop.example.com/x', amazon: '', inOffice: false, _ts: 1000 }, o);
const links = [P({ id: 'p1', name: 'Old Toner' }), P({ id: 'p2', name: 'Barrier Cream' }), P({ id: 'p3', name: 'Mineral SPF' })];
const c1 = { id: 'c1', name: 'Amber Lee', email: 'a@example.com', notes: [], summaries: [] };
const c2 = { id: 'c2', name: 'Bea Roe', email: 'b@example.com', notes: [], summaries: [] };
const srv = makeServer({ sc_affiliate_links: JSON.stringify(links), sc_affiliate_custom: '1', sc_client_recs: JSON.stringify({ c1: ['p1', 'p2', 'p3'], c2: ['p1'] }), sc_clients: JSON.stringify({ c1, c2 }) }, { c1, c2 });
const b = await launch();
const A = await device(b, srv, 'A');
await A.evaluate(() => { window.confirmModal = (o, fn) => fn(); deleteAffiliate(affiliateLinks.findIndex(a => a.id === 'p1')); });
await sleep(300); await flush(A);
check('deleted product is taken off client plans', !(await A.evaluate(() => clientRecs.c1.includes('p1') || clientRecs.c2.includes('p1'))), await A.evaluate(() => clientRecs));
await A.evaluate(() => nav('client', 'c1')); await sleep(500);
const r = await A.evaluate(() => { const up = [...document.querySelectorAll('[aria-label="Move up"]')]; return { rows: up.length, firstUpDisabled: up[0] ? up[0].disabled : null }; });
check('top visible plan row has Move up disabled', r.firstUpDisabled === true, r);
const before = await A.evaluate(() => clientRecs.c1.slice());
await A.evaluate(() => document.querySelector('[aria-label="Move up"]').click()); await sleep(300);
const after = await A.evaluate(() => [...document.querySelectorAll('[aria-label^="Remove "]')].map(x => x.getAttribute('aria-label')));
check('tapping Move up on the top row changes nothing invisible', JSON.stringify(await A.evaluate(() => clientRecs.c1.slice())) === JSON.stringify(before), { before, after: await A.evaluate(() => clientRecs.c1.slice()), visible: after });
await A.evaluate(() => { nav('client', 'c2'); _setClientTab('c2', 'homecare'); }); await sleep(500);
const e = await A.evaluate(() => ({ dbg: (document.body.innerText.match(/.{0,80}product.{0,120}/gi) || []).slice(0,6), empty: /No products|Nothing recommended|recommend/i.test((document.body.innerText.match(/Recommended products[\s\S]{0,300}/i) || [''])[0]), snippet: (document.body.innerText.match(/Recommended products[\s\S]{0,200}/i) || [''])[0] }));
check('client whose only product was deleted shows the empty state', /No products/i.test(e.snippet), JSON.stringify(e));
const bad = report(); await b.close(); process.exit(bad ? 1 : 0);
