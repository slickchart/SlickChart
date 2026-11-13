// Opening the app read her WHOLE account every time (3-4 s on her phone, launch log "acct"). Now the
// device keeps the last answer and asks only for what changed (api/store.js ?since=), reusing a saved
// value only when the account's fingerprint of it matches. This checks the app ends up with exactly what
// a full read gives, in every case:
//  1 first open: a full read, and the answer is kept for next time (stamped with her account)
//  2 next open: only the changed key is sent, and the result is the same as a full read
//  3 a value changed WITHOUT its timestamp moving (a forgetful writer): the fingerprint catches it and
//    the whole account is read again, so the new value still arrives
//  4 another account's saved answer is never used
//  5 signing out throws the saved answer away
// The mock server below follows api/store.js; the SQL itself is checked separately in pglite.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import crypto from 'crypto';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig';
const md5 = v => v == null ? null : crypto.createHash('md5').update(v).digest('hex');
const CL = {}; for (let i = 0; i < 30; i++) CL['c' + i] = { name: 'Client' + i + ' Person', _uAt: 1000, treatment: 'Facial' };
const srv = { sc_clients: { v: JSON.stringify(CL), u: 1 }, sc_hide_sample: { v: '1', u: 1 }, sc_bizinfo: { v: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test', _ts: 5 }), u: 1 } };
let clock = 1e12; const reqs = [];
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.addInitScript(([t, cl]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
  localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1'); localStorage.setItem('sc_clients', cl); localStorage.setItem('sc_hide_sample', '1'); }, [TOK, srv.sc_clients.v]);
await p.route('**/api/**', async r => { const req = r.request(); const url = new URL(req.url()); const u = url.pathname;
  const ok = body => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (u.includes('cloud-status')) return ok({ enabled: true });
  if (u === '/api/store' && req.method() === 'GET') {
    const since = +(url.searchParams.get('since') || 0); reqs.push(since); clock += 1000;
    const data = {}, h = {}, keep = {};
    for (const k of Object.keys(srv)) { const fresh = !since || srv[k].u > since; if (fresh) { data[k] = srv[k].v; h[k] = md5(srv[k].v); } else keep[k] = md5(srv[k].v); }
    const out = { data, h, count: Object.keys(srv).length, asOf: clock }; if (since) out.keep = keep; return ok(out); }
  return ok({ ok: true, data: {}, clients: [], events: [] }); });
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
const openApp = async () => { await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 20000 }); await p.waitForTimeout(600); };
const state = () => p.evaluate(async () => { const base = await _idb.get('pull_base'); return { note: JSON.parse(localStorage.getItem('scl_pull_asof') || 'null'), baseOwner: base && base.o, baseKeys: base ? Object.keys(base.v).sort().join(',') : '', ids: Object.keys(CL).length, biz: (JSON.parse(localStorage.getItem('sc_bizinfo') || '{}').name) || '', pulled: [...(Cloud._lastPulledKeys || [])].sort().join(','), syncable: _syncable('scl_pull_asof') }; });

await openApp(); let s1 = await state();
check('1. first open is a full read', reqs.length === 1 && reqs[0] === 0, JSON.stringify(reqs));
check('1. the answer is kept, stamped with her account, and never synced', s1.note && s1.note.o === 'prov_ash' && s1.baseOwner === 'prov_ash' && s1.baseKeys === 'sc_bizinfo,sc_clients,sc_hide_sample' && s1.syncable === false, JSON.stringify(s1));
// 2. her computer changed the business name
srv.sc_bizinfo = { v: JSON.stringify({ name: 'Glow Studio', ownerName: 'Ashley Test', _ts: 9 }), u: clock + 10 };
reqs.length = 0; await openApp(); const s2 = await state();
check('2. next open asks only for what changed since the last answer', reqs.length === 1 && reqs[0] === s1.note.t, JSON.stringify(reqs) + ' vs ' + s1.note.t);
check('2. the change arrives and nothing else is lost', s2.biz === 'Glow Studio' && s2.ids === 30 && s2.pulled === 'sc_bizinfo,sc_clients,sc_hide_sample', JSON.stringify(s2));
// 3. a client added by a writer that did not move the timestamp
const CL2 = Object.assign({}, CL, { cNew: { name: 'New Person', _uAt: 2000, treatment: 'Facial' } });
srv.sc_clients = { v: JSON.stringify(CL2), u: 1 };
reqs.length = 0; await openApp(); const s3 = await state();
check('3. a changed value with an unchanged timestamp is caught: the whole account is read', reqs.length === 2 && reqs[0] > 0 && reqs[1] === 0, JSON.stringify(reqs));
check('3. ...and the new client arrives', s3.ids === 31 && s3.biz === 'Glow Studio', JSON.stringify(s3));
// 4. a note that belongs to another account
await p.evaluate(() => localStorage.setItem('scl_pull_asof', JSON.stringify({ o: 'prov_other', t: 123 })));
reqs.length = 0; await openApp();
check("4. another account's saved answer is never used", reqs.length === 1 && reqs[0] === 0, JSON.stringify(reqs));
// 5. sign out
await p.evaluate(() => Cloud.logout()); await p.waitForTimeout(400);
const s5 = await p.evaluate(async () => ({ note: localStorage.getItem('scl_pull_asof'), base: !!(await _idb.get('pull_base')) }));
check('5. signing out throws the saved answer away', s5.note === null && s5.base === false, JSON.stringify(s5));
await b.close();
let pass = 0; for (const x of results) { console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + x.detail : '')); if (x.pass) pass++; }
console.log(`\n[${ENGINE}] ${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
