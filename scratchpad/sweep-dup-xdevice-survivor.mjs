// Two devices auto-merge the same pair of copies (same Square customer, no sq_ record) before either
// has seen the other's result. The survivor is picked by weight(), which is content- and order-
// dependent; if the devices pick DIFFERENT survivors, each tombstones the other's survivor, the
// delete lists union, and the person disappears from every device.
// Device difference used here: the computer holds an unsynced birthday on copy B (a field the phone
// does not have yet), so B weighs more there; on the phone A weighs more (it has a phone number the
// phone device filled in offline). Neither is a conflict, so auto-merge runs on both.
import { makeServer, launch, device, flush, resync, ids, kvClients, check, report } from './sweep-dup-xdevice-lib.mjs';

const base = {
  cpatA: { name: 'Pat Kim', squareId: 'PATKIM0001', source: 'square', notes: 'hold-a', _uAt: 1000 },
  cpatB: { name: 'Pat Kim', squareId: 'PATKIM0001', source: 'square', notes: 'hold-b', _uAt: 1000 },
  cother: { name: 'Other', _uAt: 1000 },
};
const srv = makeServer({ sc_clients: JSON.stringify(base) }, base);
const b = await launch();
// The two copies boot with different notes so the boot-time auto-merge leaves them; the stage below
// makes them equal (as if she just edited them) and runs the merge on both.
const phone = await device(b, srv, 'phone');
const comp = await device(b, srv, 'computer');
await phone.evaluate(() => { CL.cpatA.notes = CL.cpatB.notes = ''; CL.cpatA.phone = '5551112222'; });
await comp.evaluate(() => { CL.cpatA.notes = CL.cpatB.notes = ''; CL.cpatB.birthday = '1990-04-02'; CL.cpatB.email = 'pat@x.test'; });
// both run the auto-merge before either pushes (both opened at the same time)
const pm = await phone.evaluate(() => { _autoMergeSquareDuplicates(); return Object.keys(CL).filter(k => /^cpat/.test(k)); });
const cm = await comp.evaluate(() => { _autoMergeSquareDuplicates(); return Object.keys(CL).filter(k => /^cpat/.test(k)); });
check('info: survivors picked', true, { phone: pm, computer: cm });
await flush(phone); await flush(comp);
await resync(phone); await resync(comp); await resync(phone);
const st = { phone: await ids(phone), comp: await ids(comp), kv: kvClients(srv) };
const pat = a => a.filter(x => /^cpat/.test(x)).length;
check('Pat Kim still exists exactly once on the phone', pat(st.phone) === 1, st);
check('Pat Kim still exists exactly once on the computer', pat(st.comp) === 1, st);
check('no page errors', !phone._errs.length && !comp._errs.length, phone._errs.concat(comp._errs).join(' | '));
await b.close();
process.exit(report() ? 1 : 0);
