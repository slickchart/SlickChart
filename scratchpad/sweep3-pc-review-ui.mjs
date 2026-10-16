// Product consult REVIEW screen: typed notes vs re-renders, top Send button, picker count, 390px layout.
import { launch, provider, check, finish } from './sweep3-pc-lib.mjs';
const browser = await launch();
const prov = await provider(browser);
await prov.evaluate(() => {
  CL.aw = { name: 'Ashley Watson', concerns: 'redness' };
  affiliateLinks.push({ id: 'p1', name: 'Avène Thermal Spring Water', brand: 'Retail', active: true, site: 'https://shop.test/a' },
                      { id: 'p2', name: 'Cicalfate+ Cream', brand: 'Retail', active: true });
  clientRecs.aw = [];
  vcInvites.aw = { invited: true, submitted: true, reviewed: false, kind: 'product', title: 'Product consult', photoLabels: [], askQuestions: ['Q1'] };
  vcSubmissions.aw = { photos: [], goals: '', answers: [{ q: 'Q1', a: 'A1' }], routine: [{ name: 'Cerave cleanser', when: 'Both', note: '' }, { name: 'Retinol serum', when: 'Night', note: 'stings' }], kind: 'product', title: 'Product consult', date: 'Oct 16' };
  _vcBack = 'client'; nav('virtual-client', 'aw');
});
await prov.fill('#vc-review-notes', 'Use the thermal water after cleansing, twice a day. Stop the retinol for two weeks.');
// tap a "Check back in" pill
await prov.evaluate(() => { const b = Array.from(document.querySelectorAll('#S button.pill')).find(x => /week|day|month/i.test(x.textContent)); b && b.click(); });
const afterFollow = await prov.evaluate(() => (document.getElementById('vc-review-notes') || {}).value || '');
check('typed review notes are wiped by tapping a "Check back in" choice', afterFollow === '', JSON.stringify(afterFollow));
await prov.fill('#vc-review-notes', 'Second draft of my notes');
await prov.evaluate(() => { const b = Array.from(document.querySelectorAll('#S button')).find(x => x.textContent.trim() === 'Stop'); b && b.click(); });
const afterVerdict = await prov.evaluate(() => (document.getElementById('vc-review-notes') || {}).value || '');
check('typed review notes are wiped by tapping Keep / Change / Stop on what they use', afterVerdict === '', JSON.stringify(afterVerdict));
// picker count vs a product she deleted from her shop
const cnt = await prov.evaluate(() => {
  addClientProd('aw', 'p1'); addClientProd('aw', 'p2');
  const i = affiliateLinks.findIndex(a => a.id === 'p2'); affiliateLinks.splice(i, 1);   // as deleteAffiliate does
  nav('virtual-client', 'aw');
  return { count: (document.getElementById('prod-count') || {}).textContent, shown: document.querySelectorAll('#prod-recs > div').length, rendered: Array.from(document.querySelectorAll('#prod-recs > div')).filter(d => d.textContent.trim()).length, names: _vcPickNames('aw') };
});
check('"Your product picks · N" counts a product she deleted (count > picks shown)', /2/.test(cnt.count || '') && cnt.rendered === 1, cnt);
// top Send review with nothing to send: does it still leave the screen?
const top = await prov.evaluate(() => {
  clientRecs.aw = []; nav('virtual-client', 'aw');
  const b = Array.from(document.querySelectorAll('#S button')).find(x => x.textContent.trim() === 'Send review');
  b.click();
  return { still: !!document.getElementById('virtual-client-screen'), title: document.getElementById('tt').textContent };
});
check('top "Send review" with nothing to send refuses but still navigates away', !top.still, top);
// 390px layout
const lay = await prov.evaluate(() => {
  nav('virtual-client', 'aw'); toggleProductPicker('aw');
  const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
  const wide = Array.from(document.querySelectorAll('#S *')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > cw + 1); }).slice(0, 5).map(e => e.tagName + '.' + (e.id || '') + ' ' + Math.round(e.getBoundingClientRect().right));
  return { sw, cw, wide };
});
check('390px: review screen overflows horizontally', lay.sw > lay.cw || lay.wide.length > 0, lay);
check('page errors', prov._errs.length > 0, prov._errs);
await browser.close(); finish();
