// REGRESSION (2026-11-18): a client changes their phone while the provider can't be reached. The app
// said "will retry" and never did, so the provider kept the old number. Now the next open sends it.
// Needs the :8899 server.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const opts = { records: { TOK: clientRecord('c1', 'Cara Client') } };
await mockApi(page, opts);
let down = true; const sent = [];
await page.route('**/api/client-submit', r => { const b = JSON.parse(r.request().postData() || '{}'); if (b.kind === 'contact') sent.push({ down, phone: b.payload && b.payload.phone });
  if (down && b.kind === 'contact') return r.abort('internetdisconnected'); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
const boot = async () => { await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(800); };
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' }); await boot();
await page.evaluate(() => { const m = document.createElement('div'); m.id = 'edit-field-modal'; m.innerHTML = '<input id="edit-input" value="555-222-3333">'; document.body.appendChild(m); saveField('phone'); });
await page.waitForTimeout(3500);
check('the failed change was attempted', !sent.some(x => x.down && x.phone === '555-222-3333'), sent);
down = false;
await page.reload({ waitUntil: 'load' }); await boot(); await page.waitForTimeout(4500);
check('the next open does not send the unsent phone to the provider', !sent.some(x => !x.down && x.phone === '555-222-3333'), sent);
const n = sent.filter(x => !x.down).length;
await page.reload({ waitUntil: 'load' }); await boot(); await page.waitForTimeout(4500);
check('once it went, later opens send it again', sent.filter(x => !x.down).length !== n, sent);
await browser.close(); finish();
