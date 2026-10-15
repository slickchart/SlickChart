// _gcalPush() hands the server the WHOLE manualAppts list and lib/google-cal.js deletes every Google
// event it wrote earlier that is not in that list ("anything no longer in her appointments was
// cancelled here"). It has no "account read yet" check. If she books an appointment while the
// account pull is still loading (slow launch, or a session whose pull failed and never retries),
// manualAppts is this device's copy, so the push says her other appointments were cancelled and the
// server deletes them from her Google Calendar.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const day = k => { const d = new Date(Date.now() + k * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const acctAppts = [1, 2, 3].map(i => ({ id: 'ma_acct' + i, client: 'Booked ' + i, tx: 'Facial', date: day(i + 1), time: '10:00 AM', _ts: Date.now() - 86400000 }));
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const kv = { sc_manual_appts: JSON.stringify(acctAppts), sc_hide_sample: '1', sc_onboarded: '1' };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
const gpush = [];
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') { const snap = JSON.stringify({ data: { ...kv } }); await new Promise(z => setTimeout(z, 10000)); return r.fulfill({ status: 200, contentType: 'application/json', body: snap }); }
  if (u.includes('/api/google-cal') && m === 'POST') { try { gpush.push(JSON.parse(r.request().postData() || '{}').appts.map(a => a.client)); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForTimeout(3000);
// What the "New appointment" sheet does on save (manualAppts.unshift + _saveManualAppts).
await p.evaluate(([d]) => { manualAppts.unshift({ id: 'ma_new', client: 'Walk In', tx: 'Brow', date: d, time: '2:00 PM', _ts: Date.now() }); _saveManualAppts(); }, [day(5)]);
await p.waitForTimeout(5000);
check('no Google push is sent before the account\'s appointments have been read', !gpush.length || gpush[0].length >= 4, 'first push listed ' + (gpush[0] ? gpush[0].length + ': ' + gpush[0].join(', ') : 'nothing') + ' (account holds 3 others, which the server would delete from Google)');
await ctx.close(); await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 300) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
