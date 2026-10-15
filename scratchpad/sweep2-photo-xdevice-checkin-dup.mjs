// sweep2-photo-xdevice-checkin-dup: a client sends a pre-visit check-in with 2 photos while the provider
// has the app open on TWO devices (phone + computer). syncClientEvents polls every 15s on each device and
// files the photos into capturedPhotos with a RANDOM pid (_photoPid) on whichever device sees the event —
// so each device mints its own copy, uploads it, and adds it to sc_photo_index. The index unions by pid
// (_CLIENT_MAP_LIST), so the account ends up with every photo twice, and every device restores both.
//   node scratchpad/sweep2-photo-xdevice-checkin-dup.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const check = (n, p, d) => results.push({ n, p: !!p, d: d || '' });
const srv = { kv: { sc_hide_sample: '1', sc_onboarded: '1', sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Dana Client', email: 'd@x.com' } }) }, files: {}, events: [] };
const IMG1 = 'data:image/jpeg;base64,' + 'X'.repeat(3000), IMG2 = 'data:image/jpeg;base64,' + 'Y'.repeat(3000);
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function device(name, ctx) {
  ctx = ctx || await b.newContext();
  const p = await ctx.newPage(); p._ctx = ctx;
  await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_cloud_seeded', '1'); });
  await p.route('**/api/**', async r => {
    const u = r.request().url(), m = r.request().method();
    const ok = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('cloud-status')) return ok({ enabled: true });
    if (u.includes('/api/store')) {
      if (m === 'GET') return ok({ data: Object.assign({}, srv.kv) });
      let bd = {}; try { bd = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      Object.entries(bd.items || {}).forEach(([k, v]) => { srv.kv[k] = v == null ? null : String(v); });
      return ok({ ok: true });
    }
    if (u.includes('/api/guide-file')) {
      if (m === 'PUT') { const bd = JSON.parse(r.request().postData() || '{}'); srv.files[bd.id] = bd.data; return ok({ ok: true }); }
      if (u.includes('list=photos')) return ok({ ok: true, photos: [] });
      const id = new URL(u).searchParams.get('id'); return srv.files[id] ? ok({ ok: true, file: { id, data: srv.files[id], type: 'image/jpeg' } }) : r.fulfill({ status: 404, body: '{}' });
    }
    if (u.includes('/api/clients')) {
      if (m === 'GET') return ok({ ok: true, clients: [{ id: 'c1', name: 'Dana Client', email: 'd@x.com', token: 't_c1', data: {} }], events: srv.events });
      return ok({ ok: true, saved: 1, clients: [{ id: 'c1', token: 't_c1' }], failed: [] });
    }
    return ok({ ok: true, data: {}, clients: [], events: [], customers: [], bookings: [] });
  });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  return p;
}
const phone = await device('phone'), computer = await device('computer');
// Client submits a check-in with two photos.
srv.events.push({ id: 'ev_ci_1', client_id: 'c1', kind: 'checkin', created_at: new Date().toISOString(),
  payload: { client: 'Dana Client', treatment: 'Facial', dateLabel: 'Oct 16', time: '10:00', groups: [], flagged: [], notes: '', photos: [IMG1, IMG2] } });
// Both devices run their normal 15s poll (call it directly so the test does not depend on timer phase).
await Promise.all([phone.evaluate(() => syncClientEvents()), computer.evaluate(() => syncClientEvents())]);
await sleep(4000);
for (const p of [phone, computer]) await p.evaluate(async () => { try { await _pushFlushNow(); } catch (e) {} try { clearTimeout(Cloud._timer); await Cloud._flush(0); } catch (e) {} });
await sleep(1500);
for (const p of [phone, computer]) await p.evaluate(async () => { await Cloud.pull(); try { _reloadAll(); } catch (e) {} try { await _pushFlushNow(); } catch (e) {} });
await sleep(2500);
let idx = {}; try { idx = JSON.parse(srv.kv.sc_photo_index || '{}'); } catch (e) {}
const accountCopies = (idx.c1 || []).length;
check('account photo index holds the 2 check-in photos once each', accountCopies === 2, 'sc_photo_index.c1 has ' + accountCopies + ' entries; files on server: ' + Object.keys(srv.files).length);
// The computer relaunches (its boot restore pulls whatever the index names).
const comp2 = await device('computer-relaunch', computer._ctx);
await sleep(4000);
const onComputer = await comp2.evaluate(() => (capturedPhotos.c1 || []).filter(p => p.source === 'checkin' || p.phase === 'reference').length);
check('after relaunch the computer shows each check-in photo once', onComputer === 2, onComputer + ' photos on Dana\'s chart');
let bad = 0; for (const x of results) { if (!x.p) bad++; console.log((x.p ? 'PASS ' : 'FAIL ') + x.n + (x.d ? '  — ' + String(x.d).slice(0, 400) : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`);
await b.close();
