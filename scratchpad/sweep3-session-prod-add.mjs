// Session summary -> "Recommended for you" -> "+ Add" -> tap a product. The Add button calls
// toggleSummaryProdPicker() with NO client id, which rebuilds the list as _recPickerRows(undefined),
// so every row is addSummaryProd('undefined', …): the product lands in clientRecs['undefined'], the
// screen re-renders as renderSessionSummary('undefined') — which falls back to the FIRST client on the
// roster — and Send on that screen throws.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c0: { name: 'Aaron First', treatment: 'Wax', _token: 'T0' }, c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }),
  sc_affiliate_links: JSON.stringify([{ id: 'pA', name: 'Cica Cleanser', brand: 'Acme', active: true, icon: '🧴' }]) };
const P = await page(ctx, server); await boot(P.p);
await P.p.evaluate(() => { if (!affiliateLinks.find(a => a.id === 'pA')) affiliateLinks.push({ id: 'pA', name: 'Cica Cleanser', brand: 'Acme', active: true, icon: '🧴' }); nav('session-summary', 'c1'); });
const add = P.p.locator('button:has-text("Add")', { has: P.p.locator('i.ti-plus') }).first();
await P.p.locator('#S').getByText('Recommended for you').scrollIntoViewIfNeeded();
await P.p.evaluate(() => { const b = [...document.querySelectorAll('#S button')].find(x => /toggleSummaryProdPicker/.test(x.getAttribute('onclick') || '')); b.click(); });
await P.p.waitForTimeout(300);
await P.p.locator('#summary-prod-list div[onclick]').first().click();
await P.p.waitForTimeout(800);
const st = await P.p.evaluate(() => ({ recsC1: clientRecs.c1 || [], recsUndef: clientRecs['undefined'] || null, header: S.innerText.slice(0, 40), navData: _navCur && _navCur.data }));
T.check('tapping a product adds it to THIS client', (st.recsC1 || []).includes('pA'), JSON.stringify(st));
T.check('the screen still shows the same client', /Cooper Howard/.test(st.header), JSON.stringify(st));
// She taps Send on the screen in front of her.
await P.p.evaluate(() => { const b = [...document.querySelectorAll('#S button')].find(x => /sendSummary\(/.test(x.getAttribute('onclick') || '')); b.click(); });
await P.p.waitForTimeout(1500);
const st2 = await P.p.evaluate(() => ({ c1: (CL.c1.summaries || []).length, c0: (CL.c0.summaries || []).length, screen: _navCur.screen }));
T.check('Send on that screen sends a summary to someone (not a silent throw)', st2.c1 + st2.c0 > 0, JSON.stringify(st2) + ' errs=' + P.errs.join(' | '));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
