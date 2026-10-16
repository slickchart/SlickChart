// Room -> "Dictate a note — hands-free" -> _voiceSave() / _voiceSmartSave() write into
// providerNoteDrafts[id] WITHOUT first retiring last visit's committed draft (_expireCommittedDraft).
//  A. Last visit's note was saved (committed) weeks ago. Today she dictates in the room: the dictation is
//     APPENDED to last visit's draft (old date, committed:true, old committedAt). Tapping End session
//     then runs renderSessionSummary -> _expireCommittedDraft, which deletes that draft, taking today's
//     dictation with it.
//  B. Her typed notes for today are in a draft under another format (she switched format, or the
//     other device uses another default). _voiceSave() keeps the draft only if templateId matches,
//     otherwise starts a NEW one — the typed notes are replaced by the dictation.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel', _token: 'TOKC2' } }) };
const P = await page(ctx, server); await boot(P.p);
// FIX=1: proposed fix applied in-page — retire last visit's committed draft before writing, and carry
// a different-format draft over (same as the editor does) instead of starting an empty one.
if (process.env.FIX) await P.p.evaluate(() => {
  const patch = src => src.replace("const draft=providerNoteDrafts[id]&&providerNoteDrafts[id].templateId===activeNoteTemplate?providerNoteDrafts[id]:{date:(typeof _isoToday==='function'?_isoToday():''),sections:{},templateId:activeNoteTemplate};",
    "try{_expireCommittedDraft(id);}catch(e){} const _b=providerNoteDrafts[id]; const draft=(_b&&_b.templateId===activeNoteTemplate)?_b:{date:(_b&&_b.date)||_isoToday(),sections:_noteSectionsFor(id,tmpl),templateId:activeNoteTemplate};");
  const n = patch(_voiceSave.toString()); if (n === _voiceSave.toString()) throw new Error('patch did not apply');
  window._voiceSave = eval('(' + n + ')');
});
const A = await P.p.evaluate(() => {
  const tmpl = activeNoteTemplate; const sec = ((noteTemplates[tmpl] || noteTemplates.soap).sections[0] || {}).id;
  const old = Date.now() - 21 * 86400000; const d = new Date(old); const iso = d.toISOString().slice(0, 10);
  providerNoteDrafts.c1 = { date: iso, sections: { [sec]: 'Three weeks ago: peel, mild erythema.' }, templateId: tmpl, ts: old, committed: true, committedAt: old };
  sessionSummaries.c1 = [{ date: iso, treatment: 'Facial', _draftDate: iso, ts: old, note: 'x' }];
  nav('room', 'c1'); _voiceClientId = 'c1'; _voiceSave('Today: hydrafacial, extractions on chin, client loved it.');
  const afterVoice = JSON.stringify(providerNoteDrafts.c1);
  _summaryFrom = 'room'; nav('session-summary', 'c1');
  const left = JSON.stringify(providerNoteDrafts.c1 || null);
  try { _voiceClose(); } catch (e) {}
  return { afterVoice, left, iso };
});
T.check('A. today\'s dictation survives tapping End session', /Today: hydrafacial/.test(A.left), 'after voice=' + A.afterVoice + ' | after End session=' + A.left);
const B = await P.p.evaluate(() => {
  const keys = Object.keys(noteTemplates); const other = keys.find(k => k !== activeNoteTemplate);
  const osec = (noteTemplates[other].sections[0] || {}).id;
  providerNoteDrafts.c2 = { date: _isoToday(), sections: { [osec]: 'Typed earlier today under ' + other }, templateId: other, ts: Date.now() };
  nav('room', 'c2'); _voiceClientId = 'c2'; _voiceSave('Dictated addition');
  try { _voiceClose(); } catch (e) {}
  return JSON.stringify(providerNoteDrafts.c2);
});
T.check('B. dictating does not throw away notes typed under another format', /Typed earlier today/.test(B), B);
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
