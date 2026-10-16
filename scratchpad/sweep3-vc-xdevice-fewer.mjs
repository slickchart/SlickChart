// PHOTO CONSULT, cross-device: a NEWER submission with FEWER photos than the one a device already holds
// (a retake of 2 shots after "Can't read these", a second consult of a type with fewer labels, or a
// product consult after a photo consult) never replaces the old one on the other device, because
// _hydrateVcSubs refuses "a copy with fewer photos". The laptop then shows the OLD photos/answers under a
// "Needs review" state that belongs to the NEW one, and its next persistVcState() pushes the old consult
// back over the account, after which the phone's pull replaces the NEW consult with the OLD one too.
import { launch, page as provPage, mk } from './sweep2-ui-lib.mjs';
const T = mk();
const px = n => 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(n);   // distinct strings, valid prefix
const OLD = { photos: [{ label: 'Front', src: px(1) }, { label: 'Left', src: px(2) }, { label: 'Right', src: px(3) }], refs: null, goals: 'OLD consult: acne', answers: [], date: 'Sep 1', kind: 'skin', title: 'Photo consult' };
const server = {
  sc_clients: JSON.stringify({ c1: { name: 'Cara Client', treatment: 'Facial', _uAt: 1, _token: 'TOK' } }),
  sc_pro_vc_subs: JSON.stringify({ c1: OLD }),
  sc_pro_vc_invites: JSON.stringify({ c1: { invited: true, submitted: true, reviewed: true, invitedAt: 1000, kind: 'skin', title: 'Photo consult', photoLabels: ['Front', 'Left', 'Right'], ts: 1000 } })
};
const NEWEV = { id: 'ev_new', client_id: 'c1', kind: 'vc_submit', created_at: new Date().toISOString(),
  payload: { kind: 'skin', title: 'Photo consult', photos: [{ label: 'Front', src: px(10) }, { label: 'Left', src: px(11) }], goals: 'NEW consult: redness after retake', answers: [], date: 'Oct 16' } };
let phoneEvents = false;
const handler = async (r, u) => { if (u.includes('/api/clients') && r.request().method() === 'GET' && phoneEvents) { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [{ id: 'c1', name: 'Cara Client', token: 'TOK' }], events: [NEWEV] }) }); return true; } return false; };
const { b, ctx } = await launch();
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 800 } });
const laptop = await provPage(ctx2, server, { handler });
await laptop.p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await laptop.p.waitForTimeout(3000);
const l0 = await laptop.p.evaluate(() => ({ goals: (vcSubmissions.c1 || {}).goals, n: ((vcSubmissions.c1 || {}).photos || []).length }));
T.check('laptop boots with the old consult', /OLD/.test(l0.goals || ''), JSON.stringify(l0));

// phone opens and receives the NEW (2-photo) submission from the event log
const phone = await provPage(ctx, server, { handler });
phoneEvents = true;
await phone.p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await phone.p.waitForTimeout(3000);
await phone.p.evaluate(async () => { try { await syncClientEvents(); } catch (e) {} });
await phone.p.waitForTimeout(2500);
phoneEvents = false;
// Work around the separate '' wipe (sweep3-vc-subs-wiped.mjs): any later consult edit on the phone
// re-pushes the real value, so do one, and isolate the fewer-photos rule.
await phone.p.evaluate(() => { persistVcState(); });
await phone.p.waitForTimeout(2000);
// Work around the separate '' wipe (sweep3-vc-subs-wiped.mjs): any later consult edit on the phone
// re-pushes the real value, so do one, and isolate the fewer-photos rule.
await phone.p.evaluate(() => { persistVcState(); });
await phone.p.waitForTimeout(2000);
const ph = await phone.p.evaluate(() => ({ goals: (vcSubmissions.c1 || {}).goals, status: _vcStatus('c1') }));
T.check('phone has the NEW consult, needs review', /NEW/.test(ph.goals || '') && ph.status === 'needs-review', JSON.stringify(ph));
const acct1 = JSON.parse(server.sc_pro_vc_subs || '{}').c1 || {};
T.check('account holds the NEW consult after the phone', /NEW/.test(acct1.goals || ''), acct1.goals);

// laptop re-reads the account (resume pull)
await laptop.p.evaluate(async () => { try { await Cloud.pull(); } catch (e) {} try { _reloadAll(); } catch (e) {} });
await laptop.p.waitForTimeout(1500);
const l1 = await laptop.p.evaluate(() => ({ goals: (vcSubmissions.c1 || {}).goals, n: ((vcSubmissions.c1 || {}).photos || []).length, status: _vcStatus('c1') }));
T.check('laptop shows the NEW consult after pulling', /NEW/.test(l1.goals || ''), JSON.stringify(l1));

// laptop does anything that persists consult state (e.g. sets a follow-up on another client's consult)
await laptop.p.evaluate(() => { CL.c2 = { name: 'Other' }; vcInvites.c2 = { invited: true, invitedAt: Date.now(), kind: 'skin', photoLabels: ['Front'] }; persistVcState(); });
await laptop.p.waitForTimeout(2000);
const acct2 = JSON.parse(server.sc_pro_vc_subs || '{}').c1 || {};
T.check('account still holds the NEW consult after a laptop save', /NEW/.test(acct2.goals || ''), acct2.goals);
await phone.p.evaluate(async () => { try { await Cloud.pull(); } catch (e) {} });
await phone.p.waitForTimeout(1500);
const ph2 = await phone.p.evaluate(() => ({ goals: (vcSubmissions.c1 || {}).goals }));
T.check('phone still has the NEW consult after its next pull', /NEW/.test(ph2.goals || ''), JSON.stringify(ph2));
T.check('no page errors', !laptop.errs.length && !phone.errs.length, laptop.errs.concat(phone.errs).join(' | '));
await b.close();
process.exit(T.done() ? 1 : 0);
