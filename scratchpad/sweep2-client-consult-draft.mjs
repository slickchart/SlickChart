// A real client part-way through a photo consult (photos taken, goals typed) closes or refreshes the
// app. persistVcDraft() saves it to sc_vc_draft, but the REAL-client boot never calls loadInvite()/
// loadVcDraft() (only _bootSampleClient does), so vcInvite is null at boot, and _applyServerVcInvite
// treats the server's invite as NEW: it resets _vcSubmitState and persistVcDraft() deletes the draft.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const opts = { records: { TOK: clientRecord('c1', 'Cara Client', { vcInvite: { kind: 'skin', title: 'Photo consult', invitedAt: 333, photoLabels: ['Front', 'Left'] } }) } };
await mockApi(page, opts);
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real && typeof vcInvite !== 'undefined' && vcInvite, null, { timeout: 15000 });
await page.waitForTimeout(1000);
// Fill the draft through the app's own functions.
await page.evaluate(() => {
  nav('virtual-submit');
  _vcSubmitState.photos.Front = { src: 'data:image/jpeg;base64,FRONTPHOTO', ts: Date.now() };
  _vcSubmitState.goals = 'Fade the dark spots on my cheeks before my wedding';
  persistVcDraft();
});
const saved = await page.evaluate(() => localStorage.getItem('sc_vc_draft'));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real && typeof vcInvite !== 'undefined' && vcInvite, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ goals: _vcSubmitState.goals, photos: Object.keys(_vcSubmitState.photos || {}), stored: localStorage.getItem('sc_vc_draft') }));
check('draft was saved before the refresh', !saved, String(saved).slice(0, 80));
check('real client: photo-consult draft (photos + goals) is WIPED by a refresh', !after.goals && !after.photos.length, after);
await browser.close();
finish();
