// Review & merge / Merge manually where the provider picks KEEP = the record whose id is NOT the
// Square id (sq_...). _mergeClientRecords tombstones the dropped sq_ id in sc_deleted_clients, and
// _purgeRemovedClients strips any client whose squareId maps to a deleted sq_ key — i.e. the SURVIVOR.
//  (i)  two copies of one Square customer, keep the copy
//  (ii) a client she added by hand ("Bob", no squareId) merged with her Square record, keep "Bob":
//       the fill-blanks step copies squareId onto Bob first, so the same purge takes him.
// Checked on the merging device and on a second device after it syncs.
import { makeServer, launch, device, flush, resync, ids, kvClients, check, report } from './sweep-dup-xdevice-lib.mjs';

const roster = {
  sq_janex: { name: 'Jane Doe', squareId: 'JANEX', notes: 'Allergic to latex', _uAt: 1000 },
  cdupjane: { name: 'Jane Doe', squareId: 'JANEX', notes: 'Prefers mornings', submittedForms: [{ formId: 'intake', date: 'Oct 1' }], _uAt: 1000 },
  cbob: { name: 'Bob Smith', phone: '5550001111', notes: 'Hand-added chart with real notes', _uAt: 1000 },
  sq_robsmith12: { name: 'Robert Smith', squareId: 'ROBSMITH12', email: 'rob@x.test', _uAt: 1000 },
};
const srv = makeServer({ sc_clients: JSON.stringify(roster), sc_deleted_clients: '{}' }, roster);
const b = await launch();
const phone = await device(b, srv, 'phone');
const warns = []; phone.on('console', m => { if (/refused|purge|dupes/i.test(m.text())) warns.push(m.text().slice(0, 200)); });
const comp = await device(b, srv, 'computer');

const r = await phone.evaluate(() => {
  _mergeClientRecords('cdupjane', 'sq_janex');   // (i) keep the copy (it has the intake form)
  _mergeClientRecords('cbob', 'sq_robsmith12');      // (ii) keep the hand-added chart
  const afterMerge = { jane: !!CL.cdupjane, bob: !!CL.cbob, bobSq: CL.cbob && CL.cbob.squareId };
  _purgeRemovedClients();                         // runs on every load / render
  return { afterMerge, afterPurge: { jane: !!CL.cdupjane, bob: !!CL.cbob }, del: Object.keys(_deletedClientIds), merged: Object.keys(mergedSquareIds) };
});
check('(i) keep-the-copy merge: survivor present right after the merge', r.afterMerge.jane, r);
check('(i) keep-the-copy merge: survivor survives the purge on this device', r.afterPurge.jane, r);
check('(ii) hand-added "Bob" kept over his Square record: survives the purge', r.afterPurge.bob, r);
await flush(phone);
await resync(comp);
const c = await ids(comp);
check('(i) survivor present on the other device after it syncs', c.includes('cdupjane'), c);
check('(ii) "Bob" present on the other device after it syncs', c.includes('cbob'), c);
check('account roster still holds both survivors', kvClients(srv).includes('cdupjane') && kvClients(srv).includes('cbob'), kvClients(srv));
// knock-on: with the survivor purged and not on any delete list, does the shrink guard now hold back
// EVERY later roster upload from this device?
await phone.evaluate(() => { CL.newbie = { name: 'New Person After Merge', notes: 'typed after the merge' }; saveClients(); });
await flush(phone);
check('knock-on: a client added on the phone after the merge still reaches the account', kvClients(srv).includes('newbie'), kvClients(srv));
// (iii) plain Remove of the Square copy of a pair: does the OTHER copy (which she is keeping) go too?
const r3 = await comp.evaluate(() => {
  CL.sq_ann0000001 = { name: 'Ann Lee', squareId: 'ANN0000001', notes: 'Square copy' };
  CL.cdupann = { name: 'Ann Lee', squareId: 'ANN0000001', notes: 'The chart she uses, 3 visits of notes', submittedForms: [{ formId: 'intake', date: 'Sep 2' }] };
  saveClients();
  deleteClient('sq_ann0000001');
  try { document.querySelectorAll('button').forEach(b => { if (/^\s*Remove\s*$/.test(b.textContent)) b.click(); }); } catch (e) {}
  _purgeRemovedClients();
  return { sq: !!CL.sq_ann0000001, kept: !!CL.cdupann };
});
check('(iii) removing the Square copy of a pair leaves the other chart alone', r3.kept && !r3.sq, r3);
check('info: phone console (shrink guard etc.)', true, warns);
check('no page errors', !phone._errs.length && !comp._errs.length, phone._errs.concat(comp._errs).join(' | '));
await b.close();
process.exit(report() ? 1 : 0);
