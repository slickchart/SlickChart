// Room photos: take BEFORE and AFTER through the real buttons, then reload mid-session, then send the
// summary. Photos must persist, show in the room, and the client blob must carry their refs.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel', _token: 'TOKC2' } }) };
const files = []; const P = await page(ctx, server, { handler: async (r, u, m) => { if ((u.includes('/api/guide-file') || u.includes('/api/file')) && m !== 'GET') { files.push(1); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); return true; } } });
await boot(P.p);
await P.p.evaluate(() => nav('room', 'c1'));
for (const phase of ['BEFORE', 'AFTER']) {
  const [fc] = await Promise.all([P.p.waitForEvent('filechooser'), P.p.locator('#room-photos button', { hasText: 'Take ' + phase }).click()]);
  await fc.setFiles('/home/user/SlickChart/scratchpad/sweep3-test-photo.png'); await P.p.waitForTimeout(1500);
}
const s1 = await P.p.evaluate(() => ({ n: (capturedPhotos.c1 || []).length, room: document.getElementById('room-photos').innerText, c2: (capturedPhotos.c2 || []).length }));
T.check('both photos captured and the room shows both', s1.n === 2 && /Both captured/.test(s1.room), JSON.stringify(s1));
T.check('nothing filed under another client', s1.c2 === 0);
await P.p.reload(); await P.p.waitForTimeout(6000);
const s2 = await P.p.evaluate(() => { nav('room', 'c1'); return { n: (capturedPhotos.c1 || []).length, room: document.getElementById('room-photos').innerText }; });
T.check('reload mid-session: photos still there', s2.n === 2 && /Both captured/.test(s2.room), JSON.stringify(s2));
await P.p.evaluate(() => { nav('session-summary', 'c1'); summaryNoteDraft.c1 = 'x'; sendSummary('c1'); }); await P.p.waitForTimeout(3500);
const blob = P.clientPosts.filter(x => x.id === 'c1').pop().data;
T.check('client blob carries the shared before/after refs', (blob.progressPhotos || []).length === 2, JSON.stringify(blob.progressPhotos));
T.check('photo bytes were uploaded for the client to fetch', files.length >= 2, 'uploads=' + files.length);
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
