// _expireCommittedDraft() (runs when she opens a client's summary or note editor) DELETES last visit's
// saved draft from sc_note_drafts. The shrink guard refuses any sc_note_drafts upload that drops an id
// not on a delete list — so from then on, for the rest of the session, NO note draft from this device
// reaches the account. Notes she types for the next clients exist only on this device: the other
// device never sees them, and a logout (which purges the offloaded store) or a lost phone loses them.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const old = Date.now() - 21 * 86400000; const iso = new Date(old).toISOString().slice(0, 10);
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel', _token: 'TOKC2' } }),
  sc_note_drafts: JSON.stringify({ c1: { date: iso, sections: { esr1: 'Old visit note' }, templateId: 'serviceRecord', ts: old, committed: true, committedAt: old } }),
  sc_session_summaries: JSON.stringify({ c1: [{ date: 'x', treatment: 'Facial', _draftDate: iso, ts: old, _ts: old, note: 'old' }] }) };
const P = await page(ctx, server); const cons = []; P.p.on('console', m => { if (/note_drafts/.test(m.text())) cons.push(m.text().slice(0, 160)); });
await boot(P.p);
// FIX=1: proposed fix in-page — a dated delete record for retired drafts (sc_deleted_note_drafts in
// _TOMB_OBJ), written before the draft is dropped, so the shrink guard lets the upload through.
if (process.env.FIX) await P.p.evaluate(() => {
  _TOMB_OBJ.sc_deleted_note_drafts = 1;
  const orig = _expireCommittedDraft;
  window._expireCommittedDraft = function (id) {
    const had = !!providerNoteDrafts[id];
    const snap = had ? providerNoteDrafts[id] : null;
    // decide exactly as the original does, but record the delete first
    const tmp = Object.assign({}, providerNoteDrafts); orig(id); const gone = had && !providerNoteDrafts[id];
    if (gone) { providerNoteDrafts[id] = snap; let t = {}; try { t = JSON.parse(localStorage.getItem('sc_deleted_note_drafts') || '{}') || {}; } catch (e) {}
      t[id] = Date.now(); const v = JSON.stringify(t); localStorage.setItem('sc_deleted_note_drafts', v); _pushKeyNow('sc_deleted_note_drafts', v); orig(id); }
  };
});
await P.p.evaluate(() => { nav('session-summary', 'c1'); });   // she opens Cooper's summary: last visit's draft retires
await P.p.waitForTimeout(2500);
await P.p.evaluate(() => { nav('write-note', 'c2'); const t = noteTemplates[activeNoteTemplate] || noteTemplates.soap; const el = document.getElementById('wn-sec-' + t.sections[0].id); el.value = 'Dana: TCA peel 15%, frost level 1'; _snapshotWriteNoteNow('c2'); });
await P.p.waitForTimeout(3500);
T.check("next client's note draft reaches the account", /TCA peel/.test(server.sc_note_drafts || ''), 'server sc_note_drafts=' + (server.sc_note_drafts || '').slice(0, 200) + ' console=' + cons.join(' || '));
await P.p.evaluate(() => { _saveWriteNote('c2'); }); await P.p.waitForTimeout(3500);
T.check("…and still after she taps Save", /TCA peel/.test(server.sc_note_drafts || ''), (server.sc_note_drafts || '').slice(0, 200));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
