// The client app's message box kept nothing: a message half-written, then a tap on Home (or a check of
// her journey) and back, and it was gone (2026-11-19 phone sweep). It now comes back until it is sent,
// and a sent message never comes back.
//   PLAYWRIGHT_BROWSERS_PATH=<webkit> node scratchpad/test-client-msg-draft.mjs   (needs :8899)
import { BASE, launch, clientRecord, mockApi } from './sweep2-client-lib.mjs';
const res = []; const ok = (c, m, d) => { res.push(c); console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); };
const b = await launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errs = []; page.on('pageerror', e => errs.push(e.message));
const rec = clientRecord('c1', 'Jo Rivera', { providerName: 'Ashley', studio: 'Rose Glow', services: ['Facial'] });
const log = await mockApi(page, { records: { TOK: rec }, messages: { TOK: [{ id: 'm1', from: 'provider', text: 'Hi!', ts: Date.now() }] } });
await page.goto(BASE + '?c=TOK'); await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(800);
const box = () => page.evaluate(() => (document.getElementById('cinput') || {}).value);
await page.evaluate(() => nav('messages')); await page.waitForTimeout(400);
await page.click('#cinput'); await page.keyboard.type('Can I move to Friday?');
await page.evaluate(() => nav('home')); await page.waitForTimeout(300); await page.evaluate(() => nav('journey')); await page.waitForTimeout(300);
await page.evaluate(() => nav('messages')); await page.waitForTimeout(400);
ok(await box() === 'Can I move to Friday?', 'a half-written message is still there after leaving the chat', await box());
await page.evaluate(() => renderMessages()); await page.waitForTimeout(200);
ok(await box() === 'Can I move to Friday?', 'and after the chat redraws (a new message arriving)', await box());
await page.click('button[aria-label="Send message"]'); await page.waitForTimeout(1500);
ok(await box() === '', 'sending empties the box', await box());
const sent = await page.evaluate(() => messages.filter(m => m.from === 'me' && m.text === 'Can I move to Friday?').length);
ok(sent === 1, 'the message was sent once', String(sent));
await page.evaluate(() => nav('home')); await page.waitForTimeout(300); await page.evaluate(() => nav('messages')); await page.waitForTimeout(400);
ok(await box() === '', 'a sent message never comes back into the box', await box());
ok(!errs.length, 'no page errors', errs.join(' | '));
await b.close();
const f = res.filter(x => !x).length; console.log(f ? f + ' FAILED' : 'ALL PASS'); process.exit(f ? 1 : 0);
