// PHOTO CONSULT, cross-device delivery: what the provider set on the invite (her questions, routine off)
// must reach a REAL client, which only ever sees the invite through the client-data blob
// (_assembleClientData -> /api/client-data -> _applyServerVcInvite). The older product-consult sweep
// injected sc_client_invite straight into localStorage, so it never exercised this path.
import { launch, page as provPage, mk } from './sweep2-ui-lib.mjs';
import { mockApi, clientRecord } from './sweep2-client-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
const server = {};
const { p, errs } = await provPage(ctx, server);
await p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await p.waitForTimeout(2500);
const prov = await p.evaluate(() => {
  CL.c1 = { name: 'Cara Client', concerns: '', _token: 'TOK' };
  vcTypes.push({ id: 'my-skin', title: 'Skin check', kind: 'skin', icon: 'ti-sparkles', photoLabels: ['Front', 'Left'], askQuestions: ['How long has the redness been there?', 'What SPF do you use?'] });
  inviteVirtualConsult('c1', true, 'my-skin', undefined, false);   // routine OFF for this invite
  const inv = JSON.parse(JSON.stringify(vcInvites.c1));
  const blob = _assembleClientData('c1');
  return { inv, blobInvite: blob.vcInvite };
});
T.check('provider invite stores her questions', Array.isArray(prov.inv.askQuestions) && prov.inv.askQuestions.length === 2, JSON.stringify(prov.inv.askQuestions));
T.check('provider invite stores routine:false', prov.inv.routine === false, String(prov.inv.routine));
T.check('client-data blob vcInvite carries askQuestions', Array.isArray(prov.blobInvite && prov.blobInvite.askQuestions) && prov.blobInvite.askQuestions.length === 2, JSON.stringify(prov.blobInvite));
T.check('client-data blob vcInvite carries routine:false', prov.blobInvite && prov.blobInvite.routine === false, JSON.stringify(prov.blobInvite && prov.blobInvite.routine));

// CLIENT: real link, invite only via the blob
const cp = await ctx.newPage(); const cerr = []; cp.on('pageerror', e => cerr.push(e.message));
await mockApi(cp, { records: { TOK: clientRecord('c1', 'Cara Client', { vcInvite: prov.blobInvite }) } });
await cp.goto('http://localhost:8899/slickchart-client.html?c=TOK', { waitUntil: 'load' });
await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await cp.waitForTimeout(1500);
const cs = await cp.evaluate(() => { nav('virtual-submit'); const t = document.getElementById('S').innerText; return { boxes: document.querySelectorAll('[id^=vc-ask-]').length, routineShown: /What you use now/i.test(t), inv: JSON.parse(JSON.stringify(vcInvite || {})) }; });
T.check('client shows the provider\'s 2 questions', cs.boxes === 2, 'question boxes=' + cs.boxes + ' invite=' + JSON.stringify(cs.inv));
T.check('client hides "What you use now" when provider turned routine off', !cs.routineShown, 'routine section shown=' + cs.routineShown);
T.check('no page errors', !errs.length && !cerr.length, errs.concat(cerr).join(' | '));
await b.close();
process.exit(T.done() ? 1 : 0);
