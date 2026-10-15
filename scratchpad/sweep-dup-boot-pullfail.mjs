// The account pull FAILS at the network level (phone on a weak signal at launch: fetch throws).
// Expect (CLAUDE.md §0.6/§3): the device does not upload its own, possibly week-old copy over the
// account, and once the network is back the app recovers (re-pulls) instead of staying blocked.
//
// What _cloudInit does today when pull() returns -1: it is not 0, so it takes the "account has data"
// branch, sets sc_cloud_seeded, and treats `Cloud._lastPulledKeys || new Set()` as "what the account
// holds". _lastPulledKeys was never assigned (fetch threw first), so EVERY local sc_* key is pushed as
// "missing from the account". _serverSeen is null too, so _dropBootShrinks() lets all of it through.
// And nothing ever calls pull() again, so _rosterNotReadYet() stays true for the whole session.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const STALE = { c1: { name: 'Jane Real', notes: 'week-old notes', _uAt: Date.now() - 7 * 86400000 } };
const ACCT = { c1: { name: 'Jane Real', notes: 'NEWER notes typed on the computer', _uAt: Date.now() - 3600000 },
  c2: { name: 'Added On Computer', _uAt: Date.now() - 3600000 } };
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(([stale]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
  localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1');
  localStorage.setItem('sc_cloud_seeded', '1'); localStorage.setItem('sc_clients', JSON.stringify(stale)); }, [STALE]);
const puts = []; let gets = 0; let clientsPolls = 0;
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') { gets++; if (gets === 1) return r.abort('internetdisconnected');
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(ACCT), sc_hide_sample: '1' } }) }); }
  if (u.includes('/api/store') && m !== 'GET') { try { const j = JSON.parse(r.request().postData() || '{}'); puts.push(Object.keys(j.items || {}).concat(j.key ? [j.key] : []).map(k => [k, (j.items || {})[k]])); } catch (e) {} }
  if (u.includes('/api/clients')) clientsPolls++;
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForTimeout(12000);
// connectivity is back; give the app time to notice (online event + 15s poll + focus)
await p.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(35000);
const st = await p.evaluate(() => ({ pulledOnce: !!Cloud._pulledOnce, pullFailed: !!Cloud._pullFailed, notYet: _rosterNotReadYet(), seeded: localStorage.getItem('sc_cloud_seeded'), c1: CL.c1 && CL.c1.notes, hasC2: !!CL.c2 }));
const pushedKeys = [...new Set(puts.flat().map(x => x[0]))];
const pushedClients = puts.flat().filter(x => x[0] === 'sc_clients').map(x => x[1]);
check('a failed pull does not upload this device\'s copy of every key as "missing from the account"', !pushedKeys.length || pushedKeys.length < 3, pushedKeys.length + ' keys: ' + pushedKeys.slice(0, 12).join(', '));
check('the stale client list is not pushed over the account', !pushedClients.some(v => /week-old/.test(v || '')), pushedClients.length + ' sc_clients upload(s)');
check('the app retries the account pull once the network is back', gets >= 2, 'GET /api/store count=' + gets);
check('client events (forms/messages/check-ins) are not blocked for the whole session', clientsPolls > 0, 'GET /api/clients polls=' + clientsPolls + ' state=' + JSON.stringify(st));
await ctx.close(); await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 300) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
