// Double-tap the session summary's Send buttons (a nervous provider between clients). Counts summaries
// stored / messages / client-blob posts, and records what the SECOND tap landed on after the screen
// changed underneath it.
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', treatment: 'Peel' } }) };
const pm = []; const P = await page(ctx, server, { handler: async (r, u) => { if (u.includes('/api/provider-message')) { pm.push(JSON.parse(r.request().postData() || '{}')); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); return true; } } });
await boot(P.p);
await P.p.evaluate(() => { nav('session-summary', 'c1'); summaryNoteDraft.c1 = 'Double tap test'; renderSessionSummary('c1'); });
const btn = P.p.locator('button:has-text("Send & save to")'); await btn.scrollIntoViewIfNeeded();
const box = await btn.boundingBox();
await P.p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await P.p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await P.p.waitForTimeout(3500);
const st = await P.p.evaluate(() => ({ screen: _navCur && _navCur.screen, sums: (sessionSummaries.c1 || []).length, csum: (CL.c1.summaries || []).length, msgs: (msgStore.c1 || []).filter(m => /session summary/.test(m.text || '')).length, overlays: [...document.querySelectorAll('body > div')].filter(d => getComputedStyle(d).position === 'fixed' && d.offsetHeight > 200).map(d => d.id) }));
T.check('double tap Send: one summary, one message', st.sums === 1 && st.csum === 1 && st.msgs === 1 && new Set(pm.map(m => m.idem)).size <= 1, JSON.stringify(st) + ' pm=' + pm.length);
console.log('second tap landed on screen:', st.screen, 'overlays:', st.overlays);
// Send-as-link for a client with NO token yet: the screen stays while the token is minted.
await P.p.evaluate(() => { nav('session-summary', 'c2'); summaryNoteDraft.c2 = 'Link test'; renderSessionSummary('c2'); });
const lb = P.p.locator('button:has-text("Send & save as link")'); await lb.scrollIntoViewIfNeeded(); const lbox = await lb.boundingBox();
await P.p.mouse.click(lbox.x + lbox.width / 2, lbox.y + lbox.height / 2); await P.p.mouse.click(lbox.x + lbox.width / 2, lbox.y + lbox.height / 2);
await P.p.waitForTimeout(3000);
const st2 = await P.p.evaluate(() => ({ sheets: document.querySelectorAll('#send-sheet, [id^="send-sheet"]').length, sums: (sessionSummaries.c2 || []).length }));
T.check('double tap Send-as-link (no token yet): one sheet, one summary', st2.sheets <= 1 && st2.sums === 1, JSON.stringify(st2));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
