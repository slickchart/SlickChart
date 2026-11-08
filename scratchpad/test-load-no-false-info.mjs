// Ashley, 2026-11-07: "app load times are still quite slow and I would rather it not show any false info
// while loading". Watches Home from the first frame on a signed-in account with a full day booked in
// Square, and checks every number it shows while things are still loading is TRUE (or a grey block):
//  - the bell never shows the made-up "2" the page shell carried, and the screen is never blank
//  - first open (nothing saved yet): Today's appts / This week are grey blocks until Square answers, never 0
//  - next open: her last schedule is on screen from the first frame, before Square answers
//  - a saved schedule from ANOTHER account, or older than a day, is never drawn
//  - Square disconnected: the saved schedule goes away once Square says so
//  - the account is requested alongside /api/cloud-status, once, not after it
//  - the 15-second form check gets "304 nothing changed" when nothing changed, and a new form still lands
//  - the phone app's launch log gets a "boot-ms" line
// PORT (default 8900) serves slickchart-vercel/. ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http';
// WebKit's request routing cannot answer 304 itself, so a "nothing changed" answer comes from a real
// little server (both engines, so they are tested the same way).
const s304 = http.createServer((q, s) => { s.writeHead(304, { ETag: q.headers['if-none-match'] || '', 'Cache-Control': 'private, no-store' }); s.end(); }).listen(8913);
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig', TOK_OTHER = b64({ u: 'prov_other' }) + '.sig';
const now = new Date(); const at = h => { const d = new Date(now); d.setHours(h, 30, 0, 0); return d.toISOString(); };
const appts = [0, 2, 4, 6, 8, 10, 23].map((h, i) => ({ id: 'a' + i, startAt: at(h), durationMinutes: 60, customerName: 'Booked' + i + ' Person', customerId: 'SQ' + i, serviceName: 'Facial' }));
const CL = {}; for (let i = 0; i < 40; i++) CL['c' + i] = { name: 'Client' + i + ' Person', _uAt: 1, treatment: 'Facial' };
const acct = { sc_clients: JSON.stringify(CL), sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function open({ seed = {}, ctx = null, sq = 'ok', sqDelay = 1500, token = TOK, events = null, standalone = false, watchMs = 4500 } = {}) {
  const own = !ctx; ctx = ctx || await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const net = []; const T0 = Date.now();
  await p.addInitScript(([a, t, sa]) => { if (sa) try { Object.defineProperty(navigator, 'standalone', { get: () => true }); } catch (e) {}
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    for (const k of Object.keys(a)) localStorage.setItem(k, a[k]); }, [Object.assign({}, acct, seed), token, standalone]);
  await p.addInitScript(() => { window.__fr = []; let last = '';
    const tick = () => { try { const s = document.getElementById('S'); const bd = document.getElementById('notif-badge');
      const txt = (s ? s.innerText : '').replace(/\s+/g, ' ').trim(); const badge = bd ? (getComputedStyle(bd).display !== 'none' ? bd.textContent : '') : '';
      const key = txt + '|' + badge + '|' + (s ? s.querySelectorAll('.sk').length : 0);
      if (key !== last) { last = key; window.__fr.push({ t: Math.round(performance.now()), txt, badge, sk: s ? s.querySelectorAll('.sk').length : 0, home: !!document.getElementById('home-screen') }); } } catch (e) {}
      requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await p.route('**/api/**', async r => { const req = r.request(); const u = req.url().replace(/^https?:\/\/[^/]+/, ''); const st = Date.now() - T0;
    const rec = { st, u: u.slice(0, 50), m: req.method(), inm: req.headers()['if-none-match'] || '' }; net.push(rec);
    const done = (status, body, h) => { if (status === 304) { rec.end = Date.now() - T0; rec.status = 304; return r.continue({ url: 'http://localhost:8913/clients' }); } rec.end = Date.now() - T0; rec.status = status; return r.fulfill({ status, contentType: 'application/json', headers: h || {}, body: body == null ? '' : body }); };
    if (u.includes('cloud-status')) { await new Promise(z => setTimeout(z, 250)); return done(200, '{"enabled":true}'); }
    if (u.startsWith('/api/store') && req.method() === 'GET') { await new Promise(z => setTimeout(z, 500)); return done(200, JSON.stringify({ data: acct })); }
    if (u.includes('/api/square/appointments')) { await new Promise(z => setTimeout(z, sqDelay)); return sq === 'ok' ? done(200, JSON.stringify({ appointments: appts })) : done(401, JSON.stringify({ error: 'no', code: 'nosquare' })); }
    if (u.startsWith('/api/clients') && req.method() === 'GET' && events) return events(rec, done, req);
    return done(200, '{"ok":true,"data":{},"clients":[],"events":[]}'); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(watchMs);
  const fr = await p.evaluate(() => window.__fr);
  return { p, ctx, fr, net, close: async () => { await p.close(); if (own) await ctx.close(); } };
}
const todayN = fr => { const m = fr.txt.match(/Today's appts (\d+)/); return m ? +m[1] : null; };
const weekN = fr => { const m = fr.txt.match(/This Week.*?Clients (\d+) Appointments (\d+)/i); return m ? [+m[1], +m[2]] : null; };

// 1+2. First open on this device: nothing saved yet.
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
{ const r = await open({ ctx });
  const homeFr = r.fr.filter(f => f.home);
  check('shell: the bell never shows a number nobody worked out', !r.fr.some(f => f.badge === '2'), JSON.stringify(r.fr.filter(f => f.badge).slice(0, 2)));
  check('shell: grey placeholders, not a blank screen, before Home draws', r.fr.some(f => !f.home && f.sk > 0) && !r.fr.some((f, i) => i > 0 && !f.home && !f.sk && !f.txt), r.fr.slice(0, 3).map(f => f.t + 'ms sk' + f.sk + ' ' + f.txt.slice(0, 30)).join(' | '));
  const zeroWhileLoading = homeFr.filter(f => todayN(f) === 0);
  check('first open: Today\'s appts is never 0 while Square is answering', !zeroWhileLoading.length, zeroWhileLoading.slice(0, 1).map(f => f.t + 'ms ' + f.txt.slice(0, 140)).join(''));
  const weekZero = homeFr.filter(f => { const w = weekN(f); return w && (w[0] === 0 || w[1] === 0); });
  check('first open: This week is never 0 / 0 while Square is answering', !weekZero.length, weekZero.slice(0, 1).map(f => f.t + 'ms').join(''));
  check('first open: grey blocks while waiting, real numbers after', homeFr.some(f => f.sk > 0 && todayN(f) === null) && todayN(homeFr[homeFr.length - 1]) === 7, 'last: ' + (homeFr[homeFr.length - 1] || {}).txt?.slice(0, 120));
  const st = r.net.find(n => n.u.startsWith('/api/store') && n.m === 'GET'), cs = r.net.find(n => n.u.includes('cloud-status'));
  check('the account is asked for alongside the status check, not after it', st && cs && st.st <= cs.end, st && cs ? ('store asked at ' + st.st + 'ms, status answered at ' + cs.end + 'ms') : JSON.stringify(r.net.slice(0, 4)));
  check('...and only once during the open', r.net.filter(n => n.u.startsWith('/api/store') && n.m === 'GET').length === 1, r.net.filter(n => n.u.startsWith('/api/store') && n.m === 'GET').length + ' GETs');
  const saved = await r.p.evaluate(() => { const v = JSON.parse(_lsGet('sc_sq_appts_cache') || 'null'); return v && { o: v.o, n: v.a.length, syncable: _syncable('sc_sq_appts_cache') }; });
  check('her schedule is saved on this device, stamped with her account, never synced', saved && saved.o === 'prov_ash' && saved.n === 7 && saved.syncable === false, JSON.stringify(saved));
  await r.close(); }
// 3. Next open, same device: the saved schedule is on screen at once.
{ const r = await open({ ctx, sqDelay: 2500 });
  const homeFr = r.fr.filter(f => f.home);
  check('next open: her real count is there from the first Home frame', homeFr.length && todayN(homeFr[0]) === 7, homeFr[0] && (homeFr[0].t + 'ms ' + homeFr[0].txt.slice(0, 120)));
  check('next open: never a 0 or a grey block on the count', !homeFr.some(f => todayN(f) !== 7), homeFr.map(f => todayN(f)).join(','));
  await r.close(); }
await ctx.close();
// 4. A saved schedule from another account on this device is never drawn.
{ const r = await open({ seed: { sc_sq_appts_cache: JSON.stringify({ o: 'prov_other', at: Date.now(), a: appts }) }, sqDelay: 2000 });
  const early = r.fr.filter(f => f.home && f.t < 1500 + r.fr.find(f => f.home).t);
  check("another account's saved schedule is never shown", !r.fr.some(f => /Booked/.test(f.txt) && todayN(f) === 7 && f.t < (r.fr.find(f => f.home).t + 1200)) && r.fr.filter(f => f.home)[0] && todayN(r.fr.filter(f => f.home)[0]) === null, r.fr.filter(f => f.home).slice(0, 2).map(f => f.t + 'ms ' + todayN(f)).join(' | '));
  await r.close(); }
// 5. Older than a day: not trusted.
{ const r = await open({ seed: { sc_sq_appts_cache: JSON.stringify({ o: 'prov_ash', at: Date.now() - 26 * 3600000, a: appts }) }, sqDelay: 2000 });
  const h0 = r.fr.filter(f => f.home)[0];
  check('a saved schedule older than a day is not drawn', h0 && todayN(h0) === null, h0 && h0.txt.slice(0, 100));
  await r.close(); }
// 6. Square disconnected since: the saved schedule goes away once Square says so.
{ const r = await open({ seed: { sc_sq_appts_cache: JSON.stringify({ o: 'prov_ash', at: Date.now(), a: appts }) }, sq: 'off', sqDelay: 800 });
  const last = r.fr.filter(f => f.home).pop();
  check('Square disconnected: the saved schedule is replaced by the truth', last && todayN(last) === 0 && !/Booked/.test(last.txt), last && last.txt.slice(0, 160));
  await r.close(); }
// 7. The 15-second check: 304 when nothing changed, and a new form still arrives.
{ let version = 1; const evs = v => JSON.stringify({ ok: true, clients: [{ id: 'c1', name: 'Client1 Person' }], events: v > 1 ? [{ id: 'evNew', client_id: 'c1', kind: 'message', payload: { text: 'hello from the client' }, created_at: Date.now() }] : [] });
  const r = await open({ watchMs: 2500, events: async (rec, done) => { const tag = '"v' + version + '"'; if (rec.inm === tag) return done(304, null, { ETag: tag }); return done(200, evs(version), { ETag: tag }); } });
  await r.p.evaluate(() => syncClientEvents()); await r.p.waitForTimeout(400);
  await r.p.evaluate(() => syncClientEvents()); await r.p.waitForTimeout(400);
  const polls = r.net.filter(n => n.u.startsWith('/api/clients') && n.m === 'GET');
  const s304 = polls.filter(n => n.status === 304).length;
  const ep = await r.p.evaluate(() => window._evPoll && { fails: window._evPoll.fails, okAt: !!window._evPoll.okAt });
  check('form check: "nothing changed" answers carry no list, and count as a good check', s304 >= 1 && ep && ep.fails === 0, polls.map(n => n.status + (n.inm ? '(sent ' + n.inm + ')' : '')).join(', ') + ' ' + JSON.stringify(ep));
  version = 2; await r.p.evaluate(() => syncClientEvents()); await r.p.waitForTimeout(800);
  const got = await r.p.evaluate(() => (msgStore.c1 || []).some(m => m.evId === 'evNew'));
  check('form check: something new still arrives in full and is filed', got, JSON.stringify(r.net.filter(n => n.u.startsWith('/api/clients')).slice(-2)));
  await r.close(); }
// 8. The phone app's launch log notes how long each step took.
{ const r = await open({ standalone: true, watchMs: 6500 });
  const line = await r.p.evaluate(() => (JSON.parse(localStorage.getItem('scnat_log') || '[]').find(e => e.e === 'boot-ms') || {}).d || '');
  check('launch log gets the open timings (home, account, done, Square)', /home \d+/.test(line) && /acct \d+/.test(line) && /done \d+/.test(line) && /sq \d+/.test(line), line);
  await r.close(); }
await b.close(); s304.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 260) : '')); }
console.log(`\n[${ENGINE}] ${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
