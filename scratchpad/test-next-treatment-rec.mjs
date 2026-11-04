// Recommend next treatment (Maddie, 2026-11-04): the provider picks a service (and, only if she wants,
// weeks out) on the session summary; the client app shows it with a button that opens booking with
// that service chosen. End to end through the real client page.
import { launch, page, mk, boot, BASE } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel', _token: 'TOKC2' } }),
  sc_service_menu: JSON.stringify([{ name: 'Hydrafacial', price: 150 }, { name: 'Dermaplaning', price: 80 }]) };
const P = await page(ctx, server); await boot(P.p);
// The picker shows her catalog, starts at None, and nothing is pre-filled for her.
const ui = await P.p.evaluate(() => { nav('session-summary', 'c1'); const sel = document.getElementById('nr-svc'); return { opts: sel ? [...sel.options].map(o => o.value) : null, val: sel && sel.value, weeks: !!document.getElementById('nr-weeks') }; });
T.check('picker lists her services and starts at None', ui.opts && ui.opts.join('|') === '|Hydrafacial|Dermaplaning' && ui.val === '' && !ui.weeks, JSON.stringify(ui));
await P.p.selectOption('#nr-svc', 'Hydrafacial'); await P.p.waitForTimeout(200);
const wk = await P.p.$('#nr-weeks'); T.check('weeks box appears once a service is picked, empty', !!wk && (await wk.inputValue()) === '');
await P.p.fill('#nr-weeks', '3'); await P.p.dispatchEvent('#nr-weeks', 'change');
await P.p.evaluate(() => { summaryNoteDraft.c1 = 'Lovely glow today.'; sendSummary('c1'); });
await P.p.waitForTimeout(3000);
// c2: picks nothing -> no recommendation
await P.p.evaluate(() => { nav('session-summary', 'c2'); summaryNoteDraft.c2 = 'Good peel.'; sendSummary('c2'); });
await P.p.waitForTimeout(3000);
const prov = await P.p.evaluate(() => ({ c1: CL.c1.nextRec, c2: CL.c2.nextRec || null, s1: (CL.c1.summaries || [])[0] }));
T.check('saved on the client: Hydrafacial, 3 weeks', prov.c1 && prov.c1.svc === 'Hydrafacial' && prov.c1.weeks === 3, JSON.stringify(prov.c1));
T.check('the summary carries it', prov.s1 && prov.s1.nextRec && prov.s1.nextRec.svc === 'Hydrafacial');
T.check('no pick -> no recommendation', !prov.c2, JSON.stringify(prov.c2));
const blob = P.clientPosts.filter(x => x.id === 'c1').pop().data;
T.check('client blob carries nextRec', blob.nextRec && blob.nextRec.svc === 'Hydrafacial' && blob.nextRec.weeks === 3, JSON.stringify(blob.nextRec));
// Re-opening the SAME visit keeps her pick.
const again = await P.p.evaluate(() => { nav('session-summary', 'c1'); const s = document.getElementById('nr-svc'); const w = document.getElementById('nr-weeks'); return [s && s.value, w && w.value]; });
T.check('re-opening the same visit keeps her pick', again[0] === 'Hydrafacial' && again[1] === '3', JSON.stringify(again));

// Client app
const cctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const cp = await cctx.newPage(); const cerr = []; cp.on('pageerror', e => cerr.push(e.message));
const data = Object.assign({}, blob, { services: ['Hydrafacial', 'Dermaplaning'] });
const rec = { ok: true, client: { id: 'c1', name: 'Cooper Howard', data } };
await cp.route('**/api/**', r => { const u = new URL(r.request().url()); const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.pathname === '/api/client-data') return J(rec); if (u.pathname === '/api/client-prefs') return J({ ok: true, prefs: {} }); return J({ ok: true, messages: [] }); });
await cp.goto(BASE + '/slickchart-client.html?c=TOK_c1'); await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await cp.waitForTimeout(1200);
const home = await cp.evaluate(() => { nav('home'); return { line: (document.getElementById('home-next-rec') || {}).innerText || '', html: document.getElementById('S').innerHTML }; });
T.check('home: "Recommended next: Hydrafacial · around <date>"', /Recommended next: Hydrafacial · around [A-Z][a-z]{2} \d+/.test(home.line), home.line);
T.check('home: the button says Book Hydrafacial', /Book Hydrafacial/.test(home.html));
const sum = await cp.evaluate(() => { _summaryIdx = 0; nav('summary'); return (document.getElementById('next-rec') || {}).innerText || ''; });
T.check('summary: recommends next card with weeks and date', /RECOMMENDS NEXT/i.test(sum) && /Hydrafacial/.test(sum) && /In about 3 weeks, around/.test(sum), sum);
await cp.evaluate(() => { activeProvider().services = ['Hydrafacial', 'Dermaplaning']; _bookNextRec(); }); await cp.waitForTimeout(400);
const picked = await cp.evaluate(() => { const s = document.getElementById('rebook-svc'); return s && s.value; });
T.check('Book it opens booking with Hydrafacial chosen', picked === 'Hydrafacial', String(picked));
// Old shape (no nextRec from an older provider build): nothing shows, nothing breaks.
delete data.nextRec; delete data.summaries[0].nextRec;
await cp.reload(); await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await cp.waitForTimeout(1200);
const none = await cp.evaluate(() => { nav('home'); const h = !!document.getElementById('home-next-rec'); _summaryIdx = 0; nav('summary'); return h || !!document.getElementById('next-rec'); });
T.check('no recommendation sent -> nothing shows', !none);
await cp.screenshot({ path: process.env.SHOT || '/tmp/next-rec.png' });
T.check('no page errors', !P.errs.length && !cerr.length, P.errs.concat(cerr).join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
