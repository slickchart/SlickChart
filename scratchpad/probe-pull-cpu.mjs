// How long the account read takes on the phone AFTER the bytes arrive (merge + reload), busy account, CPU 4x.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const CPU = +(process.env.CPU || 4), N = +(process.env.N || 600), PORT = process.env.PORT || 8900;
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const CL = {}, sums = {}, recs = {};
for (let i = 0; i < N; i++) { CL['c' + i] = { name: 'Client' + i + ' Person', _uAt: 1, phone: '555 01' + i, email: 'c' + i + '@x.test', treatment: 'Facial', notes: 'x'.repeat(300),
  submittedForms: [{ title: 'Intake', evId: 'e' + i, ts: 1, answers: Array.from({ length: 30 }, (_, k) => ({ q: 'Question ' + k, a: 'Answer text ' + k })) }], summaries: [{ date: 'Oct 1, 2026', note: 'y'.repeat(500), ts: i, _ts: i }] };
  sums['c' + i] = [{ date: 'Oct 1, 2026', note: 'y'.repeat(500), homecare: ['a', 'b'], ts: i, _ts: i }]; recs['c' + i] = ['p1', 'p2']; }
const acct = { sc_clients: JSON.stringify(CL), sc_session_summaries: JSON.stringify(sums), sc_client_recs: JSON.stringify(recs), sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'A T' }) };
const body = JSON.stringify({ data: acct });
console.log('account body', (body.length / 1e6).toFixed(2), 'MB');
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
for (let run = 0; run < 3; run++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await p.addInitScript(([a, t]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    for (const k of Object.keys(a)) localStorage.setItem(k, a[k]);
    const of = window.fetch; window.fetch = function (u, o) { const pr = of.apply(this, arguments); if (String(u).startsWith('/api/store') && !(o && o.method)) pr.then(() => { window.__storeAt = Math.round(performance.now()); }); return pr; }; }, [acct, b64({ u: 'prov_ash' }) + '.sig']);
  await p.route('**/api/**', async r => { const u = r.request().url();
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, 300)); return r.fulfill({ status: 200, contentType: 'application/json', body }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[]}' }); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForFunction(() => window.__scT && window.__scT.done, null, { timeout: 60000 });
  const t = await p.evaluate(() => Object.assign({ storeAt: window.__storeAt }, window.__scT));
  console.log(JSON.stringify(t), ' merge+reload after bytes:', t.acct - t.storeAt, 'ms; acct->done', t.done - t.acct);
  await ctx.close();
}
await b.close();
