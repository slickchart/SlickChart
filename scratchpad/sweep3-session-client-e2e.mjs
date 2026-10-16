// End to end: the provider ends a session and sends the summary (multi-paragraph note + observation,
// homecare, a product with a reason, an aftercare guide); the CLIENT app receives exactly that blob.
// Checks what the client sees, live update while open, and refresh.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { launch, page, mk, boot, BASE } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1', email: 'c@x.com' } }),
  sc_affiliates: JSON.stringify([{ id: 'pA', name: 'Cica Cleanser', brand: 'Acme', icon: '🧴', active: true, url: 'https://ex.com/cica' }]) };
const P = await page(ctx, server);
await boot(P.p);
await P.p.evaluate(() => {
  if (!affiliateLinks.find(a => a.id === 'pA')) affiliateLinks.push({ id: 'pA', name: 'Cica Cleanser', brand: 'Acme', icon: '🧴', active: true, url: 'https://ex.com/cica' });
  nav('room', 'c1'); _summaryFrom = 'room'; nav('session-summary', 'c1');
  summaryNoteDraft.c1 = 'Your skin looked calmer today.\n\nKeep up the SPF and drink water.';
  summaryToggles.metrics = true; summaryObsDraft.c1 = 'Less redness on the cheeks';
  addHomecareTag('c1', 'SPF 50 every morning'); addHomecareTag('c1', 'Gentle cleanser at night');
  clientRecs.c1 = ['pA']; _setRecReason('c1', 'pA', 'Soothes the barrier');
  if (typeof resources !== 'undefined' && resources.length) addSummaryGuide('c1', 'guide', resources[0].id);
  renderSessionSummary('c1');
});
await P.p.evaluate(() => sendSummary('c1')); await P.p.waitForTimeout(3500);
const blob = P.clientPosts.filter(x => x.id === 'c1').pop().data;
T.check('provider: blob carries the summary', blob && blob.summaries && blob.summaries.length === 1, JSON.stringify(blob && blob.summaries));
// ---- client app
const cctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const cp = await cctx.newPage(); const cerr = []; cp.on('pageerror', e => cerr.push(e.message));
const rec = { ok: true, client: { id: 'c1', name: 'Cooper Howard', email: 'c@x.com', data: JSON.parse(JSON.stringify(blob)) } };
await cp.route('**/api/**', async r => { const u = new URL(r.request().url()); const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.pathname === '/api/client-data') return J(rec); if (u.pathname === '/api/client-prefs') return J({ ok: true, prefs: {} });
  if (u.pathname === '/api/client-messages') return J({ ok: true, messages: [] }); return J({ ok: true }); });
await cp.goto(BASE + '/slickchart-client.html?c=TOK_c1'); await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await cp.waitForTimeout(1500);
const view = await cp.evaluate(() => { _summaryIdx = 0; nav('summary'); const s = document.getElementById('S');
  const noteDiv = [...s.querySelectorAll('div')].find(d => /Your skin looked calmer/.test(d.innerHTML) && d.children.length === 0);
  return { text: s.innerText, noteHTML: noteDiv && noteDiv.innerHTML, ws: noteDiv && getComputedStyle(noteDiv).whiteSpace, sw: document.documentElement.scrollWidth };
});
T.check('client: note paragraphs keep their line breaks (not run together)', /calmer today\.\s*\n/.test(view.text), JSON.stringify({ html: view.noteHTML, ws: view.ws }));
T.check('client: observation shows', /Less redness/.test(view.text));
T.check('client: homecare shows', /SPF 50 every morning/.test(view.text) && /Gentle cleanser/.test(view.text));
T.check('client: product + reason show', /Cica Cleanser/.test(view.text) && /Soothes the barrier/.test(view.text), view.text.slice(0, 1200));
T.check('client: no horizontal overflow at 390px', view.sw <= 390, 'scrollWidth=' + view.sw);
console.log('---- client summary screen ----\n' + view.text.slice(0, 1500));
// Provider edits the same-day summary and re-sends: open app should update on next poll.
await P.p.evaluate(() => { nav('session-summary', 'c1'); summaryNoteDraft.c1 = 'EDITED note'; sendSummary('c1'); }); await P.p.waitForTimeout(3500);
rec.client.data = JSON.parse(JSON.stringify(P.clientPosts.filter(x => x.id === 'c1').pop().data));
T.check('provider: re-send same day replaces (not duplicates) the summary', rec.client.data.summaries.length === 1, JSON.stringify(rec.client.data.summaries.map(s => s.note)));
await cp.evaluate(() => _pollRealClient()); await cp.waitForTimeout(1200);
const upd = await cp.evaluate(() => { _summaryIdx = 0; nav('summary'); return document.getElementById('S').innerText; });
T.check('client: open app shows the edited note after poll', /EDITED note/.test(upd), upd.slice(0, 300));
await cp.reload(); await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await cp.waitForTimeout(1500);
const rl = await cp.evaluate(() => { _summaryIdx = 0; nav('summary'); return document.getElementById('S').innerText; });
T.check('client: survives refresh', /EDITED note/.test(rl));
T.check('no page errors (provider/client)', !P.errs.length && !cerr.length, P.errs.concat(cerr).join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
