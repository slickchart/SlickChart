// A client opens a link that was removed (2026-11-19 phone sweep): the screen said only "This link is
// not valid or has been removed." with no next step, in 13px text. It now tells them what to do, and
// a server that is down or no signal still says "your link is fine". Never the sample client.
//   PLAYWRIGHT_BROWSERS_PATH=<webkit> node scratchpad/test-client-dead-link.mjs   (needs :8899)
import { BASE, launch, mockApi } from './sweep2-client-lib.mjs';
const b = await launch(); let fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (d ? '  — ' + d : '')); if (!c) fails++; };
for (const mode of ['404', '500', 'offline']) {
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true }); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await mockApi(page, { records: {}, handler: mode === '500' ? (q, p, t, J) => p === '/api/client-data' ? J({ error: 'x' }, 500) : null : null });
  if (mode === 'offline') await page.route('**/api/client-data**', r => r.abort('internetdisconnected'));
  await page.goto(BASE + '?c=GONE'); await page.waitForTimeout(6000);
  const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  if (mode === '404') { ok(/ask your provider/i.test(t), '404: says to ask their provider for a new link', t.slice(0, 160));
    ok(await page.evaluate(() => [...document.querySelectorAll('#S div')].some(d => /ask your provider/i.test(d.textContent) && parseFloat(getComputedStyle(d).fontSize) >= 15)), '404: in readable text (15px+)'); }
  else ok(/your link is fine/i.test(t), mode + ': says the link is fine and to try again', t.slice(0, 160));
  ok(!/Maya|sample/i.test(t), mode + ': never shows the sample client');
  ok(await page.evaluate(() => { const b = document.getElementById('client-notif-bell'); return !b || getComputedStyle(b).visibility === 'hidden' || !b.offsetWidth; }), mode + ': no notification bell with a count when there is nothing of theirs');
  ok(!errs.length, mode + ': no page errors', errs.join(' | '));
  await page.close();
}
{ const { clientRecord } = await import('./sweep2-client-lib.mjs'); const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await mockApi(page, { records: { TOK: clientRecord('c1', 'Jo Rivera', { providerName: 'Ashley' }) } }); await page.goto(BASE + '?c=TOK'); await page.waitForTimeout(5000);
  ok(await page.evaluate(() => { const b = document.getElementById('client-notif-bell'); return !!b && getComputedStyle(b).visibility !== 'hidden' && b.offsetWidth > 0; }), 'a working link still shows the notification bell'); await page.close(); }
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
