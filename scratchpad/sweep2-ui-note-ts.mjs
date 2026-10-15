// Session record `ts` is BOTH the sort date and the conflict stamp the merge uses (_unionEntryLists:
// newest ts wins). _storeSummary stamps Date.now(); _commitWriteNote stamps the visit date at UTC
// midnight. So editing the note AFTER sending the summary moves ts BACKWARDS: any device/pull still
// holding the summary-time copy wins the merge and her edit disappears. Also: in US time zones the
// UTC-midnight stamp is "yesterday", so the Today card says notes are not done after "Just save".
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch({ tz: 'America/Los_Angeles' });
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial' } }) };
const { p, errs } = await page(ctx, server);
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
await p.evaluate(() => { activeNoteTemplate = 'soap'; nav('write-note', 'c1'); document.getElementById('wn-sec-s1').value = 'first version'; _saveWriteNote('c1'); });
T.check('"Just save" counts as notes done today (Today card)', await p.evaluate(() => _notesDoneToday('c1')), await p.evaluate(() => JSON.stringify((sessionSummaries.c1 || []).map(s => [s.ts, new Date(s.ts).toString()]))));
await p.evaluate(() => { summaryNoteDraft.c1 = 'client version'; _storeSummary('c1'); });
const afterSummary = await p.evaluate(() => JSON.stringify(sessionSummaries.c1));
await p.evaluate(() => { nav('write-note', 'c1'); document.getElementById('wn-sec-s1').value = 'EDITED after sending: allergic to latex'; _saveWriteNote('c1'); });
const r = await p.evaluate((stale) => {
  const fresh = JSON.stringify(sessionSummaries);
  const staleMap = JSON.stringify({ c1: JSON.parse(stale) });
  // (1) this device pulls while the account still holds the summary-time copy (upload queued / offline)
  const m1 = _mergeClientMap(staleMap, fresh, 'sc_session_summaries');
  // (2) another device holding the summary-time copy pulls the edited account copy
  const m2 = _mergeClientMap(fresh, staleMap, 'sc_session_summaries');
  const pn = s => JSON.stringify((JSON.parse(s).c1[0] || {}).providerNotes || {});
  return { tsNow: sessionSummaries.c1[0].ts, tsBefore: JSON.parse(stale)[0].ts, same: pn(m1.str).includes('EDITED'), other: pn(m2.str).includes('EDITED'), otherChanged: m2.changed };
}, afterSummary);
T.check('editing the note after sending keeps the record\'s stamp moving forward', r.tsNow >= r.tsBefore, JSON.stringify(r));
T.check('a pull on this device does not throw away the edit', r.same, JSON.stringify(r));
T.check('another device with the older copy does not overwrite the edit (and push it back)', r.other, JSON.stringify(r));
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
