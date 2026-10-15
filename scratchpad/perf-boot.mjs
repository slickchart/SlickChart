// Boot profile on a simulated mid-range phone: CPU 4x slower, 4G network, busy-account data.
// Reports: HTML downloaded, DOMContentLoaded, first paint, Home drawn, boot finished, long tasks, script time.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PAGE = process.argv[2] || 'slickchart.html';
const RUNS = +(process.argv[3] || 2);
const CPU = +(process.argv[4] || 4);
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 1.5 * 1024 * 1024 / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
// a busy practice: 300 clients with summaries
const CL = {}; const sums = {};
for (let i = 0; i < 300; i++) { CL['c' + i] = { name: 'Client ' + i, phone: '555 01' + i, email: 'c' + i + '@x.test', treatment: 'Facial', notes: 'x'.repeat(400), summaries: [{ date: 'Oct 1, 2026', note: 'y'.repeat(600), ts: i }] }; sums['c' + i] = [{ date: 'Oct 1, 2026', note: 'y'.repeat(600), homecare: ['a', 'b'], ts: i }]; }
const DATA = { sc_clients: JSON.stringify(CL), sc_session_summaries: JSON.stringify(sums) };
await p.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {}
  window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch (e) {} });
await p.route('**/api/**', async r => { const u = r.request().url();
  if (u.includes('cloud-status')) { await new Promise(z => setTimeout(z, 150)); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }); }
  if (u.includes('/api/store') && r.request().method() === 'GET') { await new Promise(z => setTimeout(z, 500)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: DATA }) }); }
  await new Promise(z => setTimeout(z, 200)); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[]}' }); });
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => /cdn\.jsdelivr|fonts\.g/.test(r.request().url()) ? r.continue() : r.abort());
for (let run = 1; run <= RUNS; run++) {
  const t0 = Date.now();
  await p.goto('http://localhost:' + (process.env.PORT||8899) + '/' + PAGE, { waitUntil: 'domcontentloaded' });
  // Home is "drawn" when the greeting is on screen; boot is "done" when Cloud._booting is false
  let home = null, done = null;
  for (let i = 0; i < 300; i++) { const s = await p.evaluate(() => ({ h: /Good (morning|afternoon|evening)/.test((document.getElementById('S') || {}).innerText || ''), b: (typeof Cloud !== 'undefined') ? !!Cloud._booting : true, c: (typeof CL !== 'undefined') ? Object.keys(CL).length : 0 })).catch(() => ({}));
    const t = Date.now() - t0; if (s.h && home == null) home = t; if (s.h && !s.b && s.c >= 300 && done == null) { done = t; break; } await new Promise(z => setTimeout(z, 50)); }
  const m = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fp = performance.getEntriesByType('paint').find(x => x.name === 'first-contentful-paint');
    return { htmlDone: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd), fcp: fp ? Math.round(fp.startTime) : null, transfer: n.transferSize, longTasks: window.__lt.length, longest: Math.max(0, ...window.__lt), totalBlocking: window.__lt.reduce((a, d) => a + Math.max(0, d - 50), 0) }; });
  const met = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const g = k => Math.round(((met.metrics || []).find(x => x.name === k) || {}).value * 1000 || 0);
  console.log(`run ${run} (${run === 1 ? 'first visit' : 'repeat visit'}): html downloaded ${m.htmlDone}ms (${Math.round(m.transfer / 1024)}KB over the wire) | page ready ${m.dcl}ms | first paint ${m.fcp}ms | Home drawn ${home}ms | all data loaded ${done}ms | long tasks ${m.longTasks}, longest ${m.longest}ms, blocking ${m.totalBlocking}ms | script ${g('ScriptDuration')}ms`);
}
await b.close();
