// Ashley, 2026-11-13: "sometimes still shows un-updated notification cards before updating to what is
// current ... so that providers are never seeing false information". The 11-06 fix made the cards wait
// for the ACCOUNT; they are also built from her clients' submissions and from Square, which answer
// seconds later on her phone. Watches Home (and the bell's feed) from the first frame:
//  A. a client did her check-in while the app was closed: "hasn't done their check-in" never shows
//  B. a visit was moved to next week in Square: its check-in reminder never shows
//  C. a reminder that IS true still shows once everything has answered (and a grey block held its place)
//  D. submissions unreachable: real cards still appear (after the wait), never hidden for good
//  E. back in the app after 3 minutes away, during which she checked in: the stale card is not left up
// PORT (default 8900) serves slickchart-vercel/. ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lab = d => { let h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return MON[d.getMonth()] + ' ' + d.getDate() + ' · ' + h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap; };
const now = new Date(); const soon = new Date(now.getTime() + 3 * 3600e3); soon.setSeconds(0, 0); soon.setMinutes(0);
const nextWeek = new Date(soon.getTime() + 7 * 86400e3);
const CLIENTS = { cX: { name: 'Xena Did', _uAt: 1, nextVisit: lab(soon), treatment: 'Facial', email: 'x@x.test' },
  cY: { name: 'Yara Moved', _uAt: 1, nextVisit: lab(soon), treatment: 'Facial', email: 'y@x.test' },
  cZ: { name: 'Zoe Real', _uAt: 1, nextVisit: lab(soon), treatment: 'Facial', email: 'z@x.test' } };
