// Phone merges a duplicate (Review & merge on a pair auto-merge left alone because their notes differ).
// The computer is STALE: it still holds the copy and has not pulled since. Does the copy come back?
//  A) computer simply resyncs                         -> expect copy gone everywhere
//  B) computer edits the copy / deletes another client BEFORE it pulls (its push carries a stale
//     sc_deleted_clients) and then a fresh tablet signs in -> expect copy still gone
import { makeServer, launch, device, flush, resync, ids, kvClients, kvDeleted, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';

const roster = {
  sq_janex: { name: 'Jane Doe', squareId: 'JANEX', notes: 'Allergic to latex', _uAt: 1000 },
  cdupjane: { name: 'Jane Doe', squareId: 'JANEX', notes: 'Prefers mornings', _uAt: 1000 },
  qother: { name: 'Quinn Other', notes: 'x', _uAt: 1000 },
  keepme: { name: 'Kim Keep', notes: 'y', _uAt: 1000 },
};
const srv = makeServer({ sc_clients: JSON.stringify(roster), sc_deleted_clients: '{}' }, roster);
const b = await launch();
const phone = await device(b, srv, 'phone');
const comp = await device(b, srv, 'computer');
check('both devices start with both copies (auto-merge left the conflicting pair alone)',
  (await ids(phone)).includes('cdupjane') && (await ids(comp)).includes('cdupjane'), { phone: await ids(phone), comp: await ids(comp) });

// --- phone: Review & merge, keep the Square record
await phone.evaluate(() => _mergeClientRecords('sq_janex', 'cdupjane'));
await flush(phone);
check('phone: merge reached the account (copy gone from kv, on the delete list, row soft-deleted)',
  !kvClients(srv).includes('cdupjane') && kvDeleted(srv).includes('cdupjane') && !!srv.rows.cdupjane.deleted_at,
  { kv: kvClients(srv), del: kvDeleted(srv), row: srv.rows.cdupjane.deleted_at });

const MODE_A_ONLY = process.env.MODE === 'A';
if (!MODE_A_ONLY) {
// --- B: stale computer deletes ANOTHER client before it has pulled
await comp.evaluate(() => { _markClientDeleted('qother'); delete CL.qother; saveClients(); });
await flush(comp);
check('B: computer’s delete of another client keeps the phone’s tombstone on the account',
  kvDeleted(srv).includes('cdupjane'), { del: kvDeleted(srv) });
check('B: computer’s stale roster push does not put the merged copy back on the account',
  !kvClients(srv).includes('cdupjane'), { kv: kvClients(srv) });

// a third device signs in fresh now (new phone / reinstall)
const tablet = await device(b, srv, 'tablet');
check('B: fresh device signing in now does NOT get the merged-away copy', !(await ids(tablet)).includes('cdupjane'), await ids(tablet));
await tablet.close();
}

// --- computer resyncs
await resync(comp);
check('A: stale computer drops the copy after it resyncs', !(await ids(comp)).includes('cdupjane'), await ids(comp));
check('A: account roster has no copy after computer resync', !kvClients(srv).includes('cdupjane'), kvClients(srv));
// --- phone resyncs (heals the account if the computer clobbered it)
await resync(phone);
await resync(comp);
const final = { phone: await ids(phone), comp: await ids(comp), kv: kvClients(srv), del: kvDeleted(srv) };
check('converged: copy gone on every device and the account', !final.phone.includes('cdupjane') && !final.comp.includes('cdupjane') && !final.kv.includes('cdupjane'), final);
check('converged: survivor kept everywhere', final.phone.includes('sq_janex') && final.comp.includes('sq_janex') && final.kv.includes('sq_janex'), final);
check('converged: tombstones on the account', final.del.includes('cdupjane') && (MODE_A_ONLY || final.del.includes('qother')), final.del);
// which PUTs carried the copy back to the account?
const back = srv.puts.filter(x => x.items.sc_clients && /"cdupjane"/.test(x.items.sc_clients)).map(x => x.dev);
check('no device ever re-uploaded the merged copy in sc_clients after the merge', back.length === 0, back);
check('no page errors', !phone._errs.length && !comp._errs.length, phone._errs.concat(comp._errs).join(' | '));
await b.close();
process.exit(report() ? 1 : 0);
