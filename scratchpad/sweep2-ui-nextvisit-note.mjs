// A week after a visit, she opens the same client's notes for TODAY's visit. The single per-client note
// draft still holds LAST visit's note and date, so (a) "Just save" overwrites last visit's session record
// and (b) the session summary she sends today is filed onto last week's record (and the client's copy).
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const lastWk = new Date(Date.now() - 7 * 864e5); const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const L = iso(lastWk);
const server = {
  sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', summaries: [{ date: 'last', title: 'Facial', note: 'LAST WEEK client summary', ts: lastWk.getTime(), _draftDate: L }] } }),
  sc_session_summaries: JSON.stringify({ c1: [{ date: 'last', treatment: 'Facial', note: 'LAST WEEK note', ts: lastWk.getTime(), _draftDate: L, _clientSaved: true }] }),
  sc_note_drafts: JSON.stringify({ c1: { date: L, sections: { s1: 'LAST WEEK subjective' }, templateId: 'soap', ts: lastWk.getTime() } }),
};
const { p, errs } = await page(ctx, server);
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
// (a) open Write note for today's visit, write today's note, Just save
await p.evaluate(() => { activeNoteTemplate = 'soap'; nav('write-note', 'c1'); });
const shown = await p.evaluate(() => ({ date: document.getElementById('wn-date').value, s1: document.getElementById('wn-sec-s1').value }));
await p.evaluate(() => { document.getElementById('wn-sec-s1').value = 'TODAY subjective'; _saveWriteNote('c1'); });
await p.waitForTimeout(300);
const a = await p.evaluate(() => (sessionSummaries.c1 || []).map(s => [s._draftDate, s.note]));
T.check('Write note for a NEW visit opens blank on today (not last visit\'s text and date)', shown.date !== L, JSON.stringify(shown));
T.check('saving today\'s note keeps last week\'s record and adds a new one', a.length === 2 && a.some(x => x[1] === 'LAST WEEK note'), JSON.stringify(a));
// (b) session summary sent today
await p.evaluate(() => { summaryNoteDraft.c1 = 'TODAY client summary'; _storeSummary('c1'); });
const cs = await p.evaluate(() => (CL.c1.summaries || []).map(s => [s._draftDate, s.note]));
T.check('today\'s summary does not replace last week\'s client-facing summary', cs.some(x => /LAST WEEK client summary/.test(x[1])) && cs.some(x => /TODAY client summary/.test(x[1])), JSON.stringify(cs));
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
