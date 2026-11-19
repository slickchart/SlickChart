// Client app "My records" print page defines every colour variable it uses (it is its own document).
import { launch, mockApi, clientRecord, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client') } });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 });
const html = await page.evaluate(() => _buildMyRecordsHTML());
const p2 = await ctx.newPage(); await p2.setContent(html);
const bad = await p2.evaluate(() => { const b = []; for (const sh of document.styleSheets) for (const r of sh.cssRules) (r.cssText.match(/var\(--[a-z0-9-]+\)/g) || []).forEach(v => { const n = v.slice(4, -1); if (!getComputedStyle(document.documentElement).getPropertyValue(n).trim()) b.push(n); }); return [...new Set(b)]; });
console.log(bad.length ? 'FAIL undefined: ' + bad : 'PASS my records: every colour defined');
await browser.close(); process.exit(bad.length ? 1 : 0);