const acct = { sc_clients: JSON.stringify(CLIENTS), sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const appts = [{ id: 'aX', startAt: soon.toISOString(), durationMinutes: 60, customerName: 'Xena Did', customerId: 'SQX', serviceName: 'Facial' },
  { id: 'aY', startAt: nextWeek.toISOString(), durationMinutes: 60, customerName: 'Yara Moved', customerId: 'SQY', serviceName: 'Facial' },
  { id: 'aZ', startAt: soon.toISOString(), durationMinutes: 60, customerName: 'Zoe Real', customerId: 'SQZ', serviceName: 'Facial' }];
const ciEv = (cid, name, id) => ({ id, kind: 'checkin', client_id: cid, created_at: new Date().toISOString(), payload: { client: name, dateLabel: lab(soon), time: '', treatment: 'Facial', groups: [], flagged: [] } });
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function open({ evDelay = 1200, sqDelay = 2500, evFail = false, watchMs = 6000, state = { events: [ciEv('cX', 'Xena Did', 'evX')] } } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.addInitScript(([a, t]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
    for (const k of Object.keys(a)) localStorage.setItem(k, a[k]); }, [acct, TOK]);
  await p.addInitScript(() => { window.__fr = []; let last = '';
    const tick = () => { try { const s = document.getElementById('S'); const txt = (s ? s.innerText : '').replace(/\s+/g, ' ').trim();
      const w = s ? s.querySelectorAll('[data-attn-wait]').length : 0; const key = txt + '|' + w;
      if (key !== last) { last = key; window.__fr.push({ t: Math.round(performance.now()), txt, w, home: !!document.getElementById('home-screen') }); } } catch (e) {}
      requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await p.route('**/api/**', async r => { const req = r.request(); const u = req.url().replace(/^https?:\/\/[^/]+/, '');
    const ok = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });
    if (u.includes('cloud-status')) { await new Promise(z => setTimeout(z, 150)); return ok('{"enabled":true}'); }
    if (u.startsWith('/api/store') && req.method() === 'GET') { await new Promise(z => setTimeout(z, 400)); return ok({ data: acct }); }
    if (u.includes('/api/square/appointments')) { await new Promise(z => setTimeout(z, sqDelay)); return ok({ appointments: appts }); }
    if (u.startsWith('/api/clients') && req.method() === 'GET') { await new Promise(z => setTimeout(z, evDelay)); if (evFail) return ok('{"error":"down"}', 500);
      return ok({ ok: true, events: state.events, clients: [] }); }
    return ok('{"ok":true,"data":{},"clients":[],"events":[]}'); });
  await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForTimeout(watchMs);
  return { p, ctx, state, frames: async () => p.evaluate(() => window.__fr) };
}
const nudge = (f, first) => f.home && f.txt.includes(first + " hasn't done their check-in");
const firstShown = (fr, first) => { const f = fr.find(x => nudge(x, first)); return f ? f.t + 'ms' : 'never'; };

{ const r = await open(); const fr = await r.frames(); const last = fr[fr.length - 1] || {};
  check('A. a check-in sent while the app was closed: her reminder never flashes', !fr.some(f => nudge(f, 'Xena')), 'Xena reminder first drawn at ' + firstShown(fr, 'Xena'));
  check('B. a visit moved in Square: its reminder never flashes', !fr.some(f => nudge(f, 'Yara')), 'Yara reminder first drawn at ' + firstShown(fr, 'Yara'));
  check('C. a true reminder still shows once everything answered', nudge(last, 'Zoe'), last.txt && last.txt.slice(0, 200));
  check('C. a grey "checking" block held the place while waiting', fr.some(f => f.home && f.w > 0) && !last.w, fr.filter(f => f.home).map(f => f.t + 'ms w' + f.w).slice(0, 6).join(' '));
  check('C. the new check-in itself is shown', last.txt && /New pre-visit check-in/.test(last.txt), '');
  // The bell's feed draws from the same cards
  await r.p.evaluate(() => nav('notifications-feed'));
  await r.p.waitForTimeout(300);
  const feed = await r.p.evaluate(() => document.getElementById('S').innerText);
  check('C. the bell feed agrees (true reminder there, the done one not)', /Zoe hasn't done/.test(feed) && !/Xena hasn't done/.test(feed), feed.slice(0, 160).replace(/\s+/g, ' '));
  await r.p.evaluate(() => nav('home')); await r.p.waitForTimeout(200);
  // E. three minutes away; Zoe checks in meanwhile; come back
  r.state.events = r.state.events.concat([ciEv('cZ', 'Zoe Real', 'evZ')]);
  await r.p.evaluate(() => { window.__vs = 'visible'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vs }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__vs === 'hidden' });
    window.__vs = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); _attnHiddenAt = Date.now() - 180000; Cloud._lastPullAt = Date.now() - 180000; });
  const mark = await r.p.evaluate(() => { window.__vs = 'visible'; const t = Math.round(performance.now()); document.dispatchEvent(new Event('visibilitychange')); return t; });
  await r.p.waitForTimeout(5000);
  const fr2 = (await r.frames()).filter(f => f.t >= mark); const last2 = fr2[fr2.length - 1] || {};
  const stale = fr2.filter(f => nudge(f, 'Zoe'));
  check('E. back after 3 minutes: the reminder she has since done is not left on screen', stale.length === 0 || stale.every(f => f.t - mark < 50), stale.slice(0, 2).map(f => (f.t - mark) + 'ms').join(','));
  check('E. ...and is gone once the app has caught up', last2.home && !nudge(last2, 'Zoe') && !last2.w, 'w' + last2.w + ' zoe:' + nudge(last2, 'Zoe') + ' ' + fr2.map(f => (f.t - mark) + 'ms w' + f.w + (nudge(f, 'Zoe') ? 'Z' : '')).join(' ') + ' gate ' + JSON.stringify(await r.p.evaluate(() => [_attnState(), _attnGate, Cloud._lastPullAt, _sqApptsState]))); 
  await r.ctx.close(); }
{ const r = await open({ evFail: true, watchMs: 15000, state: { events: [] } }); const fr = await r.frames(); const last = fr[fr.length - 1] || {};
  check('D. submissions unreachable: real cards are not hidden for good', nudge(last, 'Zoe') && !last.w, (last.txt || '').slice(0, 160));
  await r.ctx.close(); }
await b.close();
let pass = 0; for (const x of results) { console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + x.detail : '')); if (x.pass) pass++; }
console.log(`\n[${ENGINE}] ${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
