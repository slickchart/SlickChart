// sweep2: a device does not pull again after boot (no resume/focus pull), so a computer left open is
// "stale" for hours. When it cancels an appointment it pushes ITS sc_deleted_appts (missing the phone's
// cancellation) — api/store.js plain-overwrites every delete record except the three client ones —
// and its sc_manual_appts still carrying the phone's cancelled visit. Any device that boots next shows
// the cancelled appointment again (and _gcalPush sends it back to her Google calendar).
// SRVMERGE=1 makes the mock server merge sc_deleted_appts like NEWEST_WINS_KEYS (the proposed fix).
import { makeServer, launch, device, flush, check, report } from './sweep-dup-xdevice-lib.mjs';
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const ap = (id, who) => ({ id, client: who, tx: 'Facial', date: day, time: '10:00 AM', _ts: Date.now() - 5000 });
const srv = makeServer({ sc_manual_appts: JSON.stringify([ap('ma_x1', 'Jen'), ap('ma_x2', 'Pat'), ap('ma_x3', 'Lee')]) });
if (process.env.SRVMERGE) srv.newest = { sc_deleted_appts: 1 };
const b = await launch();
const phone = await device(b, srv, 'phone');
const comp = await device(b, srv, 'computer');   // open all day; never pulls again
const cancel = (p, id) => p.evaluate((id) => { const i = manualAppts.findIndex(x => x.id === id); manualAppts.splice(i, 1); _apptDeleted(id); _saveManualAppts(); }, id);
await cancel(phone, 'ma_x1'); await flush(phone);
check('account: x1 cancelled by the phone', !/ma_x1/.test(srv.kv.sc_manual_appts), srv.kv.sc_manual_appts.length);
await cancel(comp, 'ma_x2'); await flush(comp);
check('account delete record still has the phone\'s x1', /ma_x1/.test(srv.kv.sc_deleted_appts || ''), srv.kv.sc_deleted_appts);
const fresh = await device(b, srv, 'tablet');
const t = await fresh.evaluate(() => manualAppts.map(x => x.id));
check('a device booting next does not show cancelled x1', !t.includes('ma_x1'), t);
check('...nor cancelled x2', !t.includes('ma_x2'), t);
await b.close();
process.exit(report() ? 1 : 0);
