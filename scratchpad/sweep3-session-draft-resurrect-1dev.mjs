// One device, no phone needed: the note typed for a visit's summary is deleted locally on Send, the
// shrunk sc_summary_drafts upload is held back by the shrink guard (no delete record for it), the
// account keeps the note, and the next launch pulls it back. The NEXT visit's summary for that client
// opens with LAST visit's note and Send delivers it again.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }) };
const A = await page(ctx, server); const cons = []; A.p.on('console', m => { if (/summary_drafts|held|shrink/i.test(m.text())) cons.push(m.text().slice(0, 200)); });
await boot(A.p);
// FIX=1 applies the proposed fix in-page: keep the key with a null (stamped) value instead of deleting it.
if (process.env.FIX) await A.p.evaluate(() => { window._storeSummary = eval('(' + _storeSummary.toString().replace('delete summaryNoteDraft[id];', 'summaryNoteDraft[id]=null;').replace('delete summaryObsDraft[id];', 'summaryObsDraft[id]=null;') + ')'); });
await A.p.evaluate(() => { nav('session-summary', 'c1'); editSummaryNote('c1'); document.getElementById('note-edit-ta').value = 'Lovely glow today, see you in 4 weeks.'; _flushOpenSummaryNote('c1'); renderSessionSummary('c1'); });
await A.p.waitForTimeout(2500);
await A.p.evaluate(() => { sendSummary('c1'); });
await A.p.waitForTimeout(4000);
T.check('the delete reached the account', !/Lovely glow/.test(server.sc_summary_drafts || ''), server.sc_summary_drafts + ' console=' + cons.join(' || '));
// Next client, same afternoon: a draft typed for Dana must still reach the account.
await A.p.evaluate(() => { CL.c2 = { name: 'Dana Lee', treatment: 'Peel' }; nav('session-summary', 'c2'); editSummaryNote('c2'); document.getElementById('note-edit-ta').value = 'Dana note typed after'; _flushOpenSummaryNote('c2'); renderSessionSummary('c2'); });
await A.p.waitForTimeout(3000);
T.check('a draft typed for the NEXT client still reaches the account', /Dana note typed after/.test(server.sc_summary_drafts || ''), server.sc_summary_drafts);
await A.p.close();
const A2 = await page(ctx, server); await boot(A2.p);
const st = await A2.p.evaluate(() => { nav('session-summary', 'c1'); return (document.getElementById('summary-note') || {}).innerText; });
T.check('next launch: summary for this client is not pre-filled with the note already sent', !/Lovely glow/.test(st), st);
T.check('no page errors', !A.errs.length && !A2.errs.length, A.errs.concat(A2.errs).join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
