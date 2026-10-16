// The provider turns sections OFF in "Customize card" ("Preview, exactly what X will receive"), sends,
// and the client's summary screen still shows them:
//  - "Recommended products" off: renderLatestSummary() (client) shows the provider's LIVE product plan
//    (d.products) whenever it is non-empty, ignoring that this summary was sent with products:[].
//    Also _storeSummary() auto-creates a product plan from the notes even with products OFF.
//  - "Personal note" off: the client still gets an empty "A NOTE FROM" card.
//  - "Next appointment" off: the client still gets the Next appointment card.
import { launch, page, mk, boot, BASE } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel', _token: 'TOKC2' } }) };
const P = await page(ctx, server); await boot(P.p);
// FIX=1 (provider half): the entry records what she turned off; auto-suggest only when products are on.
if (process.env.FIX) await P.p.evaluate(() => {
  window._storeSummary = eval('(' + _storeSummary.toString()
    .replace("if(!(clientRecs[id]||[]).length){", "if(summaryToggles.products&&!(clientRecs[id]||[]).length){")
    .replace("guides:_guides,ts,_draftDate:_dd,", "guides:_guides,ts,_draftDate:_dd,hide:{note:!summaryToggles.note,products:!summaryToggles.products,appointment:!summaryToggles.appointment},") + ')');
});
await P.p.evaluate(() => {
  affiliateLinks.push({ id: 'pA', name: 'Cica Barrier Cleanser', brand: 'Acme', icon: '🧴', active: true, url: 'https://ex.com/cica' });
  clientRecs.c1 = ['pA'];
  nav('session-summary', 'c1'); summaryNoteDraft.c1 = '';
  summaryToggles.products = false; summaryToggles.note = false; summaryToggles.appointment = false; renderSessionSummary('c1');
  sendSummary('c1');
});
await P.p.waitForTimeout(3000);
// auto-suggest with products OFF, for a client with no plan
await P.p.evaluate(() => { nav('session-summary', 'c2'); summaryNoteDraft.c2 = 'Use the Cica Barrier Cleanser nightly.'; sendSummary('c2'); });
await P.p.waitForTimeout(3000);
const c2recs = await P.p.evaluate(() => clientRecs.c2 || []);
T.check('products OFF: sending does not create a product plan for the client', !c2recs.length, JSON.stringify(c2recs));
const blob = P.clientPosts.filter(x => x.id === 'c1').pop().data;
const cctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const cp = await cctx.newPage(); const cerr = []; cp.on('pageerror', e => cerr.push(e.message));
const rec = { ok: true, client: { id: 'c1', name: 'Cooper Howard', data: blob } };
await cp.route('**/api/**', r => { const u = new URL(r.request().url()); const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.pathname === '/api/client-data') return J(rec); if (u.pathname === '/api/client-prefs') return J({ ok: true, prefs: {} }); return J({ ok: true, messages: [] }); });
// FIX=1 (client half): honour s.hide, keep line breaks in the note.
if (process.env.FIX) await cp.addInitScript(() => { const iv = setInterval(() => { if (typeof renderLatestSummary === 'function') { clearInterval(iv);
  const src = renderLatestSummary.toString()
    .replace("const products=_prodList(", "const _hide=(s&&s.hide)||{};const products=_hide.products?[]:_prodList(")
    .replace('<!-- Note from ${_txt(client.providerFirst)} -->', '${(_hide.note||!String(s.note||"").trim())?"":`')
    .replace('<div style="font-size:14px;color:var(--c-ink);line-height:1.8;">${_txt(s.note)}</div>\n  </div>', '<div style="font-size:14px;color:var(--c-ink);line-height:1.8;white-space:pre-line;">${_txt(s.note)}</div>\n  </div>`}')
    .replace('<!-- Next appointment -->', '${_hide.appointment?"":`').replace('<!-- Ask about your aftercare', '`}\n  <!-- Ask about your aftercare');
  window.renderLatestSummary = eval('(' + src + ')'); } }, 5); });
await cp.goto(BASE + '/slickchart-client.html?c=TOK_c1'); await cp.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await cp.waitForTimeout(1200);
const txt = await cp.evaluate(() => { _summaryIdx = 0; nav('summary'); return document.getElementById('S').innerText; });
T.check('client: summary sent with products OFF shows no "Recommended for you"', !/RECOMMENDED FOR YOU/i.test(txt), 'summary.products=' + JSON.stringify(blob.summaries[0].products) + ' live d.products=' + JSON.stringify((blob.products || []).map(p => p.name)));
T.check('client: note OFF -> no empty "A note from" card', !/A NOTE FROM/i.test(txt), txt.slice(0, 250));
T.check('client: next appointment OFF -> no Next appointment card', !/NEXT APPOINTMENT/i.test(txt));
T.check('no page errors', !P.errs.length && !cerr.length, P.errs.concat(cerr).join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
