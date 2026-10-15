// sweep2-photo-xaccount: provider A signs out, provider B signs in on the SAME device.
// _doLogout() / _purgeOffloaded() only clear 'lskv_*' IndexedDB keys; the photo store lives at
// IndexedDB 'captured_photos' (and 'gfile_*'), which nothing clears and nothing owner-stamps.
// Expectation (§0): B must never see, index, or upload A's client photos.
//   node scratchpad/sweep2-photo-xaccount.mjs   (needs the :8899 server from CLAUDE.md)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const tok = u => Buffer.from(JSON.stringify({ u, sid: 's_' + u })).toString('base64url') + '.sig';
const TA = tok('prov_A'), TB = tok('prov_B');
const PIX = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
const results = []; const check = (n, p, d) => results.push({ n, p: !!p, d: d || '' });

const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext();
const p = await ctx.newPage(); p.on('pageerror', e => console.log('pageerror', e.message));
let who = 'A';
const uploads = []; const pushes = [];
await ctx.route('**/api/**', async r => {
  const u = r.request().url(); const m = r.request().method();
  const auth = r.request().headers()['authorization'] || '';
  const as = auth.includes(TB) ? 'B' : auth.includes(TA) ? 'A' : '?';
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') {
    const acct = who === 'A' ? { cA: { id: 'cA', name: 'Alice OfA' } } : { cB: { id: 'cB', name: 'Bob OfB' } };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sc_clients: JSON.stringify(acct), sc_hide_sample: '1', sc_onboarded: '1' } }) });
  }
  if (u.includes('/api/guide-file') && m === 'GET' && u.includes('list=photos')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"photos":[]}' });
  if (u.includes('/api/guide-file') && m === 'PUT') { const bd = JSON.parse(r.request().postData() || '{}'); uploads.push({ as, id: bd.id }); }
  if (m !== 'GET') { try { const bd = JSON.parse(r.request().postData() || '{}'); pushes.push({ as, u, bd }); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' });
});
await p.addInitScript(([TA]) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('sc_token', TA); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); } }, [TA]);
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(9000);

// A takes a before photo of her client.
await p.evaluate(async (PIX) => {
  if (!capturedPhotos.cA) capturedPhotos.cA = [];
  capturedPhotos.cA.push({ url: PIX, ts: Date.now(), phase: 'before', angle: 'Front', pid: 'ph_AAA1' });
  await persistCapturedPhotos();
}, PIX);
await p.waitForTimeout(2500);
check('A: photo uploaded under A', uploads.some(x => x.as === 'A' && x.id === 'ph_AAA1'), JSON.stringify(uploads));

// A signs out.
await p.evaluate(async () => { const r = location.reload; try { await _doLogout(); } catch (e) {} });
await p.waitForTimeout(3000);
const idbAfterLogout = await p.evaluate(() => new Promise(res => { const rq = indexedDB.open('slickchart', 1); rq.onsuccess = () => { const t = rq.result.transaction('kv', 'readonly').objectStore('kv'); const g = t.get('captured_photos'); g.onsuccess = () => res(g.result ? Object.keys(g.result) : null); g.onerror = () => res('err'); }; rq.onerror = () => res('err'); }));
check('logout clears A\'s photo store from IndexedDB', !idbAfterLogout || !idbAfterLogout.includes('cA'), 'IDB captured_photos keys after logout: ' + JSON.stringify(idbAfterLogout));

// B signs in on the same device.
who = 'B'; uploads.length = 0; pushes.length = 0;
await p.evaluate((TB) => { localStorage.setItem('sc_token', TB); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); }, TB);
await p.reload(); await p.waitForTimeout(10000);
const mem = await p.evaluate(() => Object.keys(capturedPhotos || {}));
check('B: A\'s client photos are NOT loaded into B\'s memory', !mem.includes('cA'), 'capturedPhotos keys in B session: ' + JSON.stringify(mem));
check('B: A\'s photo is NOT uploaded into B\'s account', !uploads.some(x => x.as === 'B' && x.id === 'ph_AAA1'), JSON.stringify(uploads));
const idxPush = pushes.filter(x => x.as === 'B' && JSON.stringify(x.bd).includes('ph_AAA1'));
check('B: A\'s photo id not pushed into B\'s synced keys (sc_photo_index)', !idxPush.length, idxPush.map(x => x.u + ' ' + JSON.stringify(x.bd).slice(0, 200)).join(' | '));
const scan = await p.evaluate(() => { try { return _photoRecoveryScan(); } catch (e) { return String(e); } });
check('B: Recover-photos screen does not offer A\'s photos as "Unassigned"', !(scan && scan.orphans || []).some(o => o.id === 'cA'), JSON.stringify(scan));

let bad = 0; for (const x of results) { if (!x.p) bad++; console.log((x.p ? 'PASS ' : 'FAIL ') + x.n + (x.d ? '  — ' + String(x.d).slice(0, 400) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`);
await b.close();
