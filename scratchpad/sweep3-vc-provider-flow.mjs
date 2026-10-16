// PROVIDER side of the photo consult: review screen + retake + re-invite edge cases.
import { launch, page as provPage, mk } from './sweep2-ui-lib.mjs';
const T = mk();
const px = n => 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(n);
let events = [];
const handler = async (r, u) => { if (u.includes('/api/clients') && r.request().method() === 'GET') { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [{ id: 'c1', name: 'Cara Client', token: 'T1' }], events: events.slice().reverse() }) }); return true; } if (u.includes('/api/ai')) { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '{"metrics":[{"label":"Redness","value":"Mild","detail":"cheeks"}],"summary":"Mild redness"}' }) }); return true; } return false; };
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cara Client', _uAt: 1, _token: 'T1', concerns: 'redness' } }) };
const { b, ctx } = await launch();
const P = await provPage(ctx, server, { handler });
await P.p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await P.p.waitForTimeout(3000);

// A) Notes she is typing are wiped by tapping a follow-up pill or a Keep/Change/Stop verdict
const a = await P.p.evaluate(async () => {
  vcInvites.c1 = { invited: true, submitted: true, reviewed: false, invitedAt: 100, kind: 'skin', title: 'Photo consult', photoLabels: ['Front', 'Left', 'Right'] };
  vcSubmissions.c1 = { photos: [{ label: 'Front', src: 'data:image/png;base64,iVBORw0KGgoAAA' }, { label: 'Left', src: 'data:image/png;base64,iVBORw0KGgoAAB' }, { label: 'Right', src: 'data:image/png;base64,iVBORw0KGgoAAC' }], goals: 'less redness', date: 'Oct 1', kind: 'skin', title: 'Photo consult', routine: [{ name: 'Cleanser', when: 'AM' }] };
  _vcBack = 'client'; nav('virtual-client', 'c1');
  await new Promise(r => setTimeout(r, 300));
  const ta = document.getElementById('vc-review-notes'); ta.value = 'Long expert notes I typed for ten minutes';
  const pill = Array.from(document.querySelectorAll('#S button')).find(x => /6 weeks/.test(x.textContent)); if (pill) pill.click();
  const afterPill = (document.getElementById('vc-review-notes') || {}).value;
  document.getElementById('vc-review-notes').value = 'Notes again';
  const keep = Array.from(document.querySelectorAll('#S button')).find(x => x.textContent.trim() === 'Keep'); if (keep) keep.click();
  const afterVerdict = (document.getElementById('vc-review-notes') || {}).value;
  return { pill: !!pill, afterPill, keep: !!keep, afterVerdict };
});
T.check('typed review notes survive tapping a follow-up date', a.afterPill === 'Long expert notes I typed for ten minutes', JSON.stringify(a));
T.check('typed review notes survive tapping Keep/Change/Stop', a.afterVerdict === 'Notes again', JSON.stringify(a));

// B) top "Send review" with empty notes navigates away anyway (only a toast says why)
const bb = await P.p.evaluate(async () => {
  nav('virtual-client', 'c1'); await new Promise(r => setTimeout(r, 200));
  document.getElementById('vc-review-notes').value = '';
  const top = Array.from(document.querySelectorAll('#S button')).find(x => x.textContent.trim() === 'Send review');
  top.click(); await new Promise(r => setTimeout(r, 200));
  return { stillOnReview: !!document.getElementById('virtual-client-screen'), status: _vcStatus('c1') };
});
T.check('top "Send review" with no notes keeps her on the review screen', bb.stillOnReview, JSON.stringify(bb));

// C) "Ask for new photos" says everything they sent is kept; the retake replaces it
events = [{ id: 'ev_retake', client_id: 'c1', kind: 'vc_submit', created_at: new Date(Date.now() + 1000).toISOString(), payload: { kind: 'skin', title: 'Photo consult', photos: [{ label: 'Front', src: px(40) }], goals: '', date: 'Oct 2' } }];
const c = await P.p.evaluate(async () => {
  await vcAskForRetake('c1');
  await new Promise(r => setTimeout(r, 300));
  await syncClientEvents();
  const s = vcSubmissions.c1 || {};
  return { n: (s.photos || []).length, goals: s.goals, routine: (s.routine || []).length, status: _vcStatus('c1') };
});
T.check('retake keeps the first set of photos (as the confirm promises)', c.n >= 3, JSON.stringify(c));
T.check('retake keeps her goals / routine from the first submission', c.goals === 'less redness' && c.routine === 1, JSON.stringify(c));

// D) a submission for an OLDER invite lands on a NEWER one (no invitedAt in the payload)
events = [];
const d = await P.p.evaluate(async () => {
  // she reviewed, then sends a NEW consult invite (a different type) ...
  vcInvites.c1 = { ...vcInvites.c1, reviewed: true, submitted: true };
  inviteVirtualConsult('c1', true, (_vcKindOptions().find(o => o.kind === 'product') || _vcKindOptions()[0]).id);
  const newInv = JSON.parse(JSON.stringify(vcInvites.c1));
  return newInv;
});
// ... and the client's late retry of the OLD consult (photo) is processed after the new invite went out
events = [{ id: 'ev_late', client_id: 'c1', kind: 'vc_submit', created_at: new Date(d.invitedAt - 60000).toISOString(), payload: { kind: 'skin', title: 'Photo consult', photos: [{ label: 'Front', src: px(41) }], goals: 'late old one', date: 'Oct 2' } }];
const d2 = await P.p.evaluate(async () => { await syncClientEvents(); const blob = _assembleClientData('c1'); return { status: _vcStatus('c1'), kind: vcInvites.c1.kind, subKind: (vcSubmissions.c1 || {}).kind, blobInvite: blob.vcInvite }; });
T.check('a submission made BEFORE the new invite does not close the new invite', d2.status === 'awaiting' && !!d2.blobInvite, JSON.stringify(d2));

// E) re-inviting hides the routine review the client already received
const e = await P.p.evaluate(() => {
  vcInvites.c1 = { invited: true, submitted: true, reviewed: true, invitedAt: 200, kind: 'skin', photoLabels: ['Front'] };
  vcSubmissions.c1 = { photos: [{ label: 'Front', src: 'data:image/png;base64,iVBORw0KGgoQQ' }], date: 'Oct 1', kind: 'skin', routine: [{ name: 'Cleanser', verdict: 'keep', feedback: 'good' }] };
  const before = !!_assembleClientData('c1').routineReview;
  inviteVirtualConsult('c1', true, _vcKindOptions()[0].id);
  const after = !!_assembleClientData('c1').routineReview;
  return { before, after };
});
T.check('client keeps her routine review when a new consult is sent', !e.before || e.after, JSON.stringify(e));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close();
process.exit(T.done() ? 1 : 0);
