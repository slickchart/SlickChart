// §0: two providers on ONE device. A signs out (online, and with unsent edits while offline), then B signs in
// on the same browser. B must see none of A's clients, notes or photos, and nothing of A may reach B's account.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const engine = process.env.PW_ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const b = await engine.launch(process.env.PW_ENGINE === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  ' + String(d || '').slice(0, 300))); if (!c) fails++; };
const tok = u => Buffer.from(JSON.stringify({ u, e: u + '@x.com', iat: 1 })).toString('base64url') + '.sig' + u;
const big = 'data:image/jpeg;base64,' + 'A'.repeat(40000);
for (const mode of ['online', 'offline-unsent']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
  const A = { sc_clients: JSON.stringify({ a1: { name: 'Annabel Secretclient', phone: '5551110000', notes: 'A-private chart note' } }), sc_hide_sample: '1', sc_professions: '["esty"]',
    sc_session_summaries: JSON.stringify({ a1: [{ id: 's1', text: 'A-private summary', _ts: 1 }] }) };
  const Bsrv = { sc_hide_sample: '1' };   // B is a brand-new, empty account: the riskiest case (an empty pull pushes everything local)
  const srv = { [tok('A')]: A, [tok('B')]: Bsrv };
  let off = false; const sentToB = [];
  await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method(); const auth = (r.request().headers()['authorization'] || '').replace(/^Bearer /, '');
    if (off && !/api\/login/.test(u)) return r.abort('internetdisconnected');
    if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
    if (u.includes('/api/login')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, token: tok('B'), email: 'b@x.com' }) });
    const s = srv[auth];
    if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: s ? 200 : 401, contentType: 'application/json', body: JSON.stringify(s ? { data: s } : { error: 'auth' }) });
    if (m !== 'GET' && auth === tok('B')) sentToB.push(u.replace(/^https?:\/\/[^/]+/, '') + ' ' + (r.request().postData() || ''));
    if (u.includes('/api/store') && m !== 'GET' && s) { try { const j = JSON.parse(r.request().postData() || '{}'); Object.assign(s, j.items || (j.key ? { [j.key]: j.value } : {})); } catch (e) {} }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
  await p.addInitScript(([t]) => { if (!sessionStorage.getItem('__booted')) { sessionStorage.setItem('__booted', '1'); localStorage.setItem('sc_token', t); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_login_email', 'a@x.com'); } }, [tok('A')]);
  await p.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' }); await p.waitForTimeout(6000);
  const seenA = await p.evaluate(() => Object.values(CL).map(c => c.name));
  ok(seenA.includes('Annabel Secretclient'), `[${mode}] A sees her client`, JSON.stringify(seenA));
  // A takes a big photo (goes to IndexedDB) and types a note
  await p.evaluate(big => { capturedPhotos.a1 = [{ url: big, ts: Date.now(), phase: 'before', pid: 'phA' }]; try { persistCapturedPhotos(); } catch (e) {} CL.a1.notes = 'A-private typed just now'; saveClients(); }, big);
  if (mode === 'offline-unsent') { off = true; await p.evaluate(() => { CL.a1.allergies = 'A-private latex'; saveClients(); }); await p.waitForTimeout(1500); }
  await p.evaluate(() => { cloudLogout(); });
  await p.waitForTimeout(600);
  // Offline she is warned; she signs out anyway
  await p.evaluate(() => { const btn = Array.from(document.querySelectorAll('#confirm-modal button, button')).reverse().find(x => /sign out/i.test(x.textContent)); if (btn) btn.click(); });
  await p.waitForTimeout(5000);
  off = false;
  // B signs in through the real front door
  await p.waitForSelector('#login-email', { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => { const e = document.getElementById('login-email'), w = document.getElementById('login-pw'); if (e) e.value = 'b@x.com'; if (w) w.value = 'pw-b'; doLogin(); });
  await p.waitForTimeout(8000);
  const after = await p.evaluate(async () => {
    const names = Object.values(typeof CL !== 'undefined' ? CL : {}).map(c => c.name);
    const ls = Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join('\n');
    let idb = ''; try { const ks = typeof _lsAllKeys === 'function' ? _lsAllKeys() : []; idb = ks.map(k => k + '=' + (typeof _lsGet === 'function' ? _lsGet(k) : '')).join('\n'); } catch (e) {}
    let ph = ''; try { ph = JSON.stringify(capturedPhotos).slice(0, 2000); } catch (e) {}
    return { names, dom: document.body.innerText, ls, idb, ph, owner: typeof _tokenOwner === 'function' ? _tokenOwner() : '' };
  });
  const leak = s => /Annabel|Secretclient|A-private|phA/.test(s);
  ok(after.owner === 'B', `[${mode}] B is signed in`, after.owner);
  ok(!after.names.some(n => /Annabel/.test(n)), `[${mode}] B's client list has none of A's clients`, JSON.stringify(after.names));
  ok(!leak(after.dom), `[${mode}] nothing of A on B's screen`, (after.dom.match(/.{0,60}(Annabel|A-private).{0,60}/) || [''])[0]);
  ok(!leak(after.ls) && !leak(after.idb), `[${mode}] nothing of A left on the device for B`, ((after.ls + after.idb).match(/.{0,80}(Annabel|A-private|phA).{0,40}/) || [''])[0]);
  ok(!leak(after.ph), `[${mode}] none of A's photos in B's photo store`, after.ph.slice(0, 200));
  const toB = sentToB.join('\n');
  ok(!leak(toB) && !leak(JSON.stringify(Bsrv)), `[${mode}] nothing of A was sent to B's account`, (toB.match(/.{0,80}(Annabel|A-private|phA).{0,40}/) || [''])[0]);
  ok(!errs.length, `[${mode}] no page errors`, errs.join(' | '));
  if (mode === 'offline-unsent') ok(/latex/.test(A.sc_clients || '') || true, '[offline] (info) A\'s unsent edit ' + (/latex/.test(A.sc_clients || '') ? 'reached A' : 'stayed unsent, as warned'));
  await ctx.close();
}
await b.close();
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
