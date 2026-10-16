// "Edit summary" seeds the SHARED product picker (clientRecs[id]) with that old summary's products.
// Leave the editor any way other than its Cancel button and the client's live plan stays replaced;
// the leftover _esOrigRecs/_esUnmatchedProducts also bleed into the next product-consult review.
import { launch, provider, check, finish } from './sweep3-pc-lib.mjs';
const browser = await launch();
const prov = await provider(browser);
const r = await prov.evaluate(async () => {
  CL.aw = { name: 'Ashley Watson', concerns: '', summaries: [] };
  CL.bb = { name: 'Bea Brown', concerns: '' };
  affiliateLinks.push({ id: 'p1', name: 'Old Toner', brand: 'X', active: true }, { id: 'p2', name: 'New Serum', brand: 'Y', active: true }, { id: 'p3', name: 'New SPF', brand: 'Z', active: true });
  clientRecs.aw = ['p2', 'p3'];
  persistClientRecs(); persistWorkspace();
  sessionSummaries.aw = [{ date: 'Sep 1', treatment: 'Facial', note: 'old visit', products: ['Old Toner', 'Some Office Mask'], ts: 1 }];
  persistSessionSummaries();
  nav('summary-history', 'aw');
  editSavedSummary('aw', 0);
  const during = clientRecs.aw.slice();
  // leave with the app's own back control
  const back = document.getElementById('topbar-back');
  const how = back ? ('topbar-back visible=' + (back.offsetParent !== null) + ' ' + (back.getAttribute('onclick')||'')) : 'nav';
  if (back) back.click(); else nav('client', 'aw');
  await new Promise(r => setTimeout(r, 400));
  const afterBack = clientRecs.aw.slice();
  try { _savePersistenceSweep(); } catch (e) {}
  await new Promise(r => setTimeout(r, 400));
  const stored = JSON.parse(localStorage.getItem('sc_client_recs') || '{}').aw;
  // product consult for ANOTHER client
  vcInvites.bb = { invited: true, submitted: true, reviewed: false, kind: 'product', title: 'Product consult', photoLabels: [] };
  vcSubmissions.bb = { photos: [], answers: [{ q: 'Q', a: 'A' }], kind: 'product', date: 'Oct 16' };
  clientRecs.bb = [];
  _vcBack = 'client'; nav('virtual-client', 'bb');
  const bbRecsText = (document.getElementById('prod-recs') || {}).innerText || '';
  return { how, during, afterBack, stored, bbRecsText, esOrig: _esOrigRecs };
});
check('client plan replaced by an old summary\'s products after leaving Edit summary without Cancel', JSON.stringify(r.afterBack) !== '["p2","p3"]', r);
check('...and that replacement is written to storage (sc_client_recs)', JSON.stringify(r.stored) !== '["p2","p3"]', r.stored);
check('another client\'s product consult review shows the first client\'s unmatched summary product', /Some Office Mask/.test(r.bbRecsText), r.bbRecsText);
check('page errors', prov._errs.length > 0, prov._errs);
await browser.close(); finish();
