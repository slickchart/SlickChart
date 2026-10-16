// Notes typed under one note format (e.g. on the phone, or before she switched format) are shown by the
// Notes screen and the editor (_noteSectionsFor carries them over), but the Room preview and the
// summary's auto client note use _activeNotesText(), which requires draft.templateId===activeNoteTemplate.
// So the room says "Type or review your notes" and the summary shows the "Tap Edit…" instruction (which
// is what gets sent, see sweep3-session-summary-note) although today's notes exist.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }) };
const P = await page(ctx, server); await boot(P.p);
const r = await P.p.evaluate(() => {
  const other = Object.keys(noteTemplates).find(k => k !== activeNoteTemplate); const sec = noteTemplates[other].sections[0].id;
  providerNoteDrafts.c1 = { date: _isoToday(), sections: { [sec]: 'Hydrafacial today, extractions on chin' }, templateId: other, ts: Date.now() };
  nav('notes', 'c1'); const notes = S.innerText;
  nav('room', 'c1'); const room = S.innerText;
  nav('session-summary', 'c1'); const sum = (document.getElementById('summary-note') || {}).innerText;
  return { notesShows: /extractions on chin/.test(notes), roomShows: /extractions on chin/.test(room), sum };
});
T.check('notes screen shows today\'s notes', r.notesShows);
T.check('room notes preview shows them too', r.roomShows, JSON.stringify(r));
T.check('summary auto-note is built from them', /extractions/i.test(r.sum || ''), r.sum);
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
