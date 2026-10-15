// Regressions from the whole-app sweep (2026-10-14h).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); let errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('cloud-status') ? '{"enabled":true}' : '{"ok":true,"data":{},"clients":[]}' }));
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(2800);
await p.evaluate(() => { CL.c1 = { name: 'Cooper Howard' }; });
errs = [];
const sum = await p.evaluate(() => { nav('session-summary', 'c1'); const btn = Array.from(document.querySelectorAll('#S [onclick]')).find(e => /summaryCustomOpen/.test(e.getAttribute('onclick'))); if (btn) btn.click();
  const open = /Homecare routine|Aftercare instructions/.test(document.getElementById('S').innerText); nav('room', 'c1'); _summaryFrom = 'room'; nav('session-summary', 'c1'); return { btn: !!btn, open, drew: document.getElementById('S').innerText.length }; });
check('Customize card opens without breaking the summary', sum.btn && sum.open && sum.drew > 100 && !errs.length, JSON.stringify(sum) + errs.join(';'));
errs = [];
const doc = await p.evaluate(() => { docs.push({ id: 'dx', name: 'Test doc', cat: 'Other', date: 'Oct 1', size: '1 KB' }); nav('doc-detail', 'dx'); const btn = Array.from(document.querySelectorAll('#S button')).find(e => /Delete/.test(e.textContent)); btn.click();
  const ok = document.getElementById('_cf-ok'); const modal = !!ok; if (ok) ok.click(); return { modal, gone: !docs.some(d => d.id === 'dx'), tt: document.title }; });
check('Delete document asks, then deletes', doc.modal && doc.gone && !errs.length, JSON.stringify(doc) + errs.join(';'));
errs = [];
const gone = await p.evaluate(() => { nav('notes', 'no-such-client'); return document.title; });
check('a screen for a removed client lands on the client list, no crash', /Clients/.test(gone) && !errs.length, gone + errs.join(';'));
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + x.detail.slice(0, 200) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
