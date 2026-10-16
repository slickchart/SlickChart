// A photo consult is OUT (client is mid-way: photos in her draft). Ashley taps "Product consult" on
// the same client. Is she warned? What happens to the photos the client already took?
import { launch, provider, check, finish } from './sweep3-pc-lib.mjs';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const prov = await provider(browser);
const p = await prov.evaluate(() => {
  CL.aw = { name: 'Ashley Watson', concerns: '' };
  inviteVirtualConsult('aw', true, (_vcKindOptions()[0] || {}).id);
  const photoInv = JSON.parse(JSON.stringify(_assembleClientData('aw').vcInvite));
  document.querySelectorAll('.modal,[id$=-modal],#confirm-modal').forEach(x => x.remove());
  _productConsult('aw');
  const modal = !!document.querySelector('#confirm-modal,.confirm-modal,[id*=confirm]');
  const prodInv = JSON.parse(JSON.stringify(_assembleClientData('aw').vcInvite));
  return { photoInv, prodInv, modal, kindNow: vcInvites.aw.kind };
});
check('tapping Product consult while a photo consult is still out replaces it with NO warning', !p.modal && p.kindNow === 'product', { modal: p.modal, kind: p.kindNow });
const rec = { TOK: clientRecord('aw', 'Ashley Watson', { vcInvite: p.photoInv }) };
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await mockApi(page, { records: rec });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { _vcSubmitState.photos = { Front: { src: 'data:image/png;base64,iVBORw0KGgo=' } }; _vcSubmitState.goals = 'less redness'; persistVcDraft(); });
rec.TOK = clientRecord('aw', 'Ashley Watson', { vcInvite: p.prodInv });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const c = await page.evaluate(() => ({ kind: vcInvite && vcInvite.kind, photos: Object.keys(_vcSubmitState.photos || {}).length, goals: _vcSubmitState.goals || '', draft: localStorage.getItem('sc_vc_draft') }));
check('client: the photo + goals she already put in are silently wiped by the new product invite', c.kind === 'product' && c.photos === 0 && !c.goals, c);
await browser.close(); finish();
