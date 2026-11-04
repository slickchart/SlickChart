// Product prices clients can see (Diana, 2026-11-04: "add prices to the products so my clients can
// see them before deciding to purchase"). The provider types an optional price on a product she added
// by hand; a Square product shows Square's price read-only. The client app shows the price on the
// shop card, the buy sheet and her recommended products. End to end through the real client page.
import { launch, page, mk, boot, BASE } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const links = [
  { id: 'hp1', name: 'Barrier Cream', brand: 'Glow Lab', icon: '🧴', site: 'shop.example.com/cream', active: true, custom: true, _ts: 1 },
  { id: 'hp2', name: 'Night Serum', brand: 'Glow Lab', icon: '🧪', site: 'shop.example.com/serum', active: true, custom: true, price: 55, _ts: 1 },
  { id: 'sq_abc', name: 'SPF 50', brand: 'Sun · $38', nameAuto: true, icon: '🛍️', site: 'shop.example.com', active: true, inOffice: true, source: 'square', price: 38, squareId: 'ABC' },
];
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }),
  sc_affiliate_links: JSON.stringify(links), sc_client_recs: JSON.stringify({ c1: ['hp1', 'hp2', 'sq_abc'] }) };
const P = await page(ctx, server); await boot(P.p);
await P.p.evaluate(() => { const i = affiliateLinks.findIndex(a => a.id === 'hp1'); nav('add-affiliate', i); });
const ed = await P.p.evaluate(() => ({ box: !!document.getElementById('af-price'), val: (document.getElementById('af-price') || {}).value }));
T.check('hand product: an empty, optional price box', ed.box && ed.val === '', JSON.stringify(ed));
await P.p.fill('#af-price', '$28.50');
await P.p.evaluate(() => saveAffiliate(affiliateLinks.findIndex(a => a.id === 'hp1')));
const ha1 = await P.p.evaluate(() => affiliateLinks.find(a => a.id === 'hp1'));
T.check('saved as 28.5, marked as hers', ha1.price === 28.5 && ha1.priceManual === true, JSON.stringify(ha1));
// Re-opening shows it; clearing it removes it.
await P.p.evaluate(() => nav('add-affiliate', affiliateLinks.findIndex(a => a.id === 'hp2')));
T.check('existing price shows in the box', (await P.p.inputValue('#af-price')) === '55.00');
await P.p.fill('#af-price', ''); await P.p.evaluate(() => saveAffiliate(affiliateLinks.findIndex(a => a.id === 'hp2')));
const a2 = await P.p.evaluate(() => affiliateLinks.find(a => a.id === 'hp2'));
T.check('blank clears the price', a2.price === undefined && !a2.priceManual, JSON.stringify(a2));
await P.p.evaluate(() => nav('add-affiliate', affiliateLinks.findIndex(a => a.id === 'hp2')));
await P.p.fill('#af-price', '55'); await P.p.evaluate(() => saveAffiliate(affiliateLinks.findIndex(a => a.id === 'hp2')));
// Square product: read-only, from Square; saving the editor leaves it alone.
const sq = await P.p.evaluate(() => { nav('add-affiliate', affiliateLinks.findIndex(a => a.id === 'sq_abc')); return { box: !!document.getElementById('af-price'), note: (document.getElementById('af-price-sq') || {}).innerText || '' }; });
T.check('Square product: price shown from Square, no box', !sq.box && /\$38\.00, from Square/.test(sq.note), JSON.stringify(sq));
await P.p.evaluate(() => saveAffiliate(affiliateLinks.findIndex(a => a.id === 'sq_abc')));
T.check('Square price untouched by a save', await P.p.evaluate(() => { const a = affiliateLinks.find(x => x.id === 'sq_abc'); return a.price === 38 && !a.priceManual; }));
// A Square sync with a new price updates it; a hand price on a Square item with no price survives a sync.
const sync = await P.p.evaluate(() => {
  squareCatalog.retail = [{ id: 'ABC', name: 'SPF 50', category: 'Sun', price: 40 }, { id: 'DEF', name: 'Toner', category: 'Prep', price: null }];
  _mergeSquareRetail();
  const t = affiliateLinks.find(a => a.squareId === 'DEF'); const i = affiliateLinks.indexOf(t);
  nav('add-affiliate', i); const box = !!document.getElementById('af-price'); document.getElementById('af-price').value = '22'; saveAffiliate(i);
  _mergeSquareRetail();
  return { spf: affiliateLinks.find(a => a.squareId === 'ABC').price, toner: affiliateLinks.find(a => a.squareId === 'DEF').price, box };
});
T.check('Square sync refreshes a Square price', sync.spf === 40, JSON.stringify(sync));
T.check('Square item with no price: her price box, and a sync keeps it', sync.box && sync.toner === 22, JSON.stringify(sync));
// Her own shop list shows the price.
const list = await P.p.evaluate(() => { nav('shop'); try { switchShopTab('affiliates'); } catch (e) {} return document.getElementById('S').innerText; });
T.check('her shop list shows Glow Lab · $28.50', /Glow Lab · \$28\.50/.test(list), list.slice(0, 400));
// Payloads to the client.
const cat = await P.p.evaluate(() => _buildShopCatalog());
const cA1 = cat.find(x => x.name === 'Barrier Cream');
T.check('shop catalog carries price', cA1 && cA1.price === 28.5, JSON.stringify(cA1));
await P.p.evaluate(() => { _scheduleClientSync && _scheduleClientSync(); });
await P.p.evaluate(() => { CL.c1._ts = Date.now(); try { _syncClientBlob && _syncClientBlob('c1'); } catch (e) {} });
await P.p.waitForTimeout(4000);
const posts = P.clientPosts.filter(x => x.id === 'c1');
const blob = posts.length ? posts.pop().data : null;
const bp = blob && (blob.products || []).find(x => x.name === 'Barrier Cream');
T.check('client blob: recommended product carries price', bp && bp.price === 28.5, JSON.stringify(bp || (blob && blob.products)));

