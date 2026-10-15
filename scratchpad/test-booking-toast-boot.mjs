// Square bookers who are ALREADY her clients must never be re-added / toasted at launch, whatever the
// timing (slow account pull, fast boot after the deploy-time split, stale list on this device).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const N = 47;
const acct = {}; const appts = [];
for (let i = 0; i < N; i++) { acct['sq_' + i] = { name: 'Booker Person' + i, squareId: 'SQ' + i, source: 'square' }; appts.push({ id: 'ap' + i, customerName: 'Booker Person' + i, customerId: 'SQ' + i, startAt: new Date(Date.now() + 86400000 * (i % 20 + 1)).toISOString(), status: 'ACCEPTED' }); }
acct.real1 = { name: 'Ashley Watson' };
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [label, pullDelay, staleLocal] of [['normal launch', 400, false], ['slow account answer (8s)', 8000, false], ['device holds an older, shorter list', 400, true], ['older list + slow answer', 8000, true]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.addInitScript(([stale]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1');
    if (stale) localStorage.setItem('sc_clients', JSON.stringify({ real1: { name: 'Ashley Watson' } })); }, [staleLocal]);
  const toasts = [];
  await p.exposeFunction('__toast', t => toasts.push(t));
  await p.addInitScript(() => { const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { try { window.__toast(String(m)); } catch (e) {} return o.apply(this, arguments); }; clearInterval(iv); } }, 5); });
  await p.route('**/api/**', async r => { const u = r.request().url();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, pullDelay)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(acct), sc_hide_sample: '1' } }) }); }
    if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(pullDelay + 9000);
  const st = await p.evaluate(() => ({ n: Object.keys(CL).length, bookerCopies: Object.values(CL).filter(c => /^Booker Person/.test(c.name)).length }));
  const bad = toasts.filter(t => /bookings? added|booked online/.test(t));
  check(label + ': no "bookings added" toast', !bad.length, bad.join(' | '));
  check(label + ': no duplicate clients created', st.bookerCopies === N, JSON.stringify(st));
  await ctx.close();
}
// a genuinely NEW booker must still be added once the account has answered (slow answer too)
{ const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
  const toasts = []; await p.exposeFunction('__toast', t => toasts.push(t));
  await p.addInitScript(() => { const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { try { window.__toast(String(m)); } catch (e) {} return o.apply(this, arguments); }; clearInterval(iv); } }, 5); });
  const appts2 = appts.concat([{ id: 'apNEW', customerName: 'Brand Newperson', customerId: 'SQNEW', startAt: new Date(Date.now() + 86400000 * 3).toISOString(), status: 'ACCEPTED' }]);
  await p.route('**/api/**', async r => { const u = r.request().url();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, 8000)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(acct), sc_hide_sample: '1' } }) }); }
    if (u.includes('/api/square/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appts2 }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(19000);
  const st = await p.evaluate(() => ({ newOnes: Object.values(CL).filter(c => c.name === 'Brand Newperson').length, bookers: Object.values(CL).filter(c => /^Booker Person/.test(c.name)).length }));
  check('a genuinely new booker is still added after a slow answer', st.newOnes === 1 && st.bookers === N, JSON.stringify(st));
  check('...and only that one is announced', toasts.some(t => /Brand booked online/.test(t)) && !toasts.some(t => /47|48 new online/.test(t)), toasts.join(' | '));
  await ctx.close(); }
await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 220) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
