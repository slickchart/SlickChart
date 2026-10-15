// CLAUDE.md §0: one account's data must never reach another account.
// Boot with account A's session; the server answers 401 (expired / revoked). pull() calls Cloud.logout(),
// which only clears the token — A's client list stays in localStorage, IndexedDB and CL — and _cloudInit
// shows the sign-in screen WITHOUT reloading. Someone then signs in as account B on the same page
// (shared front-desk tablet, or Ashley testing a second account). doLogin() pulls B and _reloadAll()s,
// but sc_clients is MERGED (union) with what the device holds, so A's clients land in B's list and the
// superset is pushed to B's account. _doLogout() purges exactly this; the 401 path skips it.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const A = { a1: { name: 'Alice OfAccountA', email: 'alice@a.com', notes: 'A private notes', _uAt: Date.now() - 86400000 } };
const B = { b1: { name: 'Bob OfAccountB', email: 'bob@b.com', _uAt: Date.now() - 86400000 } };
const tok = u => Buffer.from(JSON.stringify({ u, sid: 's' + u })).toString('base64url') + '.sig';
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
await p.addInitScript(([a, ta]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
  localStorage.setItem('sc_token', ta); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1');
  localStorage.setItem('sc_cloud_seeded', '1'); localStorage.setItem('sc_clients', JSON.stringify(a)); }, [A, tok('provA')]);
const putsToB = [];
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method(); const auth = r.request().headers()['authorization'] || '';
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/login')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: tok('provB'), email: 'b@b.com' }) });
  const isB = auth.includes(tok('provB'));
  if (u.includes('/api/store') && m === 'GET') { if (!isB) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"This session has been signed out."}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(B), sc_hide_sample: '1' } }) }); }
  if (u.includes('/api/store') && m !== 'GET' && isB) { try { putsToB.push(r.request().postData() || ''); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForTimeout(4000);
const mid = await p.evaluate(() => ({ token: !!Cloud.token, inCL: Object.values(CL).map(c => c.name), onDisk: !!localStorage.getItem('sc_clients') }));
await p.evaluate(() => { for (const [id, v] of [['login-email', 'b@b.com'], ['login-pw', 'password123']]) { let el = document.getElementById(id); if (!el) { el = document.createElement('input'); el.id = id; document.body.appendChild(el); } el.value = v; } doLogin(); });
await p.waitForTimeout(9000);
const after = await p.evaluate(() => Object.values(CL).map(c => c.name));
check('after a 401 at boot, account A\'s clients are not left on the device for the next sign-in', !mid.onDisk && !mid.inCL.length, JSON.stringify(mid));
check('signing in as B does not show A\'s clients', !after.some(n => /AccountA/.test(n)), JSON.stringify(after));
check('A\'s clients are never uploaded to account B', !putsToB.some(s => /AccountA|A private notes/.test(s)), putsToB.filter(s => /AccountA/.test(s)).length + ' upload(s) to B carry A\'s clients');
await ctx.close(); await b.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 300) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
