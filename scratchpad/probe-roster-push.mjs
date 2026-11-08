// How big is the client-list upload a launch makes, and how long does building it take? (800 clients)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900;
const CL = {}; for (let i = 0; i < 800; i++) CL['c' + i] = { name: 'Client' + i + ' Person', email: 'c' + i + '@x.test', phone: '555' + i, treatment: 'Facial', skin: 'Combination', concerns: 'Acne', notes: 'n'.repeat(200), _uAt: 1700000000000 + i,
  summaries: [{ date: 'Oct 1, 2026', note: 'y'.repeat(500), ts: i }], submittedForms: [{ title: 'Intake', formId: 'intake', ts: i, answers: { a: 'x'.repeat(300) } }] };
const acct = { sc_clients: JSON.stringify(CL), sc_hide_sample: '1' };
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ serviceWorkers: 'block' }); const p = await ctx.newPage(); const posts = [];
await p.addInitScript(a => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', 1); localStorage.setItem('sc_token', 'T'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1'); for (const k in a) localStorage.setItem(k, a[k]); }, acct);
await p.route('**/api/**', r => { const q = r.request(); const u = q.url();
  if (u.includes('/api/clients') && q.method() === 'POST') { const body = q.postData() || ''; let n = 0; try { n = JSON.parse(body).clients.length; } catch (e) {} posts.push({ t: Date.now(), kb: Math.round(body.length / 1024), n }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, clients: [] }) }); }
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && q.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: acct }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(12000);
const t = await p.evaluate(() => { const t0 = performance.now(); Object.keys(CL).forEach(id => _assembleClientData(id)); return Math.round(performance.now() - t0); });
console.log('launch uploads:', JSON.stringify(posts.map(x => ({ clients: x.n, kb: x.kb })))); console.log('assembling all 800 client records takes', t, 'ms (desktop CPU)');
await b.close();