// Client app
const cctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const cp = await cctx.newPage(); const cerr = []; cp.on('pageerror', e => cerr.push(e.message));
const data = Object.assign({}, blob || {}, { catalog: cat });
// Old provider build: recs without price; the client finds it in the catalog by name.
data.products = (data.products || []).map(x => { const y = Object.assign({}, x); if (y.name === 'Night Serum') delete y.price; return y; });
const rec = { ok: true, client: { id: 'c1', name: 'Cooper Howard', data } };
await cp.route('**/api/**', r => { const u = new URL(r.request().url()); const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.pathname === '/api/client-data') return J(rec); if (u.pathname === '/api/client-prefs') return J({ ok: true, prefs: {} }); return J({ ok: true, messages: [] }); });
await cp.goto(BASE + '/slickchart-client.html?c=TOK_c1'); await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await cp.waitForTimeout(1200);
const subs = await cp.evaluate(() => ['Barrier Cream', 'Night Serum', 'SPF 50'].map(n => { const p = (activeProvider().products || []).find(x => x.name === n) || (activeProvider().catalog || []).find(x => x.name === n); return p ? _prodSub(p).replace(/<[^>]+>/g, '') : null; }));
T.check('client line: Glow Lab · $28.50', subs[0] === 'Glow Lab · $28.50', JSON.stringify(subs));
T.check('client line: price found in catalog when rec has none', subs[1] === 'Glow Lab · $55', JSON.stringify(subs));
T.check('Square line shows the current price once', subs[2] === 'Sun · $40', JSON.stringify(subs));
const shopTxt = await cp.evaluate(() => { try { nav('shop'); } catch (e) { nav('products'); } return document.body.innerText; });
T.check('client shop screen shows $28.50', /\$28\.50/.test(shopTxt), shopTxt.slice(0, 500));
const sheet = await cp.evaluate(() => { const i = (_buyProducts || []).findIndex(x => x && x.name === 'Barrier Cream'); if (i < 0) return 'NO PRODUCT'; openBuyOptions(i); const e = document.getElementById('buy-sheet'); return e ? e.innerText : 'NO SHEET'; });
T.check('buy sheet shows $28.50', /Barrier Cream[\s\S]*\$28\.50[\s\S]*Where to buy/i.test(sheet), sheet.slice(-400));
// No price anywhere -> no "$" and nothing breaks.
const none = await cp.evaluate(() => _prodSub({ name: 'Plain', brand: 'Brandy' }));
T.check('no price -> brand only', none === 'Brandy', none);
await cp.screenshot({ path: process.env.SHOT || '/tmp/product-prices.png' });
T.check('no page errors', !P.errs.length && !cerr.length, P.errs.concat(cerr).join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
