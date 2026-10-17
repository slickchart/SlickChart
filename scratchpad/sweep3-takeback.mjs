// Take back a form / guide sent by mistake: provider removes it, records when, the client app hides it,
// and a later re-send shows it again. Also: the server's keep-the-last-pending-item guard is honoured.
import { mk, launch, page, boot } from './sweep3-session-lib.mjs';
import { mockApi, clientRecord, BASE as CBASE } from './sweep2-client-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
const C = { c1: { id: 'c1', name: 'Dana Client', _token: 'TOK_c1', appInvited: true } };
const P = await page(ctx, { sc_clients: JSON.stringify(C) });
await boot(P.p);
const r = await P.p.evaluate(async () => {
  const fid = Object.keys(formTmpls)[0];
  const c = CL.c1; c.pendingForms = [{ formId: fid, assignedAt: 1000 }]; saveClients();
  nav('client', 'c1'); _setClientTab('c1', 'file');
  const listed = document.getElementById('S').textContent.includes('Still open in Dana');
  window.confirmModal = (o, fn) => fn();
  const btn = [...document.querySelectorAll('#S button')].find(x => x.textContent.trim() === 'Take back');
  btn.click();
  await new Promise(r => setTimeout(r, 800));
  const blob = _assembleClientData('c1');
  const afterList = document.getElementById('S').innerText.includes('Still open in Dana');
  const out = { fid, listed, pending: (CL.c1.pendingForms || []).length, w: JSON.parse(JSON.stringify(CL.c1.withdrawn || {})), blobW: blob.withdrawn, blobPending: blob.pendingForms.length, afterList, toast: !!document.getElementById('takeback-toast') };
  _runTakeBackUndo();
  out.undoPending = (CL.c1.pendingForms || []).length; out.undoW = CL.c1.withdrawn && CL.c1.withdrawn['f:' + fid];
  return out;
});
T.check('provider: "Still open" lists the sent form', r.listed, JSON.stringify(r));
T.check('provider: Take back removes it and records when', r.pending === 0 && r.w && r.w['f:' + r.fid] > 1000 && r.blobW && r.blobPending === 0, JSON.stringify(r));
T.check('provider: Undo puts it back and clears the record', r.undoPending === 1 && !r.undoW, JSON.stringify(r));
T.check('provider: no page errors', !P.errs.length, P.errs.join(' | '));
// client: server kept the stale pending form (empty-list guard) but the blob says it was taken back
const cp = await ctx.newPage(); const cerr = []; cp.on('pageerror', e => cerr.push(e.message));
const form = { formId: 'f1', title: 'Consent', assignedAt: 1000, qs: [{ id: 'q1', label: 'Anything?', type: 'Long text' }] };
const guide = { guideId: 'g1', title: 'Aftercare', icon: '📄', tips: [], assignedAt: 1000 };
const opts = { records: { TOK: clientRecord('c1', 'Dana Client', { pendingForms: [form], pendingGuides: [guide], withdrawn: { 'f:f1': 2000, 'g:g1': 2000 } }) } };
await mockApi(cp, opts);
await cp.goto(CBASE + '?c=TOK', { waitUntil: 'load' });
await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await cp.waitForTimeout(1500);
const c1 = await cp.evaluate(() => ({ forms: (activeProvider().pendingForms || []).length, guides: _libGuides().length }));
T.check('client: taken-back form and guide are hidden', c1.forms === 0 && c1.guides === 0, JSON.stringify(c1));
opts.records.TOK = clientRecord('c1', 'Dana Client', { pendingForms: [Object.assign({}, form, { assignedAt: 3000 })], pendingGuides: [Object.assign({}, guide, { assignedAt: 3000 })], withdrawn: { 'f:f1': 2000, 'g:g1': 2000 } });
await cp.reload({ waitUntil: 'load' });
await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await cp.waitForTimeout(1500);
const c2 = await cp.evaluate(() => ({ forms: (activeProvider().pendingForms || []).length, guides: _libGuides().length }));
T.check('client: re-sent after the take back shows again', c2.forms === 1 && c2.guides === 1, JSON.stringify(c2));
T.check('client: no page errors', !cerr.length, cerr.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
