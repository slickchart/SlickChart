// REGRESSION (2026-11-18): client app on a computer, a photo dropped on the page opened the file in place of the app. Needs :8899.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client') } });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
const r = await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'face.jpg', { type: 'image/jpeg' }));
  const d = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }); document.body.dispatchEvent(d); return d.defaultPrevented; });
check('a dropped file is left to open in place of the app', !r, { blocked: r });
await browser.close(); finish();
