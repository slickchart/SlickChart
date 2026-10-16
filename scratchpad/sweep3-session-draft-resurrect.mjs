// After "Send & save", _storeSummary() DELETES summaryNoteDraft[id] / summaryObsDraft[id]. But
// _mergeSummaryDrafts() assumes a cleared draft stays as '' (its comment says so) and keeps any
// one-sided entry. So the visit's note comes back on the next pull — from the account copy (if the
// shrunk upload is held/raced) or from the provider's OTHER device which still holds it — and the
// NEXT visit's summary opens pre-filled with LAST visit's note, which goes out again on Send.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }) };
// Device A (computer) and device B (phone) share the account.
const A = await page(ctx, server);
await boot(A.p);
if (process.env.FIX) await A.p.evaluate(() => { window._storeSummary = eval('(' + _storeSummary.toString().replace('delete summaryNoteDraft[id];', 'summaryNoteDraft[id]=null;').replace('delete summaryObsDraft[id];', 'summaryObsDraft[id]=null;') + ')'); });
await A.p.evaluate(() => { nav('session-summary', 'c1'); editSummaryNote('c1'); document.getElementById('note-edit-ta').value = 'Lovely glow today, see you in 4 weeks.'; _flushOpenSummaryNote('c1'); renderSessionSummary('c1'); });
await A.p.waitForTimeout(2500);
T.check('draft reached the account', /Lovely glow/.test(server.sc_summary_drafts || ''), server.sc_summary_drafts);
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const B = await page(ctx2, server);
await boot(B.p);
T.check('phone has the draft', await B.p.evaluate(() => summaryNoteDraft.c1 === 'Lovely glow today, see you in 4 weeks.'));
// Computer sends the summary.
await A.p.evaluate(() => { nav('session-summary', 'c1'); sendSummary('c1'); });
await A.p.waitForTimeout(3000);
T.check('after send the account no longer holds the draft', !/Lovely glow/.test(server.sc_summary_drafts || ''), server.sc_summary_drafts);
// Phone comes back to the foreground -> pull.
await B.p.evaluate(async () => { try { await Cloud.pull(); } catch (e) {} });
await B.p.waitForTimeout(2500);
T.check('phone pull does not push the sent draft back up', !/Lovely glow/.test(server.sc_summary_drafts || ''), server.sc_summary_drafts);
// Computer pulls again.
await A.p.evaluate(async () => { try { await Cloud.pull(); } catch (e) {} });
await A.p.waitForTimeout(1500);
const st = await A.p.evaluate(() => { nav('session-summary', 'c1'); return { draft: summaryNoteDraft.c1, shown: (document.getElementById('summary-note') || {}).innerText }; });
T.check('next visit summary on the computer is NOT pre-filled with the sent note', !/Lovely glow/.test(st.shown || ''), JSON.stringify(st));
// Computer relaunches (next appointment, next morning).
await A.p.close();
const A2 = await page(ctx, server); const cons=[]; A2.p.on('console', m => { if (/held|shrink|summary_drafts/i.test(m.text())) cons.push(m.text()); });
await boot(A2.p);
const st2 = await A2.p.evaluate(() => { nav('session-summary', 'c1'); return { draft: summaryNoteDraft.c1, shown: (document.getElementById('summary-note') || {}).innerText }; });
T.check('after relaunch the next visit summary is NOT pre-filled with the sent note', !/Lovely glow/.test(st2.shown || ''), JSON.stringify(st2) + ' console=' + cons.join(' || '));
T.check('no page errors', !A.errs.length && !B.errs.length && !A2.errs.length, A.errs.concat(B.errs, A2.errs).join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
