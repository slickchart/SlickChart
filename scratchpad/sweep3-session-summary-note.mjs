// Session summary note: what actually reaches the client.
//  1. No notes written + no edit -> the preview shows the INSTRUCTION "Tap Edit to write a note…", and
//     _storeSummary() reads #summary-note.innerText as the note, so the client receives that
//     instruction as "A note from <provider>".
//  2. "Personal note" toggled OFF in Customize card -> the note draft is still sent.
//  3. Observations typed, then "Skin metrics" toggled off -> still sent ("Observations: …").
//  4. Note editor open, provider taps "+ Add" on homecare (or the Send-to-app toggle, a guide, a
//     product) -> renderSessionSummary() redraws and the typed note is thrown away.
//  5. editSummaryNote() starts the textarea from innerText — for (1) that is the instruction text.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel', _token: 'TOKC2' }, c3: { name: 'Eve Park', treatment: 'Wax', _token: 'TOKC3' }, c4: { name: 'Fay Ross', treatment: 'Brow', _token: 'TOKC4' } }) };
const { p, errs, clientPosts } = await page(ctx, server);
await boot(p);
const lastSum = id => { const x = clientPosts.filter(y => y.id === id).pop(); return x && x.data.summaries && x.data.summaries[0]; };
// 1
await p.evaluate(() => { nav('session-summary', 'c1'); sendSummary('c1'); }); await p.waitForTimeout(2000);
T.check('1. no note written: the client does not receive the "Tap Edit to write a note" instruction', !/Tap Edit/.test((lastSum('c1') || {}).note || ''), JSON.stringify(lastSum('c1')));
// 2
await p.evaluate(() => { nav('session-summary', 'c2'); summaryNoteDraft.c2 = 'Private-ish wording'; summaryToggles.note = false; renderSessionSummary('c2'); sendSummary('c2'); summaryToggles.note = true; }); await p.waitForTimeout(2000);
T.check('2. "Personal note" off: no note is sent', !/Private-ish/.test((lastSum('c2') || {}).note || ''), JSON.stringify(lastSum('c2')));
// 3
await p.evaluate(() => { summaryToggles.metrics = true; nav('session-summary', 'c3'); summaryObsDraft.c3 = 'Redness on left cheek'; summaryToggles.metrics = false; renderSessionSummary('c3'); summaryNoteDraft.c3 = 'Hi'; sendSummary('c3'); }); await p.waitForTimeout(2000);
T.check('3. "Skin metrics" off: the observation is not sent', !/Redness/.test((lastSum('c3') || {}).note || ''), JSON.stringify(lastSum('c3')));
// 4
const lost = await p.evaluate(() => { nav('session-summary', 'c4'); editSummaryNote('c4'); const ta = document.getElementById('note-edit-ta'); ta.value = 'Typed mid-appointment, not yet Done'; addHomecareTag('c4', 'SPF daily'); return { draft: summaryNoteDraft.c4, editorStillOpen: !!document.getElementById('note-edit-ta'), shown: (document.getElementById('summary-note') || {}).innerText }; });
T.check('4. adding a homecare step while the note editor is open keeps the typed note', /Typed mid-appointment/.test((lost.draft || '') + (lost.shown || '')), JSON.stringify(lost));
// 5
const ed = await p.evaluate(() => { delete summaryNoteDraft.c1; nav('session-summary', 'c1'); editSummaryNote('c1'); return document.getElementById('note-edit-ta').value; });
T.check('5. Edit on an empty note opens an empty editor, not the instruction text', !/Tap Edit/.test(ed), ed);
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
