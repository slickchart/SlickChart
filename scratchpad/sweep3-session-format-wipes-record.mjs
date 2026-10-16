// She charts the visit and taps "Just save" (the session record gets providerNotes). Then she switches
// note format (Notes -> Change), e.g. to try one for her next client, and sends this client's summary.
// _storeSummary() snapshots the notes with _providerNotesSnapshot(), which reads only the ACTIVE format's
// section ids — empty — and Object.assign()s that over the saved record: the visit's clinical notes
// disappear from the session record. 12h later _expireCommittedDraft() deletes the draft too.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }) };
const P = await page(ctx, server); await boot(P.p);
// FIX=1: snapshot the draft under ITS OWN format (the one it was written in).
if (process.env.FIX) await P.p.evaluate(() => {
  window._providerNotesSnapshot = function (id) {
    try {
      const draft = providerNoteDrafts[id];
      const tmpl = (draft && noteTemplates[draft.templateId]) || noteTemplates[activeNoteTemplate] || noteTemplates.soap;
      const secs = (tmpl.sections || []).map(sec => { const v = (draft && draft.sections && draft.sections[sec.id]) ? String(draft.sections[sec.id]).trim() : ''; return (v && v !== 'No notes yet.') ? { label: sec.label, text: v } : null; }).filter(Boolean);
      return { format: tmpl.name || 'Notes', sections: secs };
    } catch (e) { return { format: 'Notes', sections: [] }; }
  };
});
const r = await P.p.evaluate(() => {
  nav('write-note', 'c1'); const t = noteTemplates[activeNoteTemplate]; const el = document.getElementById('wn-sec-' + t.sections[0].id);
  el.value = 'Hydrafacial, 3 passes, extractions chin, mild erythema'; _saveWriteNote('c1');
  const before = JSON.stringify((sessionSummaries.c1[0] || {}).providerNotes);
  const other = Object.keys(noteTemplates).find(k => k !== activeNoteTemplate); activeNoteTemplate = other; saveNoteFmt();
  nav('session-summary', 'c1'); summaryNoteDraft.c1 = 'Lovely visit'; sendSummary('c1');
  return { before, after: JSON.stringify((sessionSummaries.c1[0] || {}).providerNotes), n: sessionSummaries.c1.length };
});
T.check("the visit's saved clinical notes are still on the session record after Send", /extractions chin/.test(r.after), JSON.stringify(r));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
