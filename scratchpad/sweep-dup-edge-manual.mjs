// Review & merge (manual) and mid-edit hazards around the duplicate merge.
import { boot, reporter } from './sweep-dup-edge-harness.mjs';
const { check, done } = reporter();
const { b, p, errs, toasts } = await boot({ sq_seed: { name: 'Seed Person', squareId: 'SEED', _uAt: 1 } }, {}, 12000);

// A. Review & merge: she ticks "Keep" on the copy (not the sq_ record). Same Square customer.
const a = await p.evaluate(() => {
  CL.ckc = { name: 'Keep Copy', squareId: 'SQK', notes: 'typed on the copy' }; CL.sq_sqk = { name: 'Keep Copy', squareId: 'SQK' };
  _mergeClientRecords('ckc', 'sq_sqk'); const afterMerge = !!CL.ckc; _purgeRemovedClients();
  return { afterMerge, afterPurge: !!CL.ckc, notes: CL.ckc && CL.ckc.notes, delRec: !!_deletedClientIds.sq_sqk };
});
check('Review & merge keeping the COPY: survivor still there after the purge', a.afterPurge, JSON.stringify(a));

// B. Review & merge default Keep when the copy was inserted first (Object.keys order).
const bb = await p.evaluate(() => {
  CL.cfirst = { name: 'Order Test', squareId: 'SQO', phone: '5550001111' }; CL.sq_sqo = { name: 'Order Test', squareId: 'SQO' };
  const g = _findDuplicateGroups().find(g => g.includes('sq_sqo')); _openMergeSheet(g.join(','));
  const k = window._mergeKeep; document.getElementById('merge-sheet')?.remove(); return { group: g, defaultKeep: k };
});
check('Review & merge pre-selects the sq_ record as Keep (else one tap makes both vanish)', bb.defaultKeep === 'sq_sqo', JSON.stringify(bb));

// C. Mid-edit: she is writing a note on the copy when the merge runs (upsert after a Square fetch).
const c = await p.evaluate(async () => {
  CL.sq_sqe = { name: 'Mid Edit', squareId: 'SQE' }; CL.cedit = { name: 'Mid Edit', squareId: 'SQE' }; saveClients();
  nav('write-note', 'cedit'); await new Promise(r => setTimeout(r, 400));
  const ta = document.querySelector('textarea[id^="wn-sec-"]'); if (!ta) return { err: 'no textarea' };
  ta.value = 'Used 30% TCA, mild frosting'; ta.dispatchEvent(new Event('input'));
  const merged = _autoMergeSquareDuplicates();
  _saveWriteNote('cedit');
  await new Promise(r => setTimeout(r, 300));
  const hist = (sessionSummaries.sq_sqe || []).map(h => h.providerNotes || h.note);
  return { merged, editStillOpen: !!document.getElementById(ta.id), keptHist: JSON.stringify(hist), orphanDraft: !!providerNoteDrafts.cedit, keptDraft: !!providerNoteDrafts.sq_sqe, cedit: !!CL.cedit, nav: _navCur };
});
check('a note being written on the copy when the merge runs is saved onto the survivor', c.keptHist && /TCA/.test(c.keptHist), JSON.stringify(c));

// D. merging twice in a row (boot runner + upsert) is idempotent
const d = await p.evaluate(() => { CL.sq_sqd = { name: 'Twice', squareId: 'SQD' }; CL.ctw = { name: 'Twice', squareId: 'SQD', email: 't@x' };
  const n1 = _autoMergeSquareDuplicates(), n2 = _autoMergeSquareDuplicates(); return { n1, n2, left: Object.values(CL).filter(x => x.name === 'Twice').length, email: CL.sq_sqd.email }; });
check('running twice is harmless', d.n2 === 0 && d.left === 1 && d.email === 't@x', JSON.stringify(d));

// E. the survivor carries the absorbed data with a NEW _uAt, so a stale device cannot win it back
const e = await p.evaluate(() => { CL.sq_squ = { name: 'Stamp', squareId: 'SQU', _uAt: 5 }; CL.cst = { name: 'Stamp', squareId: 'SQU', email: 's@x', _uAt: 5 }; _seedClientSigCache();
  _autoMergeSquareDuplicates(); return { uAt: CL.sq_squ._uAt }; });
check('survivor is re-stamped (_uAt) after absorbing a copy', e.uAt > 5, JSON.stringify(e));
check('no page errors', !errs.length, errs.join(' | '));
console.log('toasts:', toasts.join(' | '));
await b.close();
process.exit(done() ? 1 : 0);
