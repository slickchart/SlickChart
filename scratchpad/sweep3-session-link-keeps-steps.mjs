// Ending a visit with "Send & save as link" (no app) never clears the room's protocol checklist —
// only sendSummary() does. The client's NEXT visit opens with last visit's steps already ticked.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel', _token: 'TOKC2' } }) };
const P = await page(ctx, server); await boot(P.p);
const r = await P.p.evaluate(async () => {
  try { localStorage.setItem('sc_room_protocol_off', 'false'); } catch (e) {}
  nav('room', 'c1'); toggleRoomStep(0); toggleRoomStep(1);
  nav('room', 'c2'); toggleRoomStep(0);
  nav('session-summary', 'c1'); summaryNoteDraft.c1 = 'x'; sendSummary('c1');
  nav('session-summary', 'c2'); summaryNoteDraft.c2 = 'y'; shareSummaryLink('c2');
  await new Promise(r => setTimeout(r, 500));
  try { document.querySelectorAll('[id*="send-sheet"],[id*="sendsheet"]').forEach(e => e.remove()); } catch (e) {}
  _roomClientId = '';                                 // a later day: fresh launch
  nav('room', 'c1'); const s1 = JSON.stringify(roomStepsDone);
  nav('room', 'c2'); const s2 = JSON.stringify(roomStepsDone);
  return { afterApp: s1, afterLink: s2 };
});
T.check('after "Send & save to app" the next visit starts with a clean checklist', r.afterApp === '{}', r.afterApp);
T.check('after "Send & save as link" the next visit starts with a clean checklist', r.afterLink === '{}', r.afterLink);
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
