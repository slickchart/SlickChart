// Two appointments back to back: nothing from client A's session may show up in client B's.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ a: { name: 'Amy Adams', treatment: 'Facial', _token: 'TA' }, bb: { name: 'Bea Brown', treatment: 'Peel', _token: 'TB' } }) };
const P = await page(ctx, server); await boot(P.p);
const r = await P.p.evaluate(() => {
  nav('room', 'a'); roomProtocolOff = false; try { localStorage.setItem('sc_room_protocol_off', 'false'); } catch (e) {} renderRoom('a');
  if (protocols.length > 1) pickRoomProtocol(1); toggleRoomStep(0); toggleRoomStep(1);
  _voiceClientId = 'a'; _voiceSave('Amy private note: rosacea flare'); try { _voiceClose(); } catch (e) {}
  nav('session-summary', 'a'); summaryToggles.metrics = true; renderSessionSummary('a');
  const obs = document.getElementById('summary-obs'); obs.value = 'Amy obs'; obs.dispatchEvent(new Event('input'));
  addHomecareTag('a', 'Amy step'); summarySendOn.a = false;
  // B arrives
  nav('room', 'bb'); const roomB = S.innerText; const stepsB = JSON.stringify(roomStepsDone); const protoB = roomProtocol;
  nav('session-summary', 'bb'); const sumB = S.innerText;
  return { roomB, stepsB, protoB, sumB, sendOnB: summarySendOn.bb };
});
T.check('B room: no A protocol steps carried', r.stepsB === '{}' && r.protoB === 0, r.stepsB + ' proto=' + r.protoB);
T.check('B room: no A notes preview', !/Amy private/.test(r.roomB));
T.check('B summary: none of A\'s note/obs/homecare', !/Amy/.test(r.sumB), r.sumB.slice(0, 300));
T.check('B summary: send toggle defaults on', r.sendOnB === true);
// After a reload, A's room still has A's steps (persisted per client)
await P.p.reload(); await P.p.waitForTimeout(6000);
const r2 = await P.p.evaluate(() => { nav('room', 'a'); return { steps: JSON.stringify(roomStepsDone), proto: roomProtocol, notes: _noteSummaryPreview('a'), obs: summaryObsDraft.a, hc: getClientHomecare('a') }; });
T.check('reload mid-session: A protocol steps, note, obs and homecare all survive', /true/.test(r2.steps) && /rosacea/.test(r2.notes) && r2.obs === 'Amy obs' && r2.hc.includes('Amy step'), JSON.stringify(r2));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
