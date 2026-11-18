// 2026-11-18 "fix all of those":
//  1. An Undo of a cleared check-in stays undone after a sync, on this device and on a second one,
//     even though the account's sc_ci_cleared list still names it (it only ever grows). A later
//     clear on the other device wins again.
//  2. A client's chat photo is kept ONCE: once it is on her photo chart and backed up, the message
//     keeps only the photo id; the chat still shows the photo. Not backed up = nothing changes.
import { makeServer, launch, device, flush, resync, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const T = Date.now();
const CLIENTS = { c1: { name: 'Amy Real', _uAt: T - 86400000 } };
const CK = { id: 'ck1', clientId: 'c1', client: 'Amy Real', ts: T - 3600000, at: T - 3600000 };
const srv = makeServer({ sc_clients: JSON.stringify(CLIENTS), sc_checkins: JSON.stringify([CK]), sc_hide_sample: '1' });
const b = await launch();

// ── 1. check-in Undo ──────────────────────────────────────────────────────────────────────────
const A = await device(b, srv, 'computer');
await flush(A);
await A.evaluate(() => { _clearCheckin('ck1'); });
await flush(A);
check('clear: the account list names it', JSON.parse(srv.kv.sc_ci_cleared || '[]').includes('ck1'), srv.kv.sc_ci_cleared);
// An older device puts the grow-only list back with ck1 in it, as it would.
await A.evaluate(() => { _undoClearCheckin(); });
await flush(A);
srv.kv.sc_ci_cleared = JSON.stringify(['ck1']);
await resync(A); await resync(A);
let st = await A.evaluate(() => ({ cleared: _isCheckinClearedLog('ck1'), inLog: checkins.some(c => c && c.id === 'ck1') }));
check('undo on this device survives two syncs against an account list that still names it', !st.cleared && st.inLog, st);
check('the account holds the undo time', (JSON.parse(srv.kv.sc_ci_clear_at || '{}').ck1 || 0) < 0, srv.kv.sc_ci_clear_at);

// A second device that had it cleared locally (from before the undo).
const B = await device(b, srv, 'phone', { sc_ci_cleared: JSON.stringify(['ck1']), sc_ci_clear_at: JSON.stringify({ ck1: T - 60000 }) });
await flush(B); await resync(B);
st = await B.evaluate(() => ({ cleared: _isCheckinClearedLog('ck1'), inLog: checkins.some(c => c && c.id === 'ck1') }));
check('second device: the newer undo beats its older clear', !st.cleared && st.inLog, st);
// Clear again on the phone; the computer follows.
await B.evaluate(() => { _clearCheckin('ck1'); }); await flush(B);
await resync(A);
st = await A.evaluate(() => ({ cleared: _isCheckinClearedLog('ck1'), inLog: checkins.some(c => c && c.id === 'ck1') }));
check('a later clear on the phone wins on the computer', st.cleared && !st.inLog, st);
const sz = Object.keys(JSON.parse(srv.kv.sc_ci_clear_at || '{}')).length;
check('the clear-time record holds one entry, not one per sync', sz === 1, srv.kv.sc_ci_clear_at);

// ── 2. chat photos kept once ──────────────────────────────────────────────────────────────────
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' + '#'.repeat(0);
const big = PX;   // content does not matter, the identity does
const C = await device(b, srv, 'tablet');
await flush(C);
const r = await C.evaluate(({ big }) => {
  msgStore.c1 = msgStore.c1 || [];
  msgStore.c1.push({ from: 'them', text: 'my skin', imgs: [big, big], time: 'now', ts: Date.now(), evId: 'evA' });
  msgStore.c1.push({ from: 'them', text: 'not backed', imgs: [big], time: 'now', ts: Date.now(), evId: 'evB' });
  msgStore.c1.push({ from: 'me', text: 'mine', imgs: [big], time: 'now', ts: Date.now(), _mid: 'm1' });
  capturedPhotos.c1 = capturedPhotos.c1 || [];
  ['ph_ev_evA_0', 'ph_ev_evA_1', 'ph_ev_evB_0'].forEach((pid, i) => capturedPhotos.c1.push({ url: big, ts: Date.now() + i, phase: 'reference', source: 'message', pid }));
  _markPhotoBackedUp('ph_ev_evA_0'); _markPhotoBackedUp('ph_ev_evA_1');   // evB's photo not backed up yet
  saveMessages();
  const byEv = k => msgStore.c1.find(m => m.evId === k || m._mid === k);
  return { a: byEv('evA'), b: byEv('evB'), me: byEv('m1') };
}, { big });
check('backed-up client photos: the message keeps only the ids', r.a.imgs.length === 0 && r.a.imgPids.join() === 'ph_ev_evA_0,ph_ev_evA_1' && r.a.imgCount === 2, r.a);
check('a photo not yet backed up stays in the message', r.b.imgs.length === 1 && !r.b.imgPids, r.b);
check('her own sent photo stays in the message', r.me.imgs.length === 1, r.me);
await flush(C);
const acct = JSON.parse(srv.kv.sc_msgstore || '{}').c1 || [];
check('the account copy is the slim one', (acct.find(m => m.evId === 'evA') || {}).imgs?.length === 0, acct.map(m => m.imgs && m.imgs.length));
await C.evaluate(() => nav('chat', 'c1')); await sleep(400);
const shown = await C.evaluate(() => document.querySelectorAll('#chat-body img').length);
check('the chat still shows every photo (2 from the chart + 1 + 1)', shown === 4, shown);
// On a device that does not have the photos yet, the chat says where they are instead of nothing.
await C.evaluate(() => { capturedPhotos.c1 = capturedPhotos.c1.filter(p => !/^ph_ev_evA/.test(p.pid)); nav('chat', 'c1'); }); await sleep(400);
const note = await C.evaluate(() => document.getElementById('chat-body').textContent.includes('2 photos, on the photo chart'));
check('photos not on this device yet: the bubble says so', note, note);
// Merge with an old device's fat copy: one message, not two; no growth on repeat.
await C.evaluate(() => { const m = msgStore.c1.find(x => x.evId === 'evA'); m.imgs = []; });
const merged = await C.evaluate(({ big }) => {
  const fat = { c1: [{ from: 'them', text: 'my skin', imgs: [big, big], time: 'now', ts: 1, evId: 'evA' }] };
  const r1 = _mergeMsgStore(JSON.stringify(fat), JSON.stringify(msgStore));
  const r2 = _mergeMsgStore(r1.str, r1.str);
  return { n: JSON.parse(r1.str).c1.filter(m => m.evId === 'evA').length, same: r2.str === r1.str, ch: r2.changed };
}, { big });
check('an old device\'s full copy does not make a second message', merged.n === 1 && merged.same && !merged.ch, merged);
await b.close();
report();
