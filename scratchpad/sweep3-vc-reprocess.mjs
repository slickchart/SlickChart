// PHOTO CONSULT: the vc_submit branch of syncClientEvents is NOT idempotent. If an old vc_submit event is
// ever seen as "fresh" again it overwrites the CURRENT submission with the old payload (dropping the
// routine verdicts/feedback/analysis she worked on) and flips a REVIEWED consult back to "Needs review"
// with a new "Photo consult submitted" alert. One way it becomes fresh again, shown here:
// _markEventsSeen / _markEventSeen cap sc_seen_events at 1000 ids, while /api/clients returns up to 2000
// events and _mergeSeenEvents keeps 5000. Past 1000 events (a busy practice: every message, check-in,
// booking, form is one) the oldest ids fall off on the next mark and are re-ingested on the next poll.
// (Same branch also re-applies on a laptop left asleep: focus -> syncClientEvents with its OLD seen set,
// before the resume pull has merged the account's.)
import { launch, page as provPage, mk } from './sweep2-ui-lib.mjs';
const T = mk();
const px = n => 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(n);
const msgs = []; for (let i = 0; i < 1100; i++) msgs.push({ id: 'evm' + i, client_id: 'c9', kind: 'message', created_at: new Date(Date.UTC(2026, 6, 1) + i * 60000).toISOString(), payload: { text: 'hi ' + i } });
const OLDVC = { id: 'ev_vc_old', client_id: 'c1', kind: 'vc_submit', created_at: '2026-06-01T10:00:00Z', payload: { kind: 'skin', title: 'Photo consult', photos: [{ label: 'Front', src: px(1) }], goals: 'JUNE consult', date: 'Jun 1' } };
const seen = ['ev_vc_old'].concat(msgs.map(m => m.id));
const server = {
  sc_clients: JSON.stringify({ c1: { name: 'Cara Client', _uAt: 1, _token: 'T1' }, c9: { name: 'Chatty', _uAt: 1, _token: 'T9' } }),
  sc_seen_events: JSON.stringify(seen),
  sc_pro_vc_subs: JSON.stringify({ c1: { photos: [{ label: 'Front', src: px(7) }, { label: 'Left', src: px(8) }], goals: 'OCTOBER consult', date: 'Oct 10', kind: 'skin', title: 'Photo consult', routine: [{ name: 'Cleanser', verdict: 'keep', feedback: 'fine' }] } }),
  sc_pro_vc_invites: JSON.stringify({ c1: { invited: true, submitted: true, reviewed: true, invitedAt: 9, kind: 'skin', photoLabels: ['Front', 'Left'], ts: Date.now() - 86400000 } })
};
let events = [OLDVC].concat(msgs);
const handler = async (r, u) => { if (u.includes('/api/clients') && r.request().method() === 'GET') { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [{ id: 'c1', name: 'Cara Client', token: 'T1' }, { id: 'c9', name: 'Chatty', token: 'T9' }], events: events.slice().reverse() }) }); return true; } return false; };
const { b, ctx } = await launch();
const P = await provPage(ctx, server, { handler });
await P.p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await P.p.waitForTimeout(3500);
const s0 = await P.p.evaluate(async () => { await syncClientEvents(); return { st: _vcStatus('c1'), goals: (vcSubmissions.c1 || {}).goals, seen: _seenEventIds().length }; });
T.check('boot: consult is reviewed, October submission', s0.st === 'reviewed' && /OCTOBER/.test(s0.goals || ''), JSON.stringify(s0));
// one new client message arrives
events = events.concat([{ id: 'evm_new', client_id: 'c9', kind: 'message', created_at: new Date().toISOString(), payload: { text: 'new' } }]);
await P.p.evaluate(async () => { await syncClientEvents(); });
await P.p.waitForTimeout(800);
const s1 = await P.p.evaluate(async () => { const n = _seenEventIds().length; const has = _seenEventIds().includes('ev_vc_old'); await syncClientEvents(); return { seenLen: n, oldStillSeen: has, st: _vcStatus('c1'), goals: (vcSubmissions.c1 || {}).goals, verdict: (((vcSubmissions.c1 || {}).routine || [])[0] || {}).verdict, alerts: notifFeed.filter(x => x && x.type === 'vc').length }; });
T.check('seen set keeps every id the server still returns', s1.oldStillSeen, 'seen length after one mark = ' + s1.seenLen);
T.check('reviewed consult stays reviewed', s1.st === 'reviewed', JSON.stringify(s1));
T.check('current submission is not replaced by a months-old one', /OCTOBER/.test(s1.goals || ''), s1.goals);
T.check('no fresh "Photo consult submitted" alert for an old event', s1.alerts === 0, 'vc alerts=' + s1.alerts);
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close();
process.exit(T.done() ? 1 : 0);
