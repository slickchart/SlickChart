// REGRESSION (2026-11-18): client app "print my records" frame removed 2s after print(). Needs :8899.
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client') } });
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real, null, { timeout: 15000 }); await page.waitForTimeout(800);
const r = await page.evaluate(async () => { let printed = null;
  const mo = new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(n => { if (n.tagName === 'IFRAME') { try { n.contentWindow.print = () => { printed = n; }; } catch (e) {} } })));
  mo.observe(document.body, { childList: true, subtree: true });
  try { _printMyRecords(); } catch (e) { return { err: String(e) }; }
  await new Promise(r => setTimeout(r, 3500)); mo.disconnect();
  const still = !!(printed && printed.isConnected);
  try { if (printed && printed.contentWindow) printed.contentWindow.dispatchEvent(new Event('afterprint')); } catch (e) {}
  await new Promise(r => setTimeout(r, 900));
  return { printed: !!printed, stillAt3s: still, goneAfter: !!(printed && !printed.isConnected) }; });
check('print frame is gone while the print preview may still be open, or never goes', !(r.printed && r.stillAt3s && r.goneAfter), r);
await browser.close(); finish();
