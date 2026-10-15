// Shared harness for the sweep-dup-xdevice-* repros: N browser contexts ("devices") signed into ONE
// account, all talking to a single in-memory mock of /api/store (kv, plain overwrite like api/store.js)
// and /api/clients (rows with deleted_at, upsert no-ops on a deleted row, like lib/clients.js).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
export const PORT = process.env.PORT || 8899;
export const results = [];
export const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d === undefined ? '' : (typeof d === 'string' ? d : JSON.stringify(d)) });
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function makeServer(seedKv, seedRows) {
  const kv = Object.assign({ sc_hide_sample: '1', sc_onboarded: '1' }, seedKv || {});
  const rows = {};   // id -> {id,name,email,phone,data,deleted_at}
  Object.entries(seedRows || {}).forEach(([id, c]) => { rows[id] = { id, name: c.name || '', email: c.email || '', phone: c.phone || '', data: c, deleted_at: null }; });
  const puts = [];   // log of every PUT: {dev, keys}
  return { kv, rows, puts };
}

export async function launch() {
  return pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
}

// Boot one device. localSeed: localStorage to set BEFORE the app boots (the device's own stale copy).
export async function device(browser, srv, name, localSeed, patchJs) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  p._errs = []; p.on('pageerror', e => p._errs.push(e.message));
  p._name = name;
  await p.addInitScript((seed) => {
    if (sessionStorage.getItem('booted')) return; sessionStorage.setItem('booted', '1');
    localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1');
    localStorage.setItem('sc_cloud_seeded', '1');
    Object.entries(seed || {}).forEach(([k, v]) => localStorage.setItem(k, v));
  }, localSeed || {});
  await p.route('**/api/**', async r => {
    const u = r.request().url(), m = r.request().method();
    const ok = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('cloud-status')) return ok({ enabled: true });
    if (u.includes('/api/store')) {
      if (m === 'GET') return ok({ data: Object.assign({}, srv.kv) });
      let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      if (body.rescue) return ok({ ok: true, rescued: 0 });
      const items = body.items || (body.key !== undefined ? { [body.key]: body.value } : {});
      // Mirrors api/store.js (2026-10-15f): the delete / put-back / merge records MERGE on the server.
      const NEWEST = Object.assign({ sc_deleted_clients: 1, sc_undeleted_clients: 1, sc_merged_ids: 1 }, srv.newest || {}), UNION = { sc_merged_into: 1 };
      Object.entries(items).forEach(([k, v]) => {
        if ((NEWEST[k] || UNION[k]) && v != null) { try { const o = JSON.parse(srv.kv[k] || '{}') || {}, n = JSON.parse(String(v)) || {};
          if (UNION[k]) Object.assign(o, n); else Object.keys(n).forEach(i => { const a = typeof o[i] === 'number' ? o[i] : (i in o ? 1 : 0), b = typeof n[i] === 'number' ? n[i] : 1; o[i] = Math.max(a, b); });
          srv.kv[k] = JSON.stringify(o); return; } catch (e) {} }
        if (k === 'sc_clients' && v != null) { try { const ro = JSON.parse(String(v)), del = JSON.parse(srv.kv.sc_deleted_clients || '{}') || {}, und = JSON.parse(srv.kv.sc_undeleted_clients || '{}') || {};
          Object.keys(ro).forEach(i => { if (!(i in del)) return; const dd = typeof del[i] === 'number' ? del[i] : 1, uu = typeof und[i] === 'number' ? und[i] : (i in und ? 1 : 0); if (dd > uu) delete ro[i]; });
          srv.kv[k] = JSON.stringify(ro); return; } catch (e) {} }
        srv.kv[k] = v == null ? null : String(v); });
      srv.puts.push({ dev: name, keys: Object.keys(items), items });
      return ok({ ok: true, saved: Object.keys(items).length });
    }
    if (u.includes('/api/clients')) {
      if (m === 'GET') return ok({ ok: true, clients: Object.values(srv.rows).filter(x => !x.deleted_at).map(x => ({ id: x.id, name: x.name, email: x.email, phone: x.phone, token: 't_' + x.id, data: x.data })), events: [] });
      let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      (body.deletedIds || []).forEach(id => { if (srv.rows[id] && !srv.rows[id].deleted_at) srv.rows[id].deleted_at = Date.now(); });
      const out = [];
      (body.clients || []).forEach(c => {
        const ex = srv.rows[c.id];
        if (ex && ex.deleted_at) { out.push({ id: c.id, token: 't_' + c.id, deleted: true }); return; }
        srv.rows[c.id] = { id: c.id, name: c.name, email: c.email, phone: c.phone, data: c.data, deleted_at: null };
        out.push({ id: c.id, token: 't_' + c.id });
      });
      return ok({ ok: true, saved: out.length, clients: out, failed: [] });
    }
    return ok({ ok: true, data: {}, clients: [], events: [], customers: [], bookings: [] });
  });
  // patchJs (optional, sweep2): a script injected right AFTER the app's own scripts, before boot's
  // first network answer — lets a repro run the app with a proposed fix applied.
  if (patchJs) await p.route('**/slickchart.html', async r => {
    const res = await r.fetch(); let html = await res.text();
    const i = html.lastIndexOf('</body>');
    html = html.slice(0, i) + '<script>' + patchJs + '</script>' + html.slice(i);
    return r.fulfill({ response: res, body: html, headers: Object.assign({}, res.headers(), { 'content-type': 'text/html' }) });
  });
  await p.goto('http://localhost:' + PORT + '/slickchart.html');
  await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  return p;
}

// Flush every pending upload on a device.
export async function flush(p) {
  await p.evaluate(async () => {
    try { if (typeof _pushFlushNow === 'function') await _pushFlushNow(); } catch (e) {}
    try { clearTimeout(Cloud._timer); await Cloud._flush(0); } catch (e) {}
  });
  await sleep(600);
}
// What a device does when it comes back to the foreground / resyncs.
export async function resync(p) {
  await p.evaluate(async () => { await Cloud.pull(); try { _reloadAll(); } catch (e) {} });
  await sleep(400);
  await flush(p);
}
export const ids = (p) => p.evaluate(() => Object.keys(CL).sort());
export const kvClients = (srv) => { try { return Object.keys(JSON.parse(srv.kv.sc_clients || '{}')).sort(); } catch (e) { return ['<bad>']; } };
export const kvDeleted = (srv) => { try { return Object.keys(JSON.parse(srv.kv.sc_deleted_clients || '{}')).sort(); } catch (e) { return ['<bad>']; } };

export function report() {
  let bad = 0;
  for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail ? '  — ' + String(x.detail).slice(0, 400) : '')); }
  console.log(`\n${results.length - bad}/${results.length} passed`);
  return bad;
}
