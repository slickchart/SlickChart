// Two tabs of the app in one browser (common on a laptop). They share localStorage but nothing listens
// for the other tab's writes (no 'storage' handler for sc_* keys, no re-pull). Tab A adds a client and a
// chart note; tab B, opened earlier, edits another client: its stale in-memory CL is written over the
// shared disk copy AND uploaded, so tab A's work disappears from both.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _uAt: 1 }, c3: { name: 'Third Person', _uAt: 1 } }) };
const B = await page(ctx, server); await B.p.goto('http://localhost:8899/slickchart.html'); await B.p.waitForTimeout(6000);
const A = await page(ctx, server); await A.p.goto('http://localhost:8899/slickchart.html'); await A.p.waitForTimeout(6000);
await A.p.evaluate(() => { CL.c2 = { name: 'Added In Tab A', _uAt: Date.now() }; CL.c1.notes = 'Tab A: allergic to latex'; saveClients(); });
await A.p.waitForTimeout(2000);
await B.p.evaluate(() => { CL.c3.phone = '555 999 0000'; saveClients(); });
await B.p.waitForTimeout(2500);
const disk = await A.p.evaluate(() => { const c = JSON.parse(localStorage.getItem('sc_clients') || '{}'); return { c2: !!c.c2, latex: /latex/.test((c.c1 || {}).notes || '') }; });
const acct = { c2: /Added In Tab A/.test(server.sc_clients), latex: /latex/.test(server.sc_clients) };
T.check('tab B\'s edit does not erase tab A\'s new client / note on this device', disk.c2 && disk.latex, JSON.stringify(disk));
T.check('…or on the account', acct.c2 && acct.latex, JSON.stringify(acct));
T.check('no page errors', !A.errs.length && !B.errs.length, A.errs.concat(B.errs).join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
