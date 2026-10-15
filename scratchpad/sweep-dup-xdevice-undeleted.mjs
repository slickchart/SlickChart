// sc_undeleted_clients ("put back on purpose") is grow-only and is checked by PRESENCE, so it beats the
// delete record forever. A client who was ever put back (Recover screen, "Bring back", or the Recover
// "combine" flow, which un-deletes the copies and then opens Review & merge on them) can never be
// merged away or removed again: the next device that still holds the record pushes it back and every
// device keeps it.
import { makeServer, launch, device, flush, resync, ids, kvClients, check, report } from './sweep-dup-xdevice-lib.mjs';

const roster = {
  cdebbi: { name: 'Debbi Miranda', email: 'd@x.test', notes: 'real chart', _uAt: 1000 },
  cdebbi2: { name: 'Debbi Miranda', email: 'd@x.test', notes: 'copy that was put back', _uAt: 1000 },
  cother: { name: 'Other Person', _uAt: 1000 },
};
// cdebbi2 was put back by the Recover screen last week
const undel = JSON.stringify({ cdebbi2: Date.now() - 7 * 864e5 });
const srv = makeServer({ sc_clients: JSON.stringify(roster), sc_deleted_clients: '{}', sc_undeleted_clients: undel }, roster);
const b = await launch();
const phone = await device(b, srv, 'phone');
const comp = await device(b, srv, 'computer');
check('setup: both devices hold both Debbis', (await ids(phone)).includes('cdebbi2') && (await ids(comp)).includes('cdebbi2'));

// phone: Review & merge the put-back copy into the real chart
await phone.evaluate(() => _mergeClientRecords('cdebbi', 'cdebbi2'));
await flush(phone);
check('phone: the merged copy is on the delete list', JSON.parse(srv.kv.sc_deleted_clients || '{}').cdebbi2 > 0, srv.kv.sc_deleted_clients);
// computer (still holding the copy) resyncs
await resync(comp);
await resync(phone);
await resync(comp);
const st = { phone: await ids(phone), comp: await ids(comp), kv: kvClients(srv) };
check('merged-away put-back copy stays gone on the computer', !st.comp.includes('cdebbi2'), st);
check('merged-away put-back copy stays gone on the phone', !st.phone.includes('cdebbi2'), st);
check('merged-away put-back copy stays gone on the account', !st.kv.includes('cdebbi2'), st);

// and a plain Remove of a put-back client on the phone
await phone.evaluate(() => { CL.cother && 0; });
await phone.evaluate(() => { localStorage.setItem('sc_undeleted_clients', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('sc_undeleted_clients') || '{}'), { cother: Date.now() - 864e5 }))); _pushKeyNow('sc_undeleted_clients', localStorage.getItem('sc_undeleted_clients')); });
await flush(phone);
await resync(comp);
await phone.evaluate(() => { _cleanupClientData('cother'); delete CL.cother; _markClientDeleted('cother'); saveClients(); });
await flush(phone);
await resync(comp); await resync(phone);
const st2 = { phone: await ids(phone), comp: await ids(comp), kv: kvClients(srv) };
check('a client put back once can still be removed later (stays removed after both devices sync)', !st2.phone.includes('cother') && !st2.comp.includes('cother'), st2);
check('no page errors', !phone._errs.length && !comp._errs.length, phone._errs.concat(comp._errs).join(' | '));
await b.close();
process.exit(report() ? 1 : 0);
