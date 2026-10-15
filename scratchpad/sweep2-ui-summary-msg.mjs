// Send a session summary when the message delivery fails. sendSummary() pushes its "your summary is
// ready" bubble with NO _mid and NO status, then calls _sendProviderMessageToClient(id,_msg) with no
// _mid. On failure the toast says "tap it to resend" but the bubble shows as delivered and is not
// tappable. And the error path tells her to "tap Send again", which adds a second bubble and a second
// notification with a NEW random idempotency key.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }) };
const pm = [];
const { p, errs, toasts } = await page(ctx, server, { handler: async (r, u) => { if (u.includes('/api/provider-message')) { pm.push(JSON.parse(r.request().postData() || '{}').idem); await r.fulfill({ status: 500, body: 'x' }); return true; } } });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
await p.evaluate(() => { nav('session-summary', 'c1'); summaryNoteDraft.c1 = 'Great session'; sendSummary('c1'); });
await p.waitForTimeout(5000);
await p.evaluate(() => nav('chat', 'c1')); await p.waitForTimeout(500);
const st = await p.evaluate(() => ({ msgs: (msgStore.c1 || []).map(m => ({ s: m.status, mid: !!m._mid })), body: document.getElementById('chat-body').innerText, tappable: !!document.querySelector('#chat-body [onclick*="_retryProviderMsg"]') }));
T.check('a summary notice that did not reach the client is shown as not delivered', /Not delivered/.test(st.body), JSON.stringify(st) + ' toasts=' + toasts.filter(t => /reach|resend/i.test(t)).join(' | '));
T.check('…and can be tapped to resend, as the toast says', st.tappable, JSON.stringify(st));
// she taps Send again, as told
await p.evaluate(() => { nav('session-summary', 'c1'); sendSummary('c1'); }); await p.waitForTimeout(5000);
const n = await p.evaluate(() => (msgStore.c1 || []).filter(m => /session summary/.test(m.text || '')).length);
T.check('sending again does not leave two "summary is ready" bubbles / two keys', n === 1 && new Set(pm).size <= 1, 'bubbles=' + n + ' distinct idem keys=' + new Set(pm).size);
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
