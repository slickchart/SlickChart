// REGRESSION (2026-11-18): client message ids restarted at "cm1" each open, so a failed message kept
// from last time and a new failed one shared an id, and Tap to retry on the new one resent the OLD one.
// Needs :8899.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client') } });
let down = true; const sent = [];
await page.route('**/api/client-submit', r => { const b = JSON.parse(r.request().postData() || '{}'); if (b.kind === 'message') sent.push({ down, text: b.payload && b.payload.text });
  if (down && b.kind === 'message') return r.abort('internetdisconnected'); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
const boot = async () => { await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(1200); };
const send = async t => { await page.evaluate(() => nav('messages')); await page.waitForTimeout(400); await page.evaluate(t => { const i = document.getElementById('cinput'); i.value = t; sendClientMsg(); }, t); await page.waitForTimeout(3500); };
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' }); await boot();
await send('first one');
await page.reload({ waitUntil: 'load' }); await boot();
await send('second one');
const ids = await page.evaluate(() => messages.filter(m => m.from === 'me').map(m => ({ id: m._id, t: m.text, s: m.status })));
check('two failed messages share an id', new Set(ids.map(x => x.id)).size !== ids.length, ids);
down = false; sent.length = 0;
const newer = ids.find(x => x.t === 'second one');
await page.evaluate(id => retryClientMsg(id), newer && newer.id); await page.waitForTimeout(2500);
check('Tap to retry on the new message sends a different one', !(sent.length === 1 && sent[0].text === 'second one'), sent);
await browser.close(); finish();
