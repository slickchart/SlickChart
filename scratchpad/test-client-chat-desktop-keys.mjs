// REGRESSION (2026-11-19): client app on a computer: Enter sends, Shift+Enter does not, a pasted photo is sent. Needs :8899.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client') } });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(800);
const r = await page.evaluate(async () => {
  const calls = []; const real = window.sendClientMsg; window.sendClientMsg = function (imgs) { const t = document.getElementById('cinput'); calls.push({ text: t ? t.value : '', imgs: (imgs || []).length }); if (t) t.value = ''; };
  nav('messages'); await new Promise(r => setTimeout(r, 500));
  const t = document.getElementById('cinput'); if (!t) return { none: true };
  t.value = 'hi';
  t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
  const n1 = calls.length;
  t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const file = new File([Uint8Array.from(atob(png), c => c.charCodeAt(0))], 's.png', { type: 'image/png' });
  const dt = new DataTransfer(); dt.items.add(file);
  const e2 = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(e2, 'clipboardData', { value: dt }); t.dispatchEvent(e2);
  await new Promise(r => setTimeout(r, 1500)); window.sendClientMsg = real;
  return { n1, calls };
});
check('chat opened', !!r.none, r);
check('Shift+Enter does not send', r.n1 !== 0, r);
check('Enter sends the text', !(r.calls[0] && r.calls[0].text === 'hi'), r.calls);
check('a pasted photo is sent', !(r.calls[1] && r.calls[1].imgs === 1), r.calls);
await browser.close(); finish();
