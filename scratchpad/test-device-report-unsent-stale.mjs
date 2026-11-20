// The device report says how many unsaved changes have waited over 5 minutes (unsentStale), next to the
// plain count. The report goes 8 s after launch, while that launch's own saves are still going up, so the
// plain count flagged a phone that was saving fine (provider watch 2026-11-20). Requires: 2 fresh + 3 old
// outbox entries -> unsent 5, unsentStale 3. PORT (default 8900). ENGINE=webkit for Safari.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8900, ENGINE = process.env.ENGINE || 'chromium';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOK = b64({ u: 'prov_ash' }) + '.sig';
const acct = { sc_hide_sample: '1', sc_bizinfo: JSON.stringify({ name: 'Glow', ownerName: 'Ashley Test' }) };
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.addInitScript(([a, t]) => { localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_cloud_seeded', '1');
  for (const k of Object.keys(a)) localStorage.setItem(k, a[k]); }, [acct, TOK]);
const reports = [];
await p.route('**/api/**', r => { const u = r.request().url();
  if (u.includes('/api/device-report') && r.request().method() === 'POST') reports.push(r.request().postData() || '');
  if (u.includes('/api/store') && r.request().method() !== 'GET') return r.fulfill({ status: 503, body: '{}' });   // keep the outbox from clearing
  r.fulfill({ status: 200, contentType: 'application/json', body: u.includes('cloud-status') ? '{"enabled":true}' : u.includes('/api/store') ? JSON.stringify({ data: acct }) : '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForTimeout(3000);
await p.evaluate(() => { const t = Date.now(); _outboxWrite({ owner: _outboxRead().owner || '', keys: { sc_a: t - 1000, sc_b: t - 2000, sc_c: t - 10 * 60e3, sc_d: t - 20 * 60e3, sc_e: t - 6 * 60e3 } });
  const o = _outboxRead(); window.__ok = Object.keys(o.keys).length; _devRepAt = 0; _sendDeviceReport(); });
await p.waitForTimeout(4000);
const last = reports.map(x => { try { return JSON.parse(x); } catch (e) { return {}; } }).pop() || {};
const rep = last.report || last;
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
ok(rep.unsentStale === 3, 'unsentStale counts only the 3 changes older than 5 minutes (got ' + rep.unsentStale + ', unsent ' + rep.unsent + ')');
ok(rep.unsent >= 5, 'the plain count is still sent for older readers');
await b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
