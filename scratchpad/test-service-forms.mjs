// Forms tied to a service (Maddie, Feedback 2026-10-30: "how do I attach certain forms to certain
// appointment types? ... if a client is booked for a chemical Peel, how can I send them my custom chem
// peel form?"). Builds the form in the real editor, books clients, and checks what each client gets.
import { mk, launch, page, boot } from './sweep3-session-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
const day = n => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };
const C = { c1: { id: 'c1', name: 'Pia Peel', _token: 'TOK_c1', appInvited: true }, c2: { id: 'c2', name: 'Fran Facial', _token: 'TOK_c2', appInvited: true },
  c3: { id: 'c3', name: 'Lou Later', _token: 'TOK_c3', appInvited: true }, c4: { id: 'c4', name: 'Rita Recent', _token: 'TOK_c4', appInvited: true },
  c5: { id: 'c5', name: 'Nia NoApp', _token: 'TOK_c5' }, c6: { id: 'c6', name: 'Sam Square', _token: 'TOK_c6', appInvited: true, squareId: 'SQ6' } };
const server = { sc_clients: JSON.stringify(C), sc_professions: JSON.stringify(['esty']), sc_service_menu: JSON.stringify([{ id: 's1', name: 'Chemical Peel', price: 120 }, { id: 's2', name: 'Signature Facial', price: 90 }]) };
const P = await page(ctx, server);
await boot(P.p);
await P.p.waitForTimeout(2000);
const r = await P.p.evaluate(async (D) => {
  const out = {};
  // 1. build "My chem peel form" in the editor and tie it to Chemical Peel
  nav('form-builder', 'new'); await new Promise(r => setTimeout(r, 200));
  out.hasCard = !!document.getElementById('fb-svc-card') && /Send when booked for/.test(document.getElementById('fb-svc-card').textContent);
  out.pickerHas = [...document.querySelectorAll('#fb-svc-pick option')].map(o => o.textContent);
  document.getElementById('form-name-input').value = 'My chem peel form';
  addFormQ(); const q = document.querySelector('#qlist .qrow:last-child .q-label'); q.value = 'Any retinol in the last 7 days?';
  const sel = document.getElementById('fb-svc-pick'); sel.value = 'Chemical Peel'; sel.dispatchEvent(new Event('change'));
  out.chips = document.getElementById('fb-svc-card').textContent;
  saveFormBuilder('new');
  const fid = Object.keys(formTmpls).find(k => formTmpls[k] && formTmpls[k].name === 'My chem peel form');
  out.fid = fid; out.services = fid && formTmpls[fid].services;
  // 2. bookings
  manualAppts.push({ id: 'm1', date: D.d2, time: '10:00 AM', client: 'Pia Peel', clientId: 'c1', tx: 'Chemical Peel - 60 min' });
  manualAppts.push({ id: 'm2', date: D.d2, time: '11:00 AM', client: 'Fran Facial', clientId: 'c2', tx: 'Signature Facial' });
  manualAppts.push({ id: 'm3', date: D.d30, time: '10:00 AM', client: 'Lou Later', clientId: 'c3', tx: 'Chemical Peel' });
  manualAppts.push({ id: 'm4', date: D.d3, time: '10:00 AM', client: 'Rita Recent', clientId: 'c4', tx: 'chemical peel' });
  CL.c4.submittedForms = [{ formId: fid, title: 'My chem peel form', at: Date.now() - 10 * 86400000 }];
  manualAppts.push({ id: 'm5', date: D.d3, time: '1:00 PM', client: 'Nia NoApp', clientId: 'c5', tx: 'Express Chemical Peel' });
  const did = _svcFormsSweep();
  out.did = did.map(d => d.cid + ':' + d.fid);
  out.pend = Object.fromEntries(['c1', 'c2', 'c3', 'c4', 'c5'].map(k => [k, (CL[k].pendingForms || []).map(p => p.formId)]));
  out.notes = notifFeed.filter(n => /^svcf-/.test(n.id)).map(n => n.title + ' | ' + n.body);
  // 3. run again: nothing new, nothing doubled
  const a1 = (CL.c1.pendingForms.find(p => p.formId === fid) || {}).assignedAt;
  out.again = _svcFormsSweep().length;
  out.sameInstance = (CL.c1.pendingForms.find(p => p.formId === fid) || {}).assignedAt === a1;
  // 4. a Square booking for the same service
  _sqApptsState = 'ok'; squareAppts = [{ id: 'SQA', at: new Date(Date.now() + 4 * 86400000), sqcid: 'SQ6', client: 'Sam Square', tx: 'Chemical Peel', dur: 60 }];
  out.sq = _svcFormsSweep().map(d => d.cid);
  await new Promise(r => setTimeout(r, 2500));
  return out;
}, { d2: day(2), d3: day(3), d30: day(30) });
const fid = r.fid;
T.check('the form editor has "Send when booked for" with her services listed', r.hasCard && r.pickerHas.includes('Chemical Peel') && r.pickerHas.includes('Signature Facial'), JSON.stringify(r.pickerHas));
T.check('picking Chemical Peel saves it on the form', JSON.stringify(r.services) === '["Chemical Peel"]', JSON.stringify(r.services));
T.check('booked for "Chemical Peel - 60 min": the form goes to her app', r.pend.c1.includes(fid), JSON.stringify(r.pend));
T.check('a facial booking gets nothing', !r.pend.c2.length, JSON.stringify(r.pend));
T.check('a peel 30 days away waits (not yet in the 14-day window)', !r.pend.c3.length, JSON.stringify(r.pend));
T.check('filled in 10 days ago: not sent again', !r.pend.c4.length, JSON.stringify(r.pend));
T.check('"Express Chemical Peel" counts as a peel', r.pend.c5.includes(fid), JSON.stringify(r.pend));
T.check('she is told in the bell, and told to invite a client with no app', r.notes.length === 2 && r.notes.some(n => /waiting in their app/.test(n)) && r.notes.some(n => /Nia NoApp/.test(n) && /invite them/.test(n)), JSON.stringify(r.notes));
T.check('running again sends nothing twice', r.again === 0 && r.sameInstance, JSON.stringify(r));
T.check('a Square booking gets it too', JSON.stringify(r.sq) === '["c6"]', JSON.stringify(r.sq));
const blob = P.clientPosts.filter(x => x.id === 'c1').pop();
T.check('the form reaches the client\'s app (pushed to the server)', blob && JSON.stringify(blob.data).includes(fid), P.clientPosts.map(x => x.id).join(','));
// 6. her other device: the service link travelled with the form
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
const Q = await page(ctx2, server);
await boot(Q.p); await Q.p.waitForTimeout(1500);
const q = await Q.p.evaluate(f => ({ s: formTmpls[f] && formTmpls[f].services }), fid);
T.check('her other device has the form with its service', JSON.stringify(q.s) === '["Chemical Peel"]', JSON.stringify(q));
const del = await P.p.evaluate(f => { window.confirmModal = (o, fn) => fn(); deleteFormCard(f);
  manualAppts.push({ id: 'm7', date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), time: '3:00 PM', client: 'Fran Facial', clientId: 'c2', tx: 'Chemical Peel' });
  return _svcFormsSweep().length; }, fid);
T.check('a deleted form is never sent', del === 0, String(del));
T.check('no page errors', !P.errs.length && !Q.errs.length, [...P.errs, ...Q.errs].join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
