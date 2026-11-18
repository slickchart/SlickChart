// REGRESSION (2026-11-18): a client opening their link while the server hiccups (500) saw the
// broken-link page ("ask your provider to resend"). It must show the retry screen, and Try again
// must open their space. Needs the :8899 server (scratchpad/vercel-like-server.mjs).
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let fail = true;
await mockApi(page, { records: { TOK: clientRecord('c1', 'Cara Client') } });
// Registered after mockApi so it is asked first (Playwright tries the newest route first).
await page.route('**/api/client-data**', r => fail ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Something went wrong. Please try again."}' }) : r.fallback());
await page.goto(BASE + '?c=TOK', { waitUntil: 'load' }); await page.waitForTimeout(2500);
const t1 = await page.evaluate(() => (document.getElementById('S') || {}).innerText || '');
check('first open during a server error shows the broken-link page instead of Try again', !/Try again/.test(t1) || /resend/i.test(t1), t1.slice(0, 140));
fail = false;
await page.evaluate(() => { const b = [...document.querySelectorAll('#S button')].find(x => /Try again/.test(x.textContent)); b && b.click(); });
await page.waitForTimeout(2500);
const ok = await page.evaluate(() => !!(typeof client !== 'undefined' && client._real));
check('Try again does not open their space once the server answers', !ok, { real: ok });
await browser.close(); finish();
