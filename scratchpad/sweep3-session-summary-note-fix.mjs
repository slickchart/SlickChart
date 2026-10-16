// Applies the proposed summary-note fixes in-page, then re-runs the five checks from
// sweep3-session-summary-note.mjs. Proves the fix shape; the real change goes into slickchart.html.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel', _token: 'TOKC2' }, c3: { name: 'Eve Park', treatment: 'Wax', _token: 'TOKC3' }, c4: { name: 'Fay Ross', treatment: 'Brow', _token: 'TOKC4' } }) };
const { p, errs, clientPosts } = await page(ctx, server);
await boot(p);
await p.evaluate(() => {
  // (a) one reader for "the note that will be sent": draft, else the auto note, never the instruction text
  window._summaryNoteText = function (id) {
    if (summaryNoteDraft[id] != null) return String(summaryNoteDraft[id]).trim();
    if (id === 'maya' || id === 'sophie' || id === 'priya') { const el = document.getElementById('summary-note'); return el ? el.innerText.trim() : ''; }
    return String(_clientFriendlyFromNotes(id, CL[id] || {}) || '').trim();
  };
  // (b) _storeSummary: honour the note / metrics toggles, use the reader above
  window._storeSummary = eval('(' + _storeSummary.toString()
    .replace("const note=((summaryNoteDraft[id]!=null?summaryNoteDraft[id]:(noteEl?noteEl.innerText:''))||'').trim();", "const note=summaryToggles.note?_summaryNoteText(id):'';")
    .replace("const obs=(summaryObsDraft[id]||'').trim();", "const obs=summaryToggles.metrics?(summaryObsDraft[id]||'').trim():'';") + ')');
  // (c) the editor writes the draft as she types; Cancel puts the previous value back
  window._noteEditOrig = null;
  window.editSummaryNote = function (id) {
    const el = document.getElementById('summary-note'); if (!el) return;
    const had = summaryNoteDraft[id] != null; const current = had ? summaryNoteDraft[id] : _summaryNoteText(id);
    _noteEditOrig = { id: id, had: had, val: summaryNoteDraft[id] };
    el.outerHTML = `<div id="summary-note-edit"><textarea id="note-edit-ta" data-cid="${id}" oninput="summaryNoteDraft['${id}']=this.value;persistSummaryDrafts();" style="width:100%;height:120px;">${String(current).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
      <button onclick="_noteEditOrig=null;renderSessionSummary('${id}')">Done</button>
      <button onclick="if(_noteEditOrig&&_noteEditOrig.id==='${id}'){if(_noteEditOrig.had)summaryNoteDraft['${id}']=_noteEditOrig.val;else delete summaryNoteDraft['${id}'];persistSummaryDrafts();}_noteEditOrig=null;renderSessionSummary('${id}')">Cancel</button></div>`;
    document.getElementById('note-edit-ta').focus();
  };
});
const lastSum = id => { const x = clientPosts.filter(y => y.id === id).pop(); return x && x.data.summaries && x.data.summaries[0]; };
await p.evaluate(() => { nav('session-summary', 'c1'); sendSummary('c1'); }); await p.waitForTimeout(2000);
T.check('1. no note written: client does not get the instruction text', !/Tap Edit/.test((lastSum('c1') || {}).note || ''), JSON.stringify(lastSum('c1')));
await p.evaluate(() => { nav('session-summary', 'c2'); summaryNoteDraft.c2 = 'Private-ish wording'; summaryToggles.note = false; renderSessionSummary('c2'); sendSummary('c2'); summaryToggles.note = true; }); await p.waitForTimeout(2000);
T.check('2. "Personal note" off: no note sent', !/Private-ish/.test((lastSum('c2') || {}).note || ''), JSON.stringify(lastSum('c2')));
await p.evaluate(() => { summaryToggles.metrics = true; nav('session-summary', 'c3'); summaryObsDraft.c3 = 'Redness on left cheek'; summaryToggles.metrics = false; renderSessionSummary('c3'); summaryNoteDraft.c3 = 'Hi'; sendSummary('c3'); }); await p.waitForTimeout(2000);
T.check('3. "Skin metrics" off: observation not sent', !/Redness/.test((lastSum('c3') || {}).note || ''), JSON.stringify(lastSum('c3')));
const lost = await p.evaluate(() => { nav('session-summary', 'c4'); editSummaryNote('c4'); const ta = document.getElementById('note-edit-ta'); ta.value = 'Typed mid-appointment, not yet Done'; ta.dispatchEvent(new Event('input')); addHomecareTag('c4', 'SPF daily'); return { draft: summaryNoteDraft.c4, shown: (document.getElementById('summary-note') || {}).innerText }; });
T.check('4. adding a homecare step while editing keeps the typed note', /Typed mid-appointment/.test((lost.draft || '') + (lost.shown || '')), JSON.stringify(lost));
const cancel = await p.evaluate(() => { editSummaryNote('c4'); const ta = document.getElementById('note-edit-ta'); ta.value = 'oops'; ta.dispatchEvent(new Event('input')); [...document.querySelectorAll('#summary-note-edit button')].find(x => x.textContent === 'Cancel').click(); return summaryNoteDraft.c4; });
T.check('4b. Cancel still discards what was typed in that edit', cancel === 'Typed mid-appointment, not yet Done', cancel);
const ed = await p.evaluate(() => { delete summaryNoteDraft.c1; nav('session-summary', 'c1'); editSummaryNote('c1'); return document.getElementById('note-edit-ta').value; });
T.check('5. Edit on an empty note opens empty', !/Tap Edit/.test(ed), ed);
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
