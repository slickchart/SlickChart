// sweep2-photo-recover-reupload: Settings -> Recover lost photos (_forcePhotoRecovery) pulls server-only
// photo bytes into capturedPhotos.__recovered__ WITHOUT marking them backed up (_markPhotoBackedUp), so the
// very next persist re-uploads every one of them. A >600000-char photo goes up in pieces, and piece 0 of
// /api/guide-file REPLACES the complete server row with a partial one marked complete=false
// (sweep2-photo-server-pg.mjs #2) — so until the last piece lands the only server copy is unservable,
// and if the app is closed mid-way it stays that way.
//   node scratchpad/sweep2-photo-recover-reupload.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ n, p: !!p, d: d || '' });
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext(); const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
const BIG = 'data:image/jpeg;base64,' + 'R'.repeat(700000);
const server = { ph_lost1: BIG, ph_lost2: 'data:image/jpeg;base64,' + 'S'.repeat(3000) };
const puts = [];
await p.route('**/api/**', async r => {
  const u = r.request().url(), m = r.request().method();
  const ok = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.includes('cloud-status')) return ok({ enabled: true });
  if (u.includes('/api/store') && m === 'GET') return ok({ data: { sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Dana' } }), sc_hide_sample: '1' } });
  if (u.includes('/api/guide-file')) {
    if (m === 'GET' && u.includes('list=photos')) return ok({ ok: true, photos: Object.keys(server).map(id => ({ id, type: 'image/jpeg', size: server[id].length, updated_at: new Date().toISOString() })) });
    if (m === 'GET') { const id = new URL(u).searchParams.get('id'); return server[id] ? ok({ ok: true, file: { id, name: '', type: 'image/jpeg', data: server[id] } }) : r.fulfill({ status: 404, body: '{}' }); }
    if (m === 'PUT') { const bd = JSON.parse(r.request().postData() || '{}'); puts.push({ id: bd.id, part: bd.part ? bd.part.index + '/' + bd.part.total : 'whole' }); return ok({ ok: true }); }
  }
  return ok({ ok: true, data: {}, clients: [], events: [] });
});
await p.goto('http://localhost:' + PORT + '/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(3000);
puts.length = 0;
const res = await p.evaluate(async () => { const r = await _forcePhotoRecovery(); return { r, backed: [..._loadPhotoBackedUp()], rec: (capturedPhotos.__recovered__ || []).map(x => x.pid) }; });
await p.waitForTimeout(6000);
check('recover: photos pulled back', res.rec.length === 2, JSON.stringify(res));
const re = puts.filter(x => /^ph_lost/.test(x.id));
check('recover: photos that came FROM the server are not uploaded back to it', !re.length, JSON.stringify(re));
check('recover: no chunked piece-0 re-send of an already-complete server photo', !re.some(x => x.id === 'ph_lost1' && x.part === '0/2'), JSON.stringify(re.filter(x => x.id === 'ph_lost1')));
const idbKeys = await p.evaluate(() => _idb.keys());
check('recover: restored photo bytes are not stored twice in IndexedDB (captured_photos + gfile_ph_*)', !idbKeys.some(k => /^gfile_ph_/.test(String(k))), JSON.stringify(idbKeys));
let bad = 0; for (const x of results) { if (!x.p) bad++; console.log((x.p ? 'PASS ' : 'FAIL ') + x.n + (x.d ? '  — ' + String(x.d).slice(0, 400) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`);
await b.close();
