// Home's "Unread messages" tile names everyone it counts (2026-11-19 sweep: "2 from Ava" when the
// second unread conversation was Bea's), and the AI brief's Rebook button has a visible word.
// usage: [ENGINE=webkit] node scratchpad/test-home-unread-names.mjs (needs :8899, build-demo run)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const eng = process.env.ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const b = await eng.launch(process.env.ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium' });
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
const page = await (await b.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true, serviceWorkers: 'block' })).newPage();
page.on('dialog', d => d.dismiss().catch(() => {}));
await page.addInitScript(() => { try { localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":false}' : '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.goto('http://localhost:8899/slickchart-provider-demo.html'); await page.waitForTimeout(2500);
const ids = await page.evaluate(() => Object.keys(CL).slice(0, 4));
const tile = async n => page.evaluate(([ids, n]) => { document.querySelectorAll('.modal-bg').forEach(m => m.remove()); threads.forEach(t => t.unread = false); ids.slice(0, n).forEach((id, i) => { let t = threads.find(x => x.id === id); if (!t) { t = { id, preview: 'hi', time: 'now', ts: Date.now() - i }; threads.push(t); } t.unread = true; }); threads.sort((a, b) => (b.unread - a.unread)); nav('home');
  const el = [...document.querySelectorAll('#S *')].find(e => e.children.length === 0 && /^Unread messages$/.test(e.textContent.trim())); const card = el && el.parentElement; const r = card && card.getBoundingClientRect();
  return { text: card ? card.innerText.replace(/\s+/g, ' ') : null, first: ids.slice(0, n).map(id => CL[id].name.split(' ')[0]), sideways: document.documentElement.scrollWidth > innerWidth + 1, fits: r ? r.right <= innerWidth : null }; }, [ids, n]);
let t = await tile(1); ok('one unread: "from <name>"', t.text && t.text.includes('from ' + t.first[0]) && !/ and /.test(t.text), t);
t = await tile(2); ok('two unread: names both', t.text && t.text.includes(t.first[0]) && t.text.includes(t.first[1]), t);
t = await tile(3); ok('three unread: "and 2 others"', t.text && /from \S+ and 2 others/.test(t.text), t); ok('320 wide: nothing pushed sideways', !t.sideways && t.fits, t);
t = await tile(0); ok('none: all caught up', t.text && /all caught up/.test(t.text), t);
await page.evaluate(id => nav('brief', id), ids[0]); await page.waitForFunction(() => [...document.querySelectorAll('#S button')].some(x => /nav\('rebook'/.test(x.getAttribute('onclick') || '')), null, { timeout: 8000 }).catch(() => {});
const rb = await page.evaluate(id => { const btn = [...document.querySelectorAll('#S button')].find(x => /nav\('rebook'/.test(x.getAttribute('onclick') || '')); return btn ? btn.innerText.trim() : null; }, ids[0]);
ok('AI brief Rebook button says Rebook', rb === 'Rebook', rb);
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
