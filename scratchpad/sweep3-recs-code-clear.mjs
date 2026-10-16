// sweep3: clearing a product's discount code on one device comes back from the other device's
// stale sc_workspace.codes (the _mergeWorkspace 'codes' union treats "only the device has it" as new).
import { results, check, sleep, makeServer, launch, device, flush, resync, report } from './sweep-dup-xdevice-lib.mjs';
const prod = { id: 'p1', name: 'Glow Serum', brand: 'Acme', icon: '🧴', custom: true, active: true, site: 'shop.example.com/serum', siteCode: 'GLOW10', url: '', urlCode: '', amazon: '', amazonCode: '', inOffice: false, _ts: 1000 };
const ws = { clientRecs: {}, recReasons: {}, clientHomecare: {}, customProducts: [prod], inOffice: { p1: false }, codes: { p1: { siteCode: 'GLOW10', urlCode: '', amazonCode: '' } } };
const srv = makeServer({ sc_affiliate_links: JSON.stringify([prod]), sc_affiliate_custom: '1', sc_workspace: JSON.stringify(ws) });
const b = await launch();
const A = await device(b, srv, 'A');
const B = await device(b, srv, 'B');
check('both devices start with GLOW10', (await A.evaluate(() => affiliateLinks.find(a => a.id === 'p1').siteCode)) === 'GLOW10' && (await B.evaluate(() => affiliateLinks.find(a => a.id === 'p1').siteCode)) === 'GLOW10');
// A: open the product editor, clear the store code, Save (the real UI path).
await A.evaluate(() => { const i = affiliateLinks.findIndex(a => a.id === 'p1'); nav('add-affiliate', i); });
await sleep(300);
await A.evaluate(() => { document.getElementById('af-site-code').value = ''; const i = affiliateLinks.findIndex(a => a.id === 'p1'); saveAffiliate(i); });
await flush(A);
check('A: code cleared locally', (await A.evaluate(() => affiliateLinks.find(a => a.id === 'p1').siteCode)) === '');
check('server sc_affiliate_links has code cleared', JSON.parse(srv.kv.sc_affiliate_links).find(a => a.id === 'p1').siteCode === '');
check('server sc_workspace.codes has no p1', !JSON.parse(srv.kv.sc_workspace).codes.p1, JSON.parse(srv.kv.sc_workspace).codes);
// B comes to the foreground and resyncs.
await resync(B);
const bCode = await B.evaluate(() => affiliateLinks.find(a => a.id === 'p1').siteCode);
check('B: cleared code stays cleared after resync', bCode === '', 'B siteCode=' + bCode);
check('server sc_workspace.codes still has no p1 after B resync', !JSON.parse(srv.kv.sc_workspace).codes.p1, JSON.parse(srv.kv.sc_workspace).codes);
await resync(A);
const aCode = await A.evaluate(() => affiliateLinks.find(a => a.id === 'p1').siteCode);
check('A: cleared code stays cleared after its next resync', aCode === '', 'A siteCode=' + aCode);
const cat = await A.evaluate(() => JSON.parse(localStorage.getItem('sc_shop_catalog') || '[]').find(x => x.name === 'Glow Serum'));
check('client Shop catalog (sc_shop_catalog) has no code', cat && !cat.siteCode, cat);
const C = await device(b, srv, 'C');
const cCode = await C.evaluate(() => affiliateLinks.find(a => a.id === 'p1').siteCode);
check('C (fresh device / relaunch): cleared code stays cleared', cCode === '', 'C siteCode=' + cCode);
const reA = await A.evaluate(async () => { location.reload(); });
await sleep(500); await A.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {}); await sleep(1500);
const aCode2 = await A.evaluate(() => affiliateLinks.find(a => a.id === 'p1').siteCode);
check('A after relaunch: cleared code stays cleared', aCode2 === '', 'A siteCode=' + aCode2);
const cat2 = await A.evaluate(() => JSON.parse(localStorage.getItem('sc_shop_catalog') || '[]').find(x => x.name === 'Glow Serum'));
check('client Shop catalog after A relaunch has no code', cat2 && !cat2.siteCode, cat2);
const bad = report(); await b.close(); process.exit(bad ? 1 : 0);
