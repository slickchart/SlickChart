// REGRESSION (2026-11-19): email and phone boxes opened the plain keyboard (an iPhone capitalised the
// first letter of an email), Enter did nothing on a computer, and the client's edit box put the saved
// value into HTML unescaped. Client side needs the :8899 server; provider side runs from the file.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
// ---- client app
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client', { email: 'a"b@ex.com' }) } });
  const sent = [];
  await page.route('**/api/client-submit', r => { const b = JSON.parse(r.request().postData() || '{}'); if (b.kind === 'contact') sent.push(b.payload); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(800);
  await page.evaluate(() => editField('email', 'Email', 'a"b<i>@ex.com'));
  const em = await page.evaluate(() => { const i = document.getElementById('edit-input'); return { type: i.type, im: i.inputMode, cap: i.getAttribute('autocapitalize'), v: i.value, italic: !!document.querySelector('#edit-field-modal i:not(.ti)') }; });
  check('client email box is an email keyboard with no auto-capitals', !(em.type === 'email' && em.im === 'email' && em.cap === 'off'), em);
  check('client edit box shows the saved value as text, not markup', em.italic, em);
  await page.evaluate(() => document.getElementById('edit-field-modal').remove());
  await page.evaluate(() => editField('phone', 'Phone', ''));
  const ph = await page.evaluate(() => { const i = document.getElementById('edit-input'); return { type: i.type, im: i.inputMode }; });
  check('client phone box is a phone keypad', !(ph.type === 'tel' && ph.im === 'tel'), ph);
  await page.fill('#edit-input', '555-222-3333'); await page.press('#edit-input', 'Enter'); await page.waitForTimeout(1500);
  check('Enter saves the phone', !(sent.some(p => p && p.phone === '555-222-3333') && !(await page.$('#edit-field-modal'))), sent);
  await ctx.close();
}
await browser.close(); finish();
