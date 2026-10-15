// CPU profile of a repeat-visit boot: top functions by self time and by total time (first 4s).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8898;
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const CL = {}; const sums = {};
for (let i = 0; i < 300; i++) { CL['c' + i] = { name: 'Client ' + i, phone: '555 01' + i, email: 'c' + i + '@x.test', treatment: 'Facial', notes: 'x'.repeat(400), summaries: [{ date: 'Oct 1, 2026', note: 'y'.repeat(600), ts: i }] }; sums['c' + i] = [{ date: 'Oct 1, 2026', note: 'y'.repeat(600), homecare: ['a', 'b'], ts: i }]; }
const DATA = { sc_clients: JSON.stringify(CL), sc_session_summaries: JSON.stringify(sums) };
await p.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
await p.route('**/api/**', async r => { const u = r.request().url(); if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, 300)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: DATA }) }); }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[]}' }); });
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => /cdn\.jsdelivr|fonts\.g/.test(r.request().url()) ? r.continue() : r.abort());
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(4000);   // warm: data on disk
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(4000);
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map(n => [n.id, n])); const self = new Map(); const dt = profile.timeDeltas; const samples = profile.samples;
const cnt = new Map(); samples.forEach((s, i) => cnt.set(s, (cnt.get(s) || 0) + (dt[i] || 0)));
const parent = new Map(); profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
const total = new Map();
for (const [id, us] of cnt) { const n = byId.get(id); const k = n.callFrame.functionName || '(' + (n.callFrame.url ? 'anonymous' : n.callFrame.functionName || 'program') + ')'; self.set(k, (self.get(k) || 0) + us);
  const seen = new Set(); let cur = id; while (cur) { const nn = byId.get(cur); const kk = (nn.callFrame.functionName || '(anon)') + (nn.callFrame.lineNumber >= 0 ? ':' + nn.callFrame.lineNumber : ''); if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) || 0) + us); } cur = parent.get(cur); } }
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => (v / 1000).toFixed(0).padStart(6) + 'ms  ' + k).join('\n');
console.log('== self time (4x CPU) ==\n' + top(self, 25)); console.log('\n== total time ==\n' + top(total, 45));
await b.close();
