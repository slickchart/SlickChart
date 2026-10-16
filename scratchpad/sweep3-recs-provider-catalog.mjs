// sweep3: provider product library -> what the client gets.
//  P1. Amazon Associates tag: the recommended product carries amazonBuyUrl() (tag added), the "Shop all"
//      catalog (sc_shop_catalog, _buildShopCatalog) carries the raw a.amazon -> no tag, no commission.
//  P2. _saveShopUrl() re-points every auto Square product's Buy link but only calls persistWorkspace():
//      sc_affiliate_links and sc_shop_catalog keep the OLD link, so a reload / the client keep the old shop.
//  P3. Deleting a product from the library leaves its id on every client plan: the plan editor's count
//      says 2 while showing 1, and the first visible row gets a live "Move up" that swaps with the ghost.
//  P4. Same product from Square and added by hand: two identical entries in the client's Shop all.
//  P5. Library on/off toggle is saved without an edit stamp (_ts), unlike every other product edit.
import { results, check, sleep, makeServer, launch, device, flush, resync, report } from './sweep-dup-xdevice-lib.mjs';
const P = (o) => Object.assign({ brand: 'Acme', icon: '🧴', active: true, url: '', site: '', amazon: '', siteCode: '', urlCode: '', amazonCode: '', inOffice: false, _ts: 1000 }, o);
const links = [
  P({ id: 'p1', name: 'Glow Serum', custom: true, amazon: 'amazon.com/dp/B000TEST' }),
  P({ id: 'p2', name: 'Barrier Cream', custom: true, site: 'shop.example.com/cream' }),
  P({ id: 'p3', name: 'Old Toner', custom: true, site: 'shop.example.com/toner' }),
  P({ id: 'sq_abc123', name: 'Vitamin C Serum', source: 'square', squareId: 'ABC123', site: 'old-shop.square.site', siteAuto: true, inOffice: true, price: 48 }),
  P({ id: 'a17000', name: 'Vitamin C Serum', custom: true, url: 'brand.example.com/vitc' }),
];
const c1 = { id: 'c1', name: 'Amber Lee', email: 'amber@example.com', notes: [], summaries: [] };
const srv = makeServer({ sc_affiliate_links: JSON.stringify(links), sc_affiliate_custom: '1', sc_amazon_assoc: JSON.stringify({ tag: 'ashley-20', store: '' }),
  sc_client_recs: JSON.stringify({ c1: ['p3', 'p1', 'p2'] }), sc_clients: JSON.stringify({ c1 }), sc_bizinfo: JSON.stringify({ shopUrl: 'old-shop.square.site' }) }, { c1 });
const b = await launch();
const A = await device(b, srv, 'A');
// P1
const p1 = await A.evaluate(() => {
  const d = _assembleClientData('c1'); const rec = (d.products || []).find(x => x.name === 'Glow Serum');
  const cat = _buildShopCatalog().find(x => x.name === 'Glow Serum');
  return { rec: rec && rec.amazon, cat: cat && cat.amazon };
});
check('P1: Shop-all catalog Amazon link carries the Associates tag like the recommended one', /tag=ashley-20/.test(p1.cat || ''), p1);
// P2
await A.evaluate(() => _saveShopUrl('new-shop.square.site'));
await sleep(300); await flush(A);
const p2 = await A.evaluate(() => ({ mem: affiliateLinks.find(a => a.id === 'sq_abc123').site,
  disk: (JSON.parse(localStorage.getItem('sc_affiliate_links')).find(a => a.id === 'sq_abc123') || {}).site,
  cat: (JSON.parse(localStorage.getItem('sc_shop_catalog') || '[]').find(x => x.name === 'Vitamin C Serum' && x.inOffice) || {}).site }));
const srvSite = (JSON.parse(srv.kv.sc_affiliate_links).find(a => a.id === 'sq_abc123') || {}).site;
check('P2: new shop URL reaches sc_affiliate_links + the client catalog', p2.disk === 'new-shop.square.site' && p2.cat === 'new-shop.square.site' && srvSite === 'new-shop.square.site', Object.assign(p2, { server: srvSite }));
// P3 delete p3 from the library through the real confirm flow
await A.evaluate(() => { window.__cm = window.confirmModal; window.confirmModal = (o, fn) => fn(); deleteAffiliate(affiliateLinks.findIndex(a => a.id === 'p3')); window.confirmModal = window.__cm; });
await sleep(300);
await A.evaluate(() => { nav('client', 'c1'); });
await sleep(600);
const p3 = await A.evaluate(() => {
  const el = document.getElementById('prod-recs'); const cnt = document.getElementById('prod-count');
  const rows = el ? [...el.children].filter(x => x.querySelector && x.querySelector('[aria-label="Move up"]')) : [];
  const first = rows[0]; const up = first && first.querySelector('[aria-label="Move up"]');
  return { plan: clientRecs.c1.slice(), count: cnt && cnt.textContent, rowsShown: rows.length, firstUpEnabled: up ? !up.disabled : null };
});
check('P3: a product deleted from the library is also taken off client plans', !p3.plan.includes('p3'), p3);
check('P3: plan count matches the rows shown and the top row cannot "move up" into a ghost', p3.count === '· ' + p3.rowsShown && p3.firstUpEnabled === false, p3);
// P4
const p4 = await A.evaluate(() => _buildShopCatalog().filter(x => x.name === 'Vitamin C Serum').length);
check('P4: the same product (Square + hand-added) appears ONCE in the client Shop all', p4 === 1, 'copies=' + p4);
// P5
const p5 = await A.evaluate(() => { const i = affiliateLinks.findIndex(a => a.id === 'p2'); const before = affiliateLinks[i]._ts; affiliateLinks[i].active = !affiliateLinks[i].active; persistAffiliateLinks(); return { before, after: affiliateLinks[i]._ts }; });
check('P5 (code-read; toggle body copied from the Shop list button): on/off toggle stamps _ts', p5.after !== p5.before, p5);
const bad = report(); await b.close(); process.exit(bad ? 1 : 0);
