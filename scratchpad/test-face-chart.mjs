// Face chart (provider ask, 2026-10-30): tap a face to drop marks in the write-note editor; the marks
// ride on the visit's draft, land on that visit's session record when the note is saved, write a
// plain "Face chart:" line into the note, survive typing / a re-render, and show on the record.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: "Jennie O'Neil", treatment: 'Facial' } }), sc_professions: JSON.stringify(['esty']) };
const { p, errs } = await page(ctx, server);
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
await p.evaluate(() => { activeNoteTemplate = 'soap'; nav('write-note', 'c1'); });
T.check('Face chart button shows for an esthetician', await p.locator('#fc-field button').count() === 1);
await p.fill('#wn-sec-s1', 'Client reports dryness.');
await p.click('#fc-field button');
const box = await p.locator('#fc-svg').boundingBox();
// tap the left of the picture at cheek height (the client's RIGHT cheek), then forehead as "Treated area"
await p.mouse.click(box.x + box.width * 0.30, box.y + box.height * 0.55);
await p.evaluate(() => _fcSetType('treat'));
const box2 = await p.locator('#fc-svg').boundingBox();
await p.mouse.click(box2.x + box2.width * 0.5, box2.y + box2.height * 0.2);
const marks = await p.evaluate(() => JSON.stringify(_fcDraft.marks));
T.check('two marks placed, areas named from the tap', /Right cheek/.test(marks) && /Forehead/.test(marks) && /"treat"/.test(marks), marks);
await p.locator('#fc-list input[aria-label="Note"]').first().fill('healing, 2 lesions');
await p.screenshot({ path: 'face-chart-editor.png' });
await p.click('text=Save chart');
const v = await p.evaluate(() => document.getElementById('wn-sec-s1').value);
T.check('a Face chart line goes at the top of the note, typed text kept', v.startsWith('Face chart: 1. Right cheek, Breakout (healing, 2 lesions); 2. Forehead, Treated area') && v.includes('Client reports dryness.'), v);
T.check('chart stored on the draft', await p.evaluate(() => (providerNoteDrafts.c1.faceChart || {}).marks.length === 2));
T.check('field shows 2 marks', /2 marks/.test(await p.locator('#fc-field').innerText()));
// typing more (autosave snapshot) must not drop the chart
await p.fill('#wn-sec-s2', 'Skin dehydrated');
await p.evaluate(() => _snapshotWriteNoteNow('c1'));
T.check('typing after charting keeps the chart', await p.evaluate(() => !!(providerNoteDrafts.c1.faceChart && providerNoteDrafts.c1.faceChart.marks.length === 2)));
// re-open & save again: line replaced, not duplicated
await p.click('#fc-field button'); await p.click('text=Save chart');
const v2 = await p.evaluate(() => document.getElementById('wn-sec-s1').value);
T.check('saving again replaces the line instead of adding a second', v2.split('Face chart:').length === 2, v2);
await p.evaluate(() => _saveWriteNote('c1'));
const rec = await p.evaluate(() => JSON.stringify(sessionSummaries.c1[0].faceChart || null));
T.check('saved note: the visit record carries the chart', /Right cheek/.test(rec), rec);
T.check('the record\'s provider notes contain the chart line', await p.evaluate(() => JSON.stringify(sessionSummaries.c1[0].providerNotes).includes('Face chart: 1. Right cheek')));
T.check('the client-facing note does not carry the chart line', await p.evaluate(() => !String(sessionSummaries.c1[0].note||'').includes('Face chart:') && String(sessionSummaries.c1[0].note).includes('dryness')));
await p.evaluate(() => { nav('session-detail', 'c1:0'); try { switchSessionDetailTab('provider'); } catch (e) {} });
const html = await p.evaluate(() => document.getElementById('S') ? S.innerHTML : document.body.innerHTML);
T.check('session record shows the face chart', html.includes('<h2>Face chart</h2>') && html.includes('healing, 2 lesions'));
await p.screenshot({ path: 'face-chart-record.png' });
// the session record survives a merge with an older copy (entry-level union keeps the newer)
const m = await p.evaluate(() => { const fresh = JSON.stringify(sessionSummaries); const old = JSON.parse(fresh); delete old.c1[0].faceChart; old.c1[0]._ts = 1; return _mergeClientMap(JSON.stringify(old), fresh, 'sc_session_summaries').str.includes('Right cheek'); });
T.check('merge with an older device keeps the chart', m);
// Start from last visit: new day's note, empty chart, copy last
await p.evaluate(() => { delete providerNoteDrafts.c1; nav('write-note', 'c1'); });
await p.click('#fc-field button');
T.check('offers last visit\'s chart on a fresh note', await p.locator('text=Start from last visit').count() === 1);
await p.click('text=Start from last visit');
T.check('copies the marks', await p.evaluate(() => _fcDraft.marks.length === 2));
await p.click('text=Clear all'); await p.click('text=Save chart');
T.check('clearing leaves no Face chart line', !(await p.evaluate(() => document.getElementById('wn-sec-s1').value)).includes('Face chart:'));
// tattoo template / non-face profession: no face chart
await p.evaluate(() => { delete providerNoteDrafts.c1; selectedProfessions = ['massage']; nav('write-note', 'c1'); });
T.check('hidden for a massage therapist', await p.locator('#fc-field').count() === 0);
await p.evaluate(() => { selectedProfessions = ['esty']; activeNoteTemplate = 'tattooRecord'; nav('write-note', 'c1'); });
T.check('hidden on the tattoo record (body map has it)', await p.locator('#fc-field').count() === 0);
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
