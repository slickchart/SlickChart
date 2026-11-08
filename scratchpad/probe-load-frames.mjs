// What does Home SAY, frame by frame, while the app opens? Records every distinct state of Home's text
// from the first frame until everything has answered, plus the network waterfall, on a realistic
// signed-in account (device copy == account copy, Square connected with visits today).
// node scratchpad/probe-load-frames.mjs [page]   (PORT env, default 8899; ENGINE=webkit for Safari)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899; const PAGE = process.argv[2] || 'slickchart.html';
const ENGINE = process.env.ENGINE || 'chromium';
const SQ_DELAY = +(process.env.SQ_DELAY || 1400), PULL_DELAY = +(process.env.PULL_DELAY || 700), CPU = +(process.env.CPU || 4);
const now = new Date(); const at = h => { const d = new Date(now); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const CL = {}; for (let i = 0; i < 300; i++) CL['c' + i] = { name: 'Client' + i + ' Person', phone: '555010' + i, email: 'c' + i + '@x.test', treatment: 'Facial', notes: 'x'.repeat(300), _uAt: 1 };
const threads = [{ id: 'c1', name: 'Client1 Person', unread: true, last: 'hi', ts: Date.now() - 6e5 }];
const acct = { sc_clients: JSON.stringify(CL), sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow Studio', ownerName: 'Ashley Test' }), sc_threads: JSON.stringify(threads) };
const appts = [9, 11, 13, 15, 17, 20, 22].map((h, i) => ({ id: 'a' + i, startAt: at(h), durationMinutes: 60, customerName: 'Client' + i + ' Person', customerId: 'SQ' + i, serviceName: 'Facial' }));
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
if (ENGINE !== 'webkit') { const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
await p.addInitScript(a => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
  localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
  for (const k of Object.keys(a)) localStorage.setItem(k, a[k]); }, acct);
await p.addInitScript(() => { window.__fr = []; let last = ''; const t0 = performance.timeOrigin;
  const tick = () => { try { const s = document.getElementById('S'); const txt = (s ? s.innerText : '(no #S)').replace(/\s+/g, ' ').trim().slice(0, 900); if (txt !== last) { last = txt; window.__fr.push({ t: Math.round(performance.now()), txt }); } } catch (e) {} requestAnimationFrame(tick); };
  requestAnimationFrame(tick); });
const T0 = Date.now(); const net = [];
await p.route('**/api/**', async r => { const u = r.request().url().replace(/^https?:\/\/[^/]+/, ''); const st = Date.now() - T0; let d = 150, body = '{"ok":true,"data":{},"clients":[],"events":[]}';
  if (u.includes('cloud-status')) { d = 200; body = '{"enabled":true}'; }
  else if (u.startsWith('/api/store') && r.request().method() === 'GET') { d = PULL_DELAY; body = JSON.stringify({ data: acct }); }
  else if (u.includes('/api/square/appointments')) { d = SQ_DELAY; body = JSON.stringify({ appointments: appts }); }
  else if (u.startsWith('/api/clients') && r.request().method() === 'GET') { d = 900; body = JSON.stringify({ ok: true, clients: [], events: [] }); }
  await new Promise(z => setTimeout(z, d)); net.push({ st, end: Date.now() - T0, m: r.request().method(), u: u.slice(0, 60) });
  return r.fulfill({ status: 200, contentType: 'application/json', body }); });
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => /cdn\.jsdelivr|fonts\.g/.test(r.request().url()) ? r.continue() : r.abort());
await p.goto('http://localhost:' + PORT + '/' + PAGE);
await p.waitForTimeout(9000);
const fr = await p.evaluate(() => window.__fr);
for (const f of fr) console.log(String(f.t).padStart(6) + 'ms  ' + f.txt.slice(0, +(process.env.W || 400)));
console.log('\nnetwork (ms since goto):'); net.sort((a, b) => a.st - b.st).forEach(n => console.log(String(n.st).padStart(6) + ' -> ' + String(n.end).padStart(6) + '  ' + n.m + ' ' + n.u));
await b.close();
