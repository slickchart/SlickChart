// Adversarial sweep of the automatic duplicate-client merge (_autoMergeSquareDuplicates) at boot.
// Each fixture is a way it could do harm. A FAIL is a confirmed bug.
import { boot, reporter } from './sweep-dup-edge-harness.mjs';
const { check, done } = reporter();
const acct = {
  // 1. Mom imported from Square; daughter added in the app with mom's email -> /api/square/customers
  //    dedups by email and hands back MOM's Square id (customers.js:22-31), so both carry SQF.
  sq_sqf: { name: 'Jane Smith', squareId: 'SQF', email: 'jane@x.test', phone: '(555) 111-2222', _uAt: 1 },
  clily:  { name: 'Lily Smith', squareId: 'SQF', email: 'jane@x.test', phone: '5551112222', birthday: '2012-04-01', allergies: 'Peanuts', _uAt: 1 },
  // 2. client-facing summaries on both copies
  sq_sqs: { name: 'Sum One', squareId: 'SQS', summaries: [{ ts: 1000, _draftDate: '2026-10-01', date: 'Oct 1', note: 'first visit' }], _uAt: 1 },
  csums:  { name: 'Sum One', squareId: 'SQS', summaries: [{ ts: 2000, _draftDate: '2026-10-09', date: 'Oct 9', note: 'second visit' }], _uAt: 1 },
  // 3. number vs string
  sq_12345: { name: 'Num Person', squareId: 12345, _uAt: 1 },
  cnum:     { name: 'Num Person', squareId: '12345', email: 'num@x.test', _uAt: 1 },
  // 4. whitespace (should simply not merge)
  sq_sqw: { name: 'White Space', squareId: 'SQW', _uAt: 1 }, cws: { name: 'White Space', squareId: ' SQW ', _uAt: 1 },
  // 5. empty squareId never groups
  cemp1: { name: 'Empty Sq', squareId: '', _uAt: 1 }, cemp2: { name: 'Empty Sq', squareId: '', _uAt: 1 },
  // 6. three copies, no canonical sq_ record, one holds the client's link
  c1700000000001: { name: 'Three Copy', squareId: 'SQ3', _token: 'TOK3A', appInvited: true, _uAt: 1 },
  c1700000000002: { name: 'Three Copy', squareId: 'SQ3', notes: 'only note', _uAt: 1 },
  c1700000000003: { name: 'Three Copy', squareId: 'SQ3', _uAt: 1 },
  // 7. the COPY is the one whose link the client has (invited+joined); canonical has none
  sq_sqt: { name: 'Tok Person', squareId: 'SQT', _uAt: 1 },
  ctok:   { name: 'Tok Person', squareId: 'SQT', _token: 'TOKCOPY', appInvited: true, appJoined: true, _uAt: 1 },
  // 8. the copy is NEWER with a different treatment (in the ignore list)
  sq_sqn: { name: 'Newer Edit', squareId: 'SQN', treatment: 'Facial', _uAt: 1 },
  cnew:   { name: 'Newer Edit', squareId: 'SQN', treatment: 'Microblading', _uAt: 2 },
  // 9. placeholder survivor
  sq_sqp: { name: 'Place Holder', squareId: 'SQP', skin: '—', concerns: '—', allergies: 'None noted', fitz: '—', treatment: 'New client', _uAt: 1 },
  cph:    { name: 'Place Holder', squareId: 'SQP', skin: 'Oily', notes: 'real chart', email: 'p@x.test', _uAt: 1 },
};
const { b, p, errs, toasts, posts } = await boot(acct);
const st = await p.evaluate(() => {
  const by = n => Object.entries(CL).filter(([, c]) => c.name === n);
  const one = n => (by(n)[0] || [null, {}]);
  return {
    family: by('Jane Smith').length + by('Lily Smith').length, familyIds: Object.keys(CL).filter(k => k === 'sq_sqf' || k === 'clily'),
    sq_sqf: CL.sq_sqf,
    sums: (one('Sum One')[1].summaries || []).map(s => s.note),
    num: by('Num Person').map(([k, c]) => [k, c.email]),
    ws: by('White Space').length, emp: by('Empty Sq').length,
    three: by('Three Copy').map(([k, c]) => [k, c._token, c.notes]),
    tok: by('Tok Person').map(([k, c]) => [k, c._token]),
    newer: by('Newer Edit').map(([k, c]) => [k, c.treatment]),
    ph: by('Place Holder').map(([k, c]) => [k, c.skin, c.notes]),
    deleted: Object.keys(_deletedClientIds), last: localStorage.getItem('sc_dupes_last'),
    groups: _findDuplicateGroups().map(g => g.map(id => CL[id].name + ':' + id)),
  };
});
const delPosted = posts.filter(x => /\/api\/clients/.test(x.u)).flatMap(x => x.body.deletedIds || []);
check('Mother and daughter sharing ONE Square customer are NOT merged', st.family === 2, JSON.stringify({ ids: st.familyIds, kept: st.sq_sqf && { name: st.sq_sqf.name, birthday: st.sq_sqf.birthday, allergies: st.sq_sqf.allergies } }));
check('both copies\' client-facing summaries survive the merge', st.sums.length === 2, JSON.stringify(st.sums));
check('numeric vs string squareId treated as one person (merged, email carried)', st.num.length === 1 && st.num[0][1] === 'num@x.test', JSON.stringify(st.num));
check('whitespace-padded squareId is not merged (conservative)', st.ws === 2, String(st.ws));
check('empty squareId never groups', st.emp === 2, String(st.emp));
check('three copies with no canonical fold to one; the link-holder is the survivor', st.three.length === 1 && st.three[0][1] === 'TOK3A' && st.three[0][2] === 'only note', JSON.stringify(st.three));
check('the copy whose link the client OPENED is not tombstoned on the server', !delPosted.includes('ctok'), 'deletedIds posted: ' + JSON.stringify(delPosted) + ' survivor: ' + JSON.stringify(st.tok));
check('a newer different treatment on the copy is not silently dropped', st.newer.length === 2 || (st.newer[0] && st.newer[0][1] === 'Microblading'), JSON.stringify(st.newer));
check('placeholder survivor is filled from the real copy', st.ph.length === 1 && st.ph[0][1] === 'Oily' && st.ph[0][2] === 'real chart', JSON.stringify(st.ph));
check('no page errors', !errs.length, errs.join(' | '));
console.log('sc_dupes_last:', st.last); console.log('Review & merge groups after boot:', JSON.stringify(st.groups)); console.log('toasts:', toasts.join(' | '));
await b.close();
process.exit(done() ? 1 : 0);
