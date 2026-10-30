// Maddie (Feedback, 2026-10-30): "For all my facial clients it's trying to get them to fill out a wax
// consent form and I've tried to delete it and I can't figure out where it is or how to get rid of it."
// A provider whose first profession is Waxer got "Wax intake & consent" in every first-visit package,
// and deleting the form changed nothing because a deleted bundled form stays in formTmpls (hidden).
// Deleting it must stop it being sent, and must offer to take it back from clients who have it open.
import { mk, launch, page, boot } from './sweep3-session-lib.mjs';
const T = mk();
const { b, ctx } = await launch();
const C = { c1: { id: 'c1', name: 'Faye Facial', _token: 'TOK_c1', appInvited: true, pendingForms: [{ formId: 'wax-intake', assignedAt: 1000 }] },
            c2: { id: 'c2', name: 'Gail Glow', _token: 'TOK_c2', appInvited: true, pendingForms: [{ formId: 'wax-intake', assignedAt: 1200 }, { formId: 'intake', assignedAt: 1200 }] },
            c3: { id: 'c3', name: 'Hana New', _token: 'TOK_c3' } };
const P = await page(ctx, { sc_clients: JSON.stringify(C), sc_professions: JSON.stringify(['wax', 'esty']) });
await boot(P.p);
const r = await P.p.evaluate(async () => {
  const out = {};
  out.before = { intake: _ncIntakeFormId(), consent: _ncConsentId() };
  const asks = [];
  window.confirmModal = (o, fn) => { asks.push(o.title + ' | ' + o.body); fn(); };
  deleteFormCard('wax-intake');
  await new Promise(r => setTimeout(r, 300));
  out.asks = asks.slice();
  out.after = { intake: _ncIntakeFormId(), hidden: _formHidden('wax-intake') };
  out.c1 = (CL.c1.pendingForms || []).map(p => p.formId); out.c2 = (CL.c2.pendingForms || []).map(p => p.formId);
  out.w1 = CL.c1.withdrawn && CL.c1.withdrawn['f:wax-intake']; out.w2 = CL.c2.withdrawn && CL.c2.withdrawn['f:wax-intake'];
  out.suggested = _suggestedFormsFor(CL.c3);
  deleteFormCard('consent-wax');
  out.consentAfter = _ncConsentId();
  // the package itself: assigns the next intake, never the deleted one
  try { await sendFirstVisitPackage('c3', {}); } catch (e) { out.err = String(e); }
  out.c3 = (CL.c3.pendingForms || []).map(p => p.formId);
  // a deleted form no client has open asks nothing more
  asks.length = 0; deleteFormCard('peel'); out.peelAsks = asks.length;
  return out;
});
T.check('before: a wax-first provider resolves the wax intake (the reported situation)', r.before.intake === 'wax-intake', JSON.stringify(r.before));
T.check('deleted wax intake is no longer the first-visit intake', r.after.hidden && r.after.intake && r.after.intake !== 'wax-intake', JSON.stringify(r.after));
T.check('deleted wax consent is no longer the new-client consent', r.consentAfter && r.consentAfter !== 'consent-wax', r.consentAfter);
T.check('first-visit package sends the next intake, not the deleted one', r.c3.length && !r.c3.includes('wax-intake'), JSON.stringify(r));
T.check('suggested forms skip the deleted intake', !r.suggested.includes('wax-intake'), JSON.stringify(r.suggested));
T.check('delete offers to take it back from the 2 clients who have it open', r.asks.length === 2 && /2 clients/.test(r.asks[1]), JSON.stringify(r.asks));
T.check('take back removes only that form, from both, and records when', JSON.stringify(r.c1) === '[]' && JSON.stringify(r.c2) === '["intake"]' && r.w1 > 1000 && r.w2 > 1200, JSON.stringify(r));
T.check('deleting a form nobody has open asks nothing extra', r.peelAsks === 1, String(r.peelAsks));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
