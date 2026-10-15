// The app left open (laptop tab, front-desk iPad) never pulls again after boot: Cloud.pull() runs at
// launch and in the failed-pull retry only; visibilitychange refreshes Square, not the account. So a
// device that has been open since yesterday holds yesterday's account, and its next ordinary edit
// uploads that whole stale key over the account (api/store.js overwrites sc_clients and most keys).
// Phone adds a client + a note; laptop (open since before) edits a phone number → account loses them.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles' });
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _uAt: 1 } }), sc_forms: JSON.stringify([]) };
const L = await page(ctx, server), P = await page(ctx2, server);
await L.p.goto('http://localhost:8899/slickchart.html'); await L.p.waitForTimeout(6000);          // laptop opened yesterday
await P.p.goto('http://localhost:8899/slickchart.html'); await P.p.waitForTimeout(6000);          // phone today
await P.p.evaluate(() => { CL.c2 = { name: 'New Phone Client', treatment: 'Peel', _uAt: Date.now() }; saveClients();
  activeNoteTemplate = 'soap'; nav('write-note', 'c1'); document.getElementById('wn-sec-s1').value = 'Phone note today'; _saveWriteNote('c1'); });
await P.p.waitForTimeout(3000);
const mid = { c2: /New Phone Client/.test(server.sc_clients), note: /Phone note today/.test(server.sc_session_summaries || '') };
// laptop, still open: resume (focus) and make an ordinary edit
await L.p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
await L.p.waitForTimeout(2000);
const sees = await L.p.evaluate(() => ({ c2: !!CL.c2, note: JSON.stringify(sessionSummaries.c1 || []).includes('Phone note today') }));
await L.p.evaluate(() => { CL.c1.phone = '555 222 3333'; saveClients(); activeNoteTemplate = 'soap'; nav('write-note', 'c1'); document.getElementById('wn-sec-s2').value = 'Laptop objective'; _saveWriteNote('c1'); });
await L.p.waitForTimeout(3000);
const after = { c2: /New Phone Client/.test(server.sc_clients), note: /Phone note today/.test(server.sc_session_summaries || ''), draft: server.sc_note_drafts && JSON.parse(server.sc_note_drafts).c1 };
T.check('phone edits reached the account', mid.c2 && mid.note, JSON.stringify(mid));
T.check('laptop left open picks up the phone\'s edits on resume', sees.c2 && sees.note, JSON.stringify(sees));
T.check('laptop\'s next edit does not erase the phone\'s new client from the account', after.c2, JSON.stringify(after).slice(0, 300));
T.check('laptop\'s next edit does not erase the phone\'s note from the account', after.note, JSON.stringify(after).slice(0, 300));
// does the account heal when the phone next launches? (only if the phone still has its copy)
await P.p.reload(); await P.p.waitForTimeout(8000);
const healed = { c2: /New Phone Client/.test(server.sc_clients), note: /Phone note today/.test(server.sc_session_summaries || '') };
console.log('INFO after the phone relaunches, account holds:', JSON.stringify(healed));
T.check('no page errors', !L.errs.length && !P.errs.length, L.errs.concat(P.errs).join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
