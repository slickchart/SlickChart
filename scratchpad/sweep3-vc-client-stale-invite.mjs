// CLIENT APP: an invite the provider no longer has out never clears. _applyServerVcInvite returns on
// `!vi` without touching the locally saved invite (sc_client_invite), so once a device has stored an
// invite it shows "X invited you to a photo consult" forever, after the consult was submitted from
// the client's OTHER device, reviewed, or replaced. Submitting again from that device sends a second
// vc_submit, which the provider app applies as a fresh submission (replacing the first one and putting
// a reviewed consult back into Needs review).
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
const INV = { kind: 'skin', title: 'Photo consult', invitedAt: 111, photoLabels: ['Front'] };
const rec = { TOK: clientRecord('c1', 'Cara Client', { vcInvite: INV }) };
const subs = [];
await mockApi(page, { records: rec, handler: (req, p, t, J) => { if (p === '/api/client-submit') { subs.push(JSON.parse(req.postData() || '{}').kind); return J({ ok: true, id: 'ev' + subs.length }); } return null; } });
// 1) this device (her laptop) opens the link while the invite is out
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const a = await page.evaluate(() => ({ inv: !!vcInvite, saved: !!localStorage.getItem('sc_client_invite') }));
check('laptop saw the invite (setup) [inverted: SOUND=ok]', !a.inv, JSON.stringify(a));
// 2) she submits on her PHONE; the provider processes it and reviews it -> blob no longer carries an invite
rec.TOK = clientRecord('c1', 'Cara Client', { vcInvite: null });
// the app is still OPEN on the laptop (no relaunch): its refresh picks up the new blob
await page.evaluate(async () => { await _refreshProviderDataOnce(); });
await page.waitForTimeout(800);
const b = await page.evaluate(() => { nav('home'); const t = document.getElementById('S').innerText; return { inv: !!vcInvite, card: /invited you to a photo consult/i.test(t) }; });
check('laptop still shows an invite the provider no longer has out (app left open)', b.inv || b.card, JSON.stringify(b));
// 3) she taps it and submits again from the laptop
await page.evaluate(() => { nav('virtual-submit'); _vcSubmitState = { photos: { Front: { src: 'data:image/png;base64,iVBORw0KGgo=' } }, refs: {}, routine: [], flags: {}, answers: {} }; submitVirtualConsult(); });
await page.waitForTimeout(2500);
check('a second vc_submit is sent for the same, already-submitted invite', subs.length > 0, 'submits=' + JSON.stringify(subs));
check('page errors', errs.length > 0, errs.join(' | '));
await browser.close();
finish();
