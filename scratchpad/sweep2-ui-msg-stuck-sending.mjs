// She taps Send, and the app is closed / killed (phone call, swipe away) before the delivery call
// answers. The bubble is saved as status 'sending'. On the next launch nothing ever re-drives it:
// _flushPendingProviderMsgs only retries 'pending'/'failed', and a 'sending' bubble is not tappable.
// The client never gets the message and the bubble says "Sending…" forever.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const old = Date.now() - 10 * 60e3;
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }),
  sc_msgstore: JSON.stringify({ c1: [{ from: 'me', text: 'Your aftercare: no retinol for 3 days', time: 'Just now', ts: old, _mid: 'm-stuck', status: 'sending' }] }),
  sc_threads: JSON.stringify([{ id: 'c1', preview: 'Your aftercare', time: 'Just now', ts: old, unread: false }]) };
const sent = [];
const { p, errs } = await page(ctx, server, { handler: async (r, u, m) => { if (u.includes('/api/provider-message')) { sent.push(r.request().postData()); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); return true; } } });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
await p.evaluate(() => nav('chat', 'c1')); await p.waitForTimeout(3000);
const st = await p.evaluate(() => ({ status: (msgStore.c1 || [])[0] && msgStore.c1[0].status, text: document.getElementById('chat-body') && document.getElementById('chat-body').innerText, tappable: !!document.querySelector('#chat-body [onclick*="_retryProviderMsg"]') }));
T.check('a message left "Sending…" by a closed app is re-sent on next open', sent.length >= 1, JSON.stringify({ sent: sent.length, st }));
T.check('…or at least can be tapped to resend', st.tappable || sent.length >= 1, JSON.stringify(st));
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
