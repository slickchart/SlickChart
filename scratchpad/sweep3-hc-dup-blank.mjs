// sweep3: the client checklist keys a step by its TEXT. Two identical lines (the provider's in-place
// edit has no de-dupe, unlike "+ Add") tick together, and a line she blanked out (editHomecareItem
// keeps '') reaches the client as an empty, tickable row.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client', { aftercare: ['Cleanse', 'Moisturise', 'Cleanse', ''] }) }, prefs: {} });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
await page.waitForTimeout(2000);
await page.evaluate(() => nav('homecare'));
const rows0 = await page.locator('.check-circle').count();
await page.locator('[role=button][aria-label^="Mark"]').first().click();
const done = await page.locator('.check-circle.done').count();
check('ticking the morning "Cleanse" also ticks the evening "Cleanse"', done === 2, { rows: rows0, ticked: done });
const blank = await page.evaluate(() => (activeProvider().homecare || []).filter(s => !String(s.key).trim()).length);
check('a blanked line shows as an empty tickable step', blank > 0, { blank });
await browser.close();
finish();
