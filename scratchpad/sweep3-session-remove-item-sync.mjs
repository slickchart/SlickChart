// During the summary she takes a homecare step and a product OFF the client's plan. Does the smaller
// plan reach the account, or does the shrink guard hold the whole key back (and with it every later
// change to ANY client's plan from this device)?
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel', _token: 'TOKC2' } }),
  sc_client_homecare: JSON.stringify({ c1: ['SPF daily', 'Retinol at night'] }), sc_client_recs: JSON.stringify({ c1: ['pA', 'pB'] }),
  sc_affiliate_links: JSON.stringify([{ id: 'pA', name: 'Cica Cleanser', active: true }, { id: 'pB', name: 'Vitamin C Serum', active: true }]) };
const P = await page(ctx, server); const cons = []; P.p.on('console', m => { if (/refused to drop/.test(m.text())) cons.push(m.text().slice(0, 170)); });
await boot(P.p);
await P.p.evaluate(() => { nav('session-summary', 'c1'); const i = getClientHomecare('c1').indexOf('Retinol at night'); removeHomecareTag('c1', i); removeSummaryProd('c1', 'pB'); });
await P.p.waitForTimeout(3500);
const hc = JSON.parse(server.sc_client_homecare || '{}').c1 || []; const rc = JSON.parse(server.sc_client_recs || '{}').c1 || [];
const ws = (() => { try { return JSON.parse(server.sc_workspace || '{}'); } catch (e) { return {}; } })();
T.check('removed homecare step is gone on the account', !hc.includes('Retinol at night') && !((ws.clientHomecare || {}).c1 || []).includes('Retinol at night'), 'sc_client_homecare.c1=' + JSON.stringify(hc) + ' ws=' + JSON.stringify((ws.clientHomecare || {}).c1) + ' console=' + cons.join(' || '));
T.check('removed product is gone on the account', !rc.includes('pB') && !((ws.clientRecs || {}).c1 || []).includes('pB'), 'sc_client_recs.c1=' + JSON.stringify(rc) + ' ws=' + JSON.stringify((ws.clientRecs || {}).c1));
await P.p.evaluate(() => { addHomecareTag('c2', 'Dana new step'); });
await P.p.waitForTimeout(3500);
T.check("a later homecare step for ANOTHER client still reaches the account", /Dana new step/.test(server.sc_client_homecare || '') || /Dana new step/.test(server.sc_workspace || ''), (server.sc_client_homecare || '').slice(0, 200));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
