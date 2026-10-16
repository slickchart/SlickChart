// A product consult reaches a REAL client (own phone) only through the synced client-data blob
// (_assembleClientData -> vcInvite). Does that invite carry the questions she chose?
import { launch, provider, check, finish } from './sweep3-pc-lib.mjs';
import { mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const prov = await provider(browser);
const out = await prov.evaluate(() => {
  CL.aw = { name: 'Ashley Watson', concerns: '' };
  _productConsult('aw');
  const local = JSON.parse(JSON.stringify(vcInvites.aw));
  const blob = _assembleClientData('aw');
  return { localQs: local.askQuestions, blobInvite: blob.vcInvite };
});
check('provider invite object carries the product questions (local)', !(Array.isArray(out.localQs) && out.localQs.length === 8), out.localQs && out.localQs.length);
check('client-data vcInvite (the cross-device path) DROPS askQuestions', !(out.blobInvite && Array.isArray(out.blobInvite.askQuestions) && out.blobInvite.askQuestions.length), out.blobInvite);
// Feed that exact blob to the client app the way api/client-data serves it.
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e.message || e)));
await mockApi(page, { records: { TOK: clientRecord('aw', 'Ashley Watson', { vcInvite: out.blobInvite }) } });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const cl = await page.evaluate(() => { nav('virtual-submit'); return { boxes: document.querySelectorAll('[id^=vc-ask-]').length, title: document.getElementById('tt').textContent, txt: document.getElementById('S').innerText.slice(0, 500) }; });
check('client on her own phone sees ZERO of the 8 product questions', cl.boxes === 0, cl);
check('no page errors', errs.length + prov._errs.length > 0, errs.concat(prov._errs));
await browser.close(); finish();
