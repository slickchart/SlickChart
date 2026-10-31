// Every flow around "Send when booked for" (Ashley 2026-10-31: "do a whole sweep of checks and bugs
// before finishing ... check every single flow"). Companion to test-service-forms.mjs.
import { mk, launch, page, boot } from './sweep3-session-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
const C = {}; ['a', 'b', 'c', 'd', 'e', 'f'].forEach(k => { C[k] = { id: k, name: 'Flow ' + k.toUpperCase() + 'son', _token: 'TOK_' + k, appInvited: true }; });
const server = { sc_clients: JSON.stringify(C), sc_professions: JSON.stringify(['esty']), sc_service_menu: JSON.stringify([{ id: 's1', name: 'Chemical Peel', price: 120 }]) };
const P = await page(ctx, server);
await boot(P.p); await P.p.waitForTimeout(1500);
const r = await P.p.evaluate(async (C) => {
  const o = {}; const W = ms => new Promise(r => setTimeout(r, ms));
  const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  // 1. a BUNDLED form (Esthetician Collection peel consent) tied to a service
  o.bundled = !!formTmpls['ec-peel'];
  nav('form-builder', 'ec-peel'); await W(200);
  const sel = document.getElementById('fb-svc-pick'); sel.value = 'Chemical Peel'; sel.dispatchEvent(new Event('change'));
  const ag = document.getElementById('fb-svc-again'); ag.value = 'skip'; ag.dispatchEvent(new Event('change'));
  const dd = document.getElementById('fb-svc-days');
  o.defaultDays = dd.value;   // what shows the moment she picks "recently"
  // a bad number never saves as a duration: blank, 0, negative keep the last good one; huge is capped
  ['', '0', '-5'].forEach(v => { dd.value = v; dd.dispatchEvent(new Event('input')); }); o.afterBad = _fbSvcSkip;
  dd.value = '99999'; dd.dispatchEvent(new Event('input')); o.capped = _fbSvcSkip;
  dd.value = '45'; dd.dispatchEvent(new Event('input'));
  // phone width: the card fits
  const card = document.getElementById('fb-svc-card').getBoundingClientRect();
  o.fits = card.right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
  saveFormBuilder('ec-peel');
  o.saved = { s: formTmpls['ec-peel'].services, k: formTmpls['ec-peel'].svcSkipDays };
  await W(2500);
  // 2. bookings: yesterday (past) nothing; deleted before the sweep nothing; one earlier form still
  //    unfilled stops a second copy; filled 50 days ago with her 45 days goes
  manualAppts.push({ id: 'p1', date: day(-1), time: '10:00 AM', client: C.a.name, clientId: 'a', tx: 'Chemical Peel' });
  manualAppts.push({ id: 'p2', date: day(4), time: '10:00 AM', client: C.b.name, clientId: 'b', tx: 'Chemical Peel' });
  manualAppts = manualAppts.filter(x => x.id !== 'p2');
  manualAppts.push({ id: 'p3', date: day(2), time: '10:00 AM', client: C.c.name, clientId: 'c', tx: 'Chemical Peel' });
  manualAppts.push({ id: 'p4', date: day(9), time: '10:00 AM', client: C.c.name, clientId: 'c', tx: 'Chemical Peel' });
  manualAppts.push({ id: 'p5', date: day(3), time: '10:00 AM', client: C.d.name, clientId: 'd', tx: 'Chemical Peel' });
  CL.d.submittedForms = [{ formId: 'ec-peel', at: Date.now() - 50 * 86400000 }];
  manualAppts.push({ id: 'p6', date: day(3), time: '11:00 AM', client: C.e.name, clientId: 'e', tx: 'Chemical Peel' });
  CL.e.submittedForms = [{ formId: 'ec-peel', at: Date.now() - 40 * 86400000 }];
  _svcFormsSweep();
  const cnt = k => (CL[k].pendingForms || []).filter(p => p.formId === 'ec-peel').length;
  o.cnt = { a: cnt('a'), b: cnt('b'), c: cnt('c'), d: cnt('d'), e: cnt('e') };
  // 3. she fills it, then books again: her own setting decides (45 days -> not sent)
  CL.c.submittedForms = [{ formId: 'ec-peel', at: Date.now() }];
  manualAppts.push({ id: 'p7', date: day(12), time: '1:00 PM', client: C.c.name, clientId: 'c', tx: 'Chemical Peel' });
  o.afterFill = _svcFormsSweep().filter(d => d.cid === 'c').length;
  // 4. she takes the service off: the form stops going, and the days go with it
  nav('form-builder', 'ec-peel'); await W(200);
  _fbSvcRemove(0); o.againHidden = !document.getElementById('fb-svc-again');
  saveFormBuilder('ec-peel'); o.cleared = { s: formTmpls['ec-peel'].services, k: formTmpls['ec-peel'].svcSkipDays };
  manualAppts.push({ id: 'p8', date: day(2), time: '3:00 PM', client: C.f.name, clientId: 'f', tx: 'Chemical Peel' });
  o.afterRemove = _svcFormsSweep().length;
  // 5. a form saved without any service carries no service fields at all
  o.plain = Object.keys(formTmpls).filter(k => formTmpls[k] && (formTmpls[k].svcSkipDays !== undefined)).length;
  return o;
}, C);
T.check('a built-in collection form can be tied to a service', r.bundled && JSON.stringify(r.saved.s) === '["Chemical Peel"]' && r.saved.k === 45, JSON.stringify(r.saved));
T.check('picking "recently" starts with a number she can change', r.defaultDays === '30', r.defaultDays);
T.check('blank, 0 or a negative number never saves; a huge one is capped', r.afterBad === 30 && r.capped === 3650, JSON.stringify([r.afterBad, r.capped]));
T.check('the card fits on a phone', r.fits);
T.check('a booking that already happened gets nothing', r.cnt.a === 0, JSON.stringify(r.cnt));
T.check('a booking removed before the check gets nothing', r.cnt.b === 0, JSON.stringify(r.cnt));
T.check('two bookings, form not filled yet: one copy, not two', r.cnt.c === 1, JSON.stringify(r.cnt));
T.check('her 45 days: filled 50 days ago goes, 40 days ago does not', r.cnt.d === 1 && r.cnt.e === 0, JSON.stringify(r.cnt));
T.check('filled today, booked again: her setting holds it back', r.afterFill === 0, String(r.afterFill));
T.check('taking the service off stops it and drops her days', r.againHidden && r.cleared.s === undefined && r.cleared.k === undefined && r.afterRemove === 0, JSON.stringify(r));
T.check('no other form picked up a setting', r.plain === 0, String(r.plain));
// her other device sees the bundled form's change
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
const server2 = Object.assign({}, server);
const Q = await page(ctx2, server2);
// replay what device 1 stored
const stored = await P.p.evaluate(() => _lsGet('sc_forms'));
server2.sc_forms = stored;
await boot(Q.p); await Q.p.waitForTimeout(1200);
const q = await Q.p.evaluate(() => ({ s: formTmpls['ec-peel'] && formTmpls['ec-peel'].services }));
T.check('the other device has the change (service taken off)', q.s === undefined, JSON.stringify(q));
T.check('no page errors', !P.errs.length && !Q.errs.length, [...P.errs, ...Q.errs].join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
