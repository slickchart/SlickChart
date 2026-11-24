// SYNC GROWTH SWEEP (2026-11-18). Every synced key, two devices, five rounds of syncing with no edits.
//
// Why: on 2026-11-17 sc_autos and sc_imported_products doubled on every pull (Lisa's sc_autos reached
// 85 MB) until every upload was refused. Both had their own regression test once found, but nothing
// generic would have caught them, or will catch the NEXT key with the same bug. This sweep does not
// name the keys it checks: it asks the running page which keys sync (the merge registries, the keys
// Cloud.pull() special-cases, every sc_* literal in the source that _syncable() accepts, and whatever
// boot leaves on the device), builds a sample for each in its shape, and drives the REAL Cloud.pull()
// path (pull + _reloadAll + upload) against the shared mock account in sweep-dup-xdevice-lib.mjs.
//
//   node scratchpad/sweep-sync-growth.mjs                 Chromium
//   bash scratchpad/run-in-safari.sh scratchpad/sweep-sync-growth.mjs        WebKit
//   CONTROL=1 node scratchpad/sweep-sync-growth.mjs       puts the 2026-11-17 _mergeAuthoredById back
//                                                          in the page (and takes sc_autos' later natural
//                                                          key away); MUST report sc_autos growing, exit 0
//   MODE=full|merge  (default both: 'full' = pull + _reloadAll + upload, 'merge' = pull + upload only)
//   ONLY=sc_autos,sc_forms  FAMILY=unkeyed  VERBOSE=1     narrow a run while debugging
//
// Properties (per key, on device A, device B and the account):
//   (a) growth     after round 2 (A has then seen B's first upload) nothing grows, in rows or bytes,
//                  through round 5; and no store ever holds more rows than the distinct union of what
//                  the two devices and the account started with (that catches a doubling in round 1-2)
//   (b) echo       account and both devices hold the SAME value: nothing grows, nothing is uploaded
//   (c) exact dups no list (top level, or a per-client inner list) ends with byte-identical repeat rows
//                  that none of the inputs had
//   (d) edit-dups  one field of one row changed on device A: after syncing, ONE copy on A, B and the
//                  account, not two. Reported as its own category; does not fail the run.
//   coverage       every key with a merge path (a registry, or a case in Cloud.pull()) has a sample
//
// Sample families: each run uses three, so a merge is exercised in every row shape it could meet:
//   typical  rows with ids and _ts, string id lists, {id:ts} maps
//   unkeyed  rows WITHOUT ids (the sc_autos shape), inner lists whose entries carry no key
//   nested   rows with object/array fields, OBJECT rows in id lists (the sc_imported_products shape)
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = [path.resolve(HERE, '..', 'slickchart-vercel'), path.resolve(HERE, '..', '..', 'slickchart-vercel'), new URL('../slickchart-vercel', import.meta.url).pathname+'']
  .find(d => fs.existsSync(path.join(d, 'slickchart.html')));
const CONTROL = process.env.CONTROL === '1';
const VERBOSE = process.env.VERBOSE === '1';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const FAMILIES = process.env.FAMILY ? process.env.FAMILY.split(',') : (CONTROL ? ['unkeyed'] : ['typical', 'unkeyed', 'nested']);
const MODES = process.env.MODE ? process.env.MODE.split(',') : ['full', 'merge'];
const ROUNDS = 5, EDIT_ROUNDS = 3;
const T0 = Date.now() - 3600e3;

// ── a static server for the app, on a free port, so the sweep needs nothing running beforehand ──
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const statics = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
await new Promise(res => statics.listen(0, '127.0.0.1', res));
process.env.PORT = String(statics.address().port);
const lib = await import('./sweep-dup-xdevice-lib.mjs');   // reads PORT when it loads
const { makeServer, device, sleep } = lib;

// The lib's launch() names a Chromium build that is not always installed; these two literal calls
// are what run-in-safari.sh rewrites to WebKit.
async function launchBrowser() {
  if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) return pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  return pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
}

// Injected after the app's scripts: counts uploads in flight (so "settled" means settled), and in
// CONTROL mode restores the 2026-11-17 merge that pushed every unkeyed row from both sides.
const PATCH = `(function(){
  var f=window.fetch;window.__inflight=0;
  window.fetch=function(u,o){var put=o&&o.method==='PUT'&&String(u).indexOf('/api/store')>=0;if(put)window.__inflight++;
    var p=f.apply(this,arguments);if(put)p.then(function(){window.__inflight--;},function(){window.__inflight--;});return p;};
  ${CONTROL ? `try{var s=_mergeAuthoredById.toString();
    var t=s.replace(/if\\(keepUnkeyed\\)\\{const sg=_rowSig\\(c\\);if\\(!\\(sg in useen\\)\\)\\{useen\\[sg\\]=1;out\\.push\\(c\\);\\}\\}/,'if(keepUnkeyed)out.push(c);');
    /* 2026-11-18 the app also gave sc_autos a natural key (name|trigger); before that its rows had no identity at all. */
    try{if(typeof _LIB_NATURAL!=='undefined')delete _LIB_NATURAL.sc_autos;}catch(e){}
    window.__controlPatched=(t!==s);if(t!==s)(0,eval)(t.replace(/^function _mergeAuthoredById/,'window._mergeAuthoredById=function'));}catch(e){window.__controlPatched='error '+e.message;}` : ''}
})();`;

// ── what the page says syncs ─────────────────────────────────────────────────────────────────────
async function enumerate(p) {
  return p.evaluate(() => {
    const ks = o => (o && typeof o === 'object') ? Object.keys(o) : [];
    const reg = {
      tombObj: ks(_TOMB_OBJ), tombArr: ks(_TOMB_ARR), sticky: ks(_STICKY_TRUE), lib: ks(_LIB_TOMB),
      mapLib: ks(typeof _MAP_LIB_TOMB !== 'undefined' ? _MAP_LIB_TOMB : {}), clientMap: ks(_CLIENT_MAP_KEYS),
      clientMapList: ks(_CLIENT_MAP_LIST), clientMapObj: typeof _CLIENT_MAP_OBJ !== 'undefined' ? _CLIENT_MAP_OBJ : {},
      natural: ks(typeof _LIB_NATURAL !== 'undefined' ? _LIB_NATURAL : {}),
    };
    // Delete records named by _LIB_TOMB / _MAP_LIB_TOMB are synced keys too.
    [].concat(...Object.values(_LIB_TOMB).map(v => [].concat(v)), ...Object.values(typeof _MAP_LIB_TOMB !== 'undefined' ? _MAP_LIB_TOMB : {}))
      .forEach(t => { if (!reg.tombObj.includes(t) && !reg.tombArr.includes(t)) reg.tombObj.push(t); });
    const pullSrc = Cloud._pullInner.toString();
    const special = [...new Set([...pullSrc.matchAll(/k\s*===\s*['"](sc_[a-z0-9_]+)['"]/g)].map(m => m[1]))];
    const src = [...document.scripts].map(s => s.textContent).join('\n');
    const lits = [...new Set([...src.matchAll(/['"](sc_[a-z0-9_]+)['"]/g)].map(m => m[1]))];
    const local = _lsAllKeys();
    const all = [...new Set([].concat(...Object.values(reg).filter(Array.isArray), special, lits, local))].filter(k => _syncable(k) && !/_$/.test(k)).sort();
    const defaults = {}; all.forEach(k => { const v = _lsGet(k); if (v != null) defaults[k] = v; });
    const notSynced = special.filter(k => !_syncable(k));
    return { reg, special, all, defaults, notSynced };
  });
}

// ── samples ──────────────────────────────────────────────────────────────────────────────────────
// side: 'S' (account), 'A', 'B'. Everything has COMMON parts (identical on all three) and a part
// unique to the side, so a correct union ends with common + 3 uniques and a doubling shows at once.
const CLIENTS = { S: ['c1', 'c2', 'c3'], A: ['c1', 'c2', 'c4'], B: ['c1', 'c2', 'c5'] };
const UNIQ = { S: 10, A: 20, B: 30 };
const NAMES = ['Ava Stone', 'Bea Lin', 'Cara Diaz', 'Dee Moss', 'Eve Park', 'Fay Wu'];
function row(key, i, fam) {
  const base = { name: `${key.slice(3)} item ${i}`, note: `note ${i}`, on: true, sent: 0 };
  if (fam === 'unkeyed') return Object.assign(base, { trigger: `${i} days after visit`, icon: '*' });
  const r = Object.assign({ id: `${key}-r${i}` }, base, { _ts: T0 + i });
  if (fam === 'nested') Object.assign(r, { meta: { tags: ['a', 'b' + i], size: { w: i, h: 2 } }, lines: [{ q: 1, sku: 'S' + i }] });
  return r;
}
const rows = (key, side, fam) => [row(key, 0, fam), row(key, 1, fam), row(key, UNIQ[side], fam)];
function clientInner(key, cid, side, fam, reg) {
  const n = +cid.slice(1), t = T0 + n * 1000;
  const list = reg.clientMapList.includes(key);
  if (key === 'sc_session_summaries') {
    const e = d => fam === 'unkeyed' ? { text: `summary ${cid} ${d}`, service: 'Facial' } : { _draftDate: `2026-11-0${d}`, ts: t + d, text: `summary ${cid} ${d}`, _ts: t + d };
    return cid === 'c1' ? [e(1), e(side === 'S' ? 2 : side === 'A' ? 3 : 4)] : [e(1)];
  }
  if (key === 'sc_photo_index') {
    const e = d => fam === 'unkeyed' ? { name: `photo ${cid} ${d}`, angle: 'front' } : { pid: `ph-${cid}-${d}`, ts: t + d, angle: 'front' };
    return cid === 'c1' ? [e(1), e(side === 'S' ? 2 : side === 'A' ? 3 : 4)] : [e(1)];
  }
  if (key === 'sc_client_recs' || key === 'sc_summary_guides') return fam === 'nested' ? [{ id: 'p1', qty: 1 }, { id: 'p2', qty: 2 }] : ['p1', 'p2'];
  if (key === 'sc_client_homecare') return ['Cleanser AM', 'SPF 30 daily'];
  if (key === 'sc_rec_reasons') return { p1: `why p1 for ${cid}`, p2: `why p2 for ${cid}` };
  if (key === 'sc_healing_stage') return 'day 3';
  const mode = reg.clientMapObj[key];
  if (mode === 'stamped') return { ts: t, text: `${key.slice(3)} for ${cid}`, marks: [{ x: 1, y: 2 }], status: 'sent' };
  if (mode === 'map') return { k1: `v1 ${cid}`, k2: `v2 ${cid}` };
  if (list) return [{ id: `${key}-${cid}-1`, ts: t, _ts: t }];
  return [{ id: `${key}-${cid}-1`, ts: t, _ts: t, label: 'entry' }];   // a new per-client key: a list of records
}
const clientRec = (cid) => { const n = +cid.slice(1); return { id: cid, name: NAMES[n - 1], firstName: NAMES[n - 1].split(' ')[0], email: `${cid}@example.test`, phone: `555010${n}`, notes: `Real notes for ${cid}: sensitive skin, likes peels.`, skinType: 'Combination', _uAt: T0 + n * 1000, submittedForms: [], summaries: [] }; };
const msg = (cid, i, fam) => fam === 'unkeyed' ? { from: i % 2 ? 'client' : 'pro', text: `msg ${i} for ${cid}`, ts: T0 + i } : { _mid: `m-${cid}-${i}`, from: i % 2 ? 'client' : 'pro', text: `msg ${i} for ${cid}`, ts: T0 + i };

// Hand-written samples for the keys Cloud.pull() special-cases. A NEW special case with no entry here
// (and no registry to generate from) fails the coverage check, on purpose.
const HAND = {
  sc_clients: (s) => Object.fromEntries(CLIENTS[s].map(c => [c, clientRec(c)])),
  sc_msgstore: (s, f) => Object.fromEntries(CLIENTS[s].map(c => [c, c === 'c1' ? [msg(c, 1, f), msg(c, 2, f), msg(c, UNIQ[s], f)] : [msg(c, 1, f)]])),
  sc_threads: (s) => CLIENTS[s].map(c => ({ id: c, name: NAMES[+c.slice(1) - 1], last: 'see you soon', ts: T0, unread: false })),
  sc_seen_events: (s) => ['ev1', 'ev2', 'ev' + UNIQ[s]],
  sc_attn_seen: (s) => ({ a1: T0, a2: T0 + 1, ['a' + UNIQ[s]]: T0 + UNIQ[s] }),
  sc_import_batches: (s) => [{ id: 'b1', at: Date.now() - 60e3, source: 'csv', label: 'Import', ids: ['c1'], rows: 1 }, { id: 'b' + UNIQ[s], at: Date.now() - 30e3, source: 'csv', label: 'Import', ids: ['c2'], rows: 1 }],
  sc_courses: (s, f) => [0, 1, UNIQ[s]].map(i => Object.assign({ id: 'own-course-' + i, title: 'My course ' + i, status: 'Published', _ts: T0 + i, lessons: [{ id: 'l1', title: 'Intro' }] }, f === 'nested' ? { meta: { level: { n: i } } } : {})),
  sc_resources: (s, f) => [0, 1, UNIQ[s]].map(i => Object.assign({ id: 'own-guide-' + i, title: 'My guide ' + i, body: 'Steps ' + i, _ts: T0 + i }, f === 'nested' ? { files: [{ n: 'a.pdf' }] } : {})),
  sc_forms: (s) => ({ tmpls: { 'own-form-0': [{ q: 'How is your skin?' }], ['own-form-' + UNIQ[s]]: [{ q: 'Allergies?' }] }, guides: {}, emojis: {}, custom: [0, 1, UNIQ[s]].map(i => ({ id: 'own-form-' + i, name: 'My form ' + i, _ts: T0 + i, fields: [{ id: 'q1', type: 'text', label: 'Q' }] })) }),
  sc_manual_appts: (s) => [0, 1, UNIQ[s]].map(i => ({ id: 'appt-' + i, clientId: 'c1', clientName: 'Ava Stone', date: '2026-12-0' + (1 + i % 8), time: '10:00', service: 'Facial', dur: 60, _ts: T0 + i })),
  sc_bookings: (s) => [0, 1, UNIQ[s]].map(i => ({ id: 'bk-' + i, status: 'pending', name: 'Jo ' + i, email: `jo${i}@example.test`, date: '2026-12-10', time: '11:00', service: 'Facial', ts: T0 + i })),
  sc_workspace: (s) => ({ clientRecs: Object.fromEntries(CLIENTS[s].map(c => [c, ['p1', 'p2']])), recReasons: Object.fromEntries(CLIENTS[s].map(c => [c, { p1: 'why ' + c }])), clientHomecare: Object.fromEntries(CLIENTS[s].map(c => [c, ['SPF']])), customProducts: [], inOffice: {}, codes: {} }),
  sc_summary_drafts: (s) => { const o = { note: {}, obs: {}, src: {}, _ts: { note: {}, obs: {}, src: {} } }; CLIENTS[s].forEach(c => { o.note[c] = 'draft for ' + c; o.obs[c] = 'obs for ' + c; o._ts.note[c] = T0; o._ts.obs[c] = T0; }); return o; },
  sc_sent_routines: (s) => ({ esty: Object.fromEntries(CLIENTS[s].map(c => [c, { ts: T0, routineId: 'r1', steps: ['Cleanse', 'SPF'] }])) }),
  sc_pro_vc_subs: (s) => Object.fromEntries(CLIENTS[s].map(c => [c, { id: 'vs-' + c, ts: T0, kind: 'product', photos: [], answers: { q: 'a' } }])),
  sc_suggested_forms: () => ({ list: ['own-form-0'], _ts: T0 }),
  sc_routines: (s, f) => ({ esty: rows('sc_routines', s, f === 'unkeyed' ? 'typical' : f), lash: [row('sc_routines', 40, 'typical')] }),
};
// _mergeStamped settings blobs: the app's own default, stamped. Same value on every side (a
// last-writer-wins blob cannot "union"; the check is that it does not grow or ping-pong).
const STAMPED_FROM_DEFAULT = ['sc_bizinfo', 'sc_brand_colors', 'sc_availability'];

function kindOf(k, reg, special) {
  if (k === 'sc_clients' || HAND[k]) return 'hand';
  if (STAMPED_FROM_DEFAULT.includes(k)) return 'stamped';
  if (reg.lib.includes(k)) return 'lib';
  if (reg.mapLib.includes(k)) return 'mapLib';
  if (reg.clientMap.includes(k)) return 'clientMap';
  if (reg.tombObj.includes(k)) return 'tombObj';
  if (reg.tombArr.includes(k)) return 'tombArr';
  if (reg.sticky.includes(k)) return 'sticky';
  if (special.includes(k)) return 'special-unsampled';
  return 'plain';
}
// Returns the stored string for one side, or undefined = do not seed this key.
function sample(k, kind, side, fam, ctx) {
  const { reg, defaults } = ctx;
  switch (kind) {
    case 'hand': return JSON.stringify(HAND[k](side, fam));
    case 'stamped': { let o = {}; try { o = JSON.parse(defaults[k] || '{}') || {}; } catch (e) {} if (!o || typeof o !== 'object' || Array.isArray(o)) o = {}; o._ts = T0; return JSON.stringify(o); }
    case 'lib': {
      // Rows without ids keep their identity only through _LIB_NATURAL (name) or not at all (sc_autos).
      return JSON.stringify(rows(k, side, fam));
    }
    case 'mapLib': return JSON.stringify({ esty: rows(k, side, fam), lash: [row(k, 40, fam)] });
    case 'clientMap': return JSON.stringify(Object.fromEntries(CLIENTS[side].map(c => [c, clientInner(k, c, side, fam, reg)])));
    case 'tombObj': return JSON.stringify({ [`gone-${k.slice(3)}-1`]: T0, [`gone-${k.slice(3)}-2`]: T0 + 1, [`gone-${k.slice(3)}-${UNIQ[side]}`]: T0 + UNIQ[side] });
    case 'tombArr': {
      const ids = [1, 2, UNIQ[side]];
      if (fam === 'nested') return JSON.stringify(ids.map(i => ({ id: `ip-${i}`, name: `Product ${i}`, brand: 'Brand', imported: true, price: { amt: i } })));
      if (fam === 'unkeyed') return JSON.stringify(ids.map(i => ({ name: `Product ${i}`, brand: 'Brand' })));
      return JSON.stringify(ids.map(i => `gone-${k.slice(3)}-${i}`));
    }
    case 'sticky': return '1';
    case 'plain': return defaults[k] != null ? defaults[k] : undefined;   // the app's own value; overwrite cannot union
    default: return undefined;
  }
}

// ── measuring ────────────────────────────────────────────────────────────────────────────────────
const P = s => { try { return JSON.parse(s); } catch (e) { return undefined; } };
const sig = r => { if (r && typeof r === 'object' && !Array.isArray(r)) { const o = Object.assign({}, r); delete o._ts; return JSON.stringify(o); } return JSON.stringify(r); };
function rowsOf(v) {   // count: top-level rows, plus one level in for maps (Cloud._weigh's measure)
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') { let n = 0; for (const k of Object.keys(v)) { n++; const x = v[k]; if (Array.isArray(x)) n += x.length; else if (x && typeof x === 'object') n += Object.keys(x).length; } return n; }
  return 0;
}
function entries(v) {   // the distinct things a correct union can hold
  const out = new Set();
  if (Array.isArray(v)) v.forEach(r => out.add(sig(r)));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { out.add('k:' + k); const x = v[k]; if (Array.isArray(x)) x.forEach(r => out.add(k + '/' + sig(r))); else if (x && typeof x === 'object') Object.keys(x).forEach(s => out.add(k + '/' + s)); }
  return out;
}
function exactDups(v) {
  let n = 0; const scan = a => { const seen = new Set(); a.forEach(r => { const s = JSON.stringify(r); if (seen.has(s)) n++; else seen.add(s); }); };
  if (Array.isArray(v)) scan(v); else if (v && typeof v === 'object') Object.values(v).forEach(x => { if (Array.isArray(x)) scan(x); });
  return n;
}
const stat = s => s == null ? { rows: 0, bytes: 0, dups: 0 } : { rows: rowsOf(P(s)), bytes: String(s).length, dups: exactDups(P(s)) };
const localValues = (p, keys) => p.evaluate(ks => { const o = {}; ks.forEach(k => { const v = _lsGet(k); if (v != null) o[k] = String(v); }); return o; }, keys);

async function settle(p) {
  let quiet = 0;
  for (let i = 0; i < 60; i++) {
    const st = await p.evaluate(async () => {
      try { if (typeof _pushFlushNow === 'function') _pushFlushNow(); } catch (e) {}
      try { if (Object.keys(Cloud._queue || {}).length) { clearTimeout(Cloud._timer); Cloud._flush(0); } } catch (e) {}
      return { q: Object.keys(Cloud._queue || {}).length, b: Cloud._pushBatch ? Object.keys(Cloud._pushBatch.items || {}).length : 0, inf: window.__inflight || 0 };
    });
    if (!st.q && !st.b && !st.inf) { if (++quiet >= 3) return true; } else quiet = 0;
    await sleep(100);
  }
  return false;
}
// full:  what a device does on resume: read the account, reload every library, upload.
// merge: read the account and upload, no reload. The merges on their own must be idempotent; a loader
//        that heals a doubled list afterwards (sc_autos has one since 2026-11-17) must not be what
//        keeps a key from growing, or the next key without such a loader grows unseen.
async function syncOnce(p, mode) {
  await p.evaluate(async (m) => { await Cloud.pull(); if (m === 'full') { try { _reloadAll(); } catch (e) {} } }, mode);
  await settle(p);
}

// ── results ──────────────────────────────────────────────────────────────────────────────────────
const fails = { coverage: [], growth: [], echo: [], dups: [], editDups: [], harness: [] };
const note = (cat, msg) => { fails[cat].push(msg); if (VERBOSE) console.log('  [' + cat + '] ' + msg); };
const series = (snaps, store, k, f) => snaps.map(s => stat(s[store][k])[f]).join('>');

async function runFamily(b, fam, mode, ctx) {
  const tag = fam + '/' + mode;
  const { keys } = ctx;
  const seeded = keys.filter(k => sample(k, ctx.kind[k], 'S', fam, ctx) !== undefined);
  const val = side => Object.fromEntries(seeded.map(k => [k, sample(k, ctx.kind[k], side, fam, ctx)]));
  const rowsFor = side => Object.fromEntries(CLIENTS[side].map(c => [c, clientRec(c)]));

  // ── 1. divergent: account S, phone A, laptop B, each holding common + its own unique part ──
  {
    const S = val('S'), LA = val('A'), LB = val('B');
    const srv = makeServer(S, rowsFor('S'));
    const A = await device(b, srv, 'A-' + tag, LA, PATCH);
    if (CONTROL) { const cp = await A.evaluate(() => window.__controlPatched); if (cp !== true) note('harness', 'CONTROL patch did not apply: ' + cp); }
    await settle(A);
    const B = await device(b, srv, 'B-' + tag, LB, PATCH);
    await settle(B);
    const boot = { A: await localValues(A, keys), B: await localValues(B, keys), srv: Object.assign({}, srv.kv) };
    const snaps = [];
    for (let r = 1; r <= ROUNDS; r++) {
      await syncOnce(A, mode); await syncOnce(B, mode);
      snaps.push({ A: await localValues(A, keys), B: await localValues(B, keys), srv: Object.assign({}, srv.kv) });
    }
    for (const k of keys) {
      const ins = [S[k], LA[k], LB[k], boot.A[k], boot.B[k], boot.srv[k]].filter(x => x != null);
      const bound = new Set(); ins.forEach(x => entries(P(x)).forEach(e => bound.add(e)));
      const inDups = Math.max(0, ...ins.map(x => exactDups(P(x))));
      for (const store of ['A', 'B', 'srv']) {
        const st = snaps.map(s => stat(s[store][k]));
        // (a) no growth from round 2 on
        for (let r = 2; r < ROUNDS; r++) {
          if (st[r].rows > st[r - 1].rows || st[r].bytes > st[r - 1].bytes) {
            note('growth', `${k} [${tag}/divergent] ${store} grew after round 2: rows ${series(snaps, store, k, 'rows')}, bytes ${series(snaps, store, k, 'bytes')}`); break;
          }
        }
        const top = Math.max(...st.map(x => x.rows));
        if (bound.size && top > bound.size) note('growth', `${k} [${tag}/divergent] ${store} holds ${top} rows, more than the ${bound.size} distinct ones that exist: rows ${series(snaps, store, k, 'rows')}, bytes ${series(snaps, store, k, 'bytes')}`);
        // (c) exact duplicates that were not in any input
        const d = st[ROUNDS - 1].dups;
        if (d > inDups) note('dups', `${k} [${tag}/divergent] ${store} ends with ${d} exact repeat row(s) (inputs had ${inDups}); rows ${series(snaps, store, k, 'rows')}`);
      }
    }
    // ── 4. one field of one row edited on A ──
    const before = { A: await localValues(A, keys), B: await localValues(B, keys), srv: Object.assign({}, srv.kv) };
    const edited = await A.evaluate((ks) => {
      const done = [];
      // A field that is NOT the row's identity (a vendor's name is its key), changed the way an edit
      // screen changes it: the row's own edit stamp moves, no new fields appear.
      const pickField = o => ['note', 'notes', 'text', 'label', 'service', 'title', 'trigger', 'status', 'name'].find(f => typeof o[f] === 'string') || Object.keys(o).find(f => typeof o[f] === 'string' && f !== 'id' && f !== '_mid' && f !== 'pid');
      const touch = o => { const f = pickField(o); if (!f) return false; o[f] = o[f] + ' (edited)'; const now = Date.now(); if ('_ts' in o) o._ts = now; if ('_uAt' in o) o._uAt = now; if (!('_ts' in o) && typeof o.ts === 'number') o.ts = now; return true; };
      for (const k of ks) {
        let v; try { v = JSON.parse(_lsGet(k)); } catch (e) { continue; }
        let ok = false, at = null;   // at: the client/bucket whose inner list holds the edited row
        if (Array.isArray(v)) { const r = v.find(x => x && typeof x === 'object' && !Array.isArray(x)); if (r) ok = touch(r); }
        else if (v && typeof v === 'object') {
          for (const id of Object.keys(v)) { const x = v[id];
            if (Array.isArray(x)) { const r = x.find(y => y && typeof y === 'object' && !Array.isArray(y)); if (r && touch(r)) { ok = true; at = id; break; } }
            else if (x && typeof x === 'object' && !Array.isArray(x) && k !== 'sc_forms' && k !== 'sc_summary_drafts' && k !== 'sc_workspace') { if (touch(x)) { ok = true; break; } }
          }
        }
        if (!ok) continue;
        try { if (_LIB_TOMB[k] && Array.isArray(v)) _stampRows(k, v); } catch (e) {}
        localStorage.setItem(k, JSON.stringify(v)); done.push([k, at]);
      }
      return done;
    }, keys.filter(k => ctx.kind[k] !== 'plain' && ctx.kind[k] !== 'sticky'));
    await settle(A);
    const esnaps = [];
    for (let r = 1; r <= EDIT_ROUNDS; r++) { await syncOnce(A, mode); await syncOnce(B, mode); esnaps.push({ A: await localValues(A, keys), B: await localValues(B, keys), srv: Object.assign({}, srv.kv) }); }
    const last = esnaps[EDIT_ROUNDS - 1];
    // Counted in the list that holds the edited row: the top-level list, or that client's inner list.
    const inList = (str, at) => { const v = P(str); const x = at == null ? v : (v && v[at]); return Array.isArray(x) ? x.length : (x && typeof x === 'object') ? Object.keys(x).length : 0; };
    for (const [k, at] of edited) {
      const was = inList(before.A[k], at);
      const now = ['A', 'B', 'srv'].map(s => inList(last[s][k], at));
      if (now.some(n => n > was)) note('editDups', `${k} [${tag}] one row edited on A${at ? ' (in ' + at + "'s list)" : ''}: ${was} rows before, after sync A=${now[0]} B=${now[1]} account=${now[2]}`);
    }
    ctx.editedKeys[tag] = edited.length;
    ctx.errs.push(...A._errs, ...B._errs);
    await A.context().close(); await B.context().close();
  }

  // ── 2. echo: the same value on the account and both devices ──
  {
    const S = val('S');
    const srv = makeServer(S, rowsFor('S'));
    const A = await device(b, srv, 'eA-' + tag, S, PATCH); await settle(A);
    const B = await device(b, srv, 'eB-' + tag, S, PATCH); await settle(B);
    const boot = { A: await localValues(A, keys), B: await localValues(B, keys), srv: Object.assign({}, srv.kv) };
    const mark = srv.puts.length, marks = [];
    const snaps = [];
    for (let r = 1; r <= ROUNDS; r++) { marks.push(srv.puts.length); await syncOnce(A, mode); await syncOnce(B, mode); snaps.push({ A: await localValues(A, keys), B: await localValues(B, keys), srv: Object.assign({}, srv.kv) }); }
    // A key the account held: any upload at all is an echo. A key a loader CREATED after boot (the
    // account never had it) is uploaded once when it appears; only an upload from round 3 on counts.
    const pushed = {}, late = {};
    srv.puts.slice(mark).forEach(x => x.keys.forEach(k => { pushed[k] = (pushed[k] || 0) + 1; }));
    srv.puts.slice(marks[2]).forEach(x => x.keys.forEach(k => { late[k] = (late[k] || 0) + 1; }));
    for (const k of keys) {
      if (pushed[k] && VERBOSE) srv.puts.slice(mark).filter(x => x.keys.includes(k)).forEach(x => console.log(`    ${k} uploaded by ${x.dev}: ${String(x.items[k]).slice(0, 300)}\n      account held: ${String(S[k]).slice(0, 300)}`));
      if (S[k] != null ? pushed[k] : late[k]) note('echo', `${k} [${tag}/identical] uploaded ${pushed[k]} time(s) in ${ROUNDS} rounds with nothing changed${S[k] == null ? ' (' + late[k] + ' from round 3 on; the account did not hold it at the start)' : ''} (account rows ${series(snaps, 'srv', k, 'rows')}, bytes ${series(snaps, 'srv', k, 'bytes')})`);
      // Boot may normalise a value once (a loader adding a field); that is not growth. Growth is any
      // round adding to the round before, or more rows than the account and the booted devices held.
      const ins = [S[k], boot.A[k], boot.B[k], boot.srv[k]].filter(x => x != null);
      const bound = new Set(); ins.forEach(x => entries(P(x)).forEach(e => bound.add(e)));
      const inDups = Math.max(0, ...ins.map(x => exactDups(P(x))));
      for (const store of ['A', 'B', 'srv']) {
        const st = snaps.map(s => stat(s[store][k]));
        const top = Math.max(...st.map(x => x.rows));
        if (bound.size && top > bound.size) note('growth', `${k} [${tag}/identical] ${store} holds ${top} rows, more than the ${bound.size} distinct ones the account and devices held: rows ${series(snaps, store, k, 'rows')}, bytes ${series(snaps, store, k, 'bytes')}`);
        for (let r = 1; r < ROUNDS; r++) if (st[r].rows > st[r - 1].rows || st[r].bytes > st[r - 1].bytes) { note('growth', `${k} [${tag}/identical] ${store} grew round over round: rows ${series(snaps, store, k, 'rows')}, bytes ${series(snaps, store, k, 'bytes')}`); break; }
        if (st[ROUNDS - 1].dups > inDups) note('dups', `${k} [${tag}/identical] ${store} ends with ${st[ROUNDS - 1].dups} exact repeat row(s) (inputs had ${inDups})`);
      }
    }
    ctx.errs.push(...A._errs, ...B._errs);
    await A.context().close(); await B.context().close();
  }
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const b = await launchBrowser();
const probeSrv = makeServer({});
const probe = await device(b, probeSrv, 'probe', {}, PATCH);
await settle(probe); await syncOnce(probe, 'full'); await syncOnce(probe, 'full');   // keys loaders create after the first sync get a default too
const en = await enumerate(probe);
await probe.context().close();
const keys = en.all.filter(k => !ONLY || ONLY.has(k));
const ctx = { reg: en.reg, defaults: en.defaults, keys, kind: {}, editedKeys: {}, errs: [] };
keys.forEach(k => { ctx.kind[k] = kindOf(k, en.reg, en.special); });
// coverage: a key with a merge path must have a sample
for (const k of keys) {
  const kd = ctx.kind[k];
  if (kd === 'special-unsampled') note('coverage', `${k} is special-cased in Cloud.pull() but this sweep has no sample for it: add one to HAND`);
  else if (kd !== 'plain' && FAMILIES.some(f => sample(k, kd, 'S', f, ctx) === undefined)) note('coverage', `${k} (${kd}) produced no sample`);
}
const byKind = {}; keys.forEach(k => { (byKind[ctx.kind[k]] = byKind[ctx.kind[k]] || []).push(k); });
const unseededPlain = (byKind.plain || []).filter(k => en.defaults[k] == null);
console.log(`sync-growth sweep${CONTROL ? ' (CONTROL: 2026-11-17 _mergeAuthoredById restored)' : ''}: ${keys.length} synced keys, families ${FAMILIES.join('/')}`);
Object.keys(byKind).sort().forEach(kd => console.log(`  ${kd} (${byKind[kd].length}): ${byKind[kd].join(' ')}`));
console.log(`  plain keys with no value on a fresh device, so not seeded (an overwrite cannot grow; still measured if one appears): ${unseededPlain.length}`);
if (en.notSynced.length) console.log(`  special-cased in pull but never synced (skipped): ${en.notSynced.join(' ')}`);

for (const fam of FAMILIES) for (const mode of MODES) {
  const tf = Date.now();
  await runFamily(b, fam, mode, ctx);
  console.log(`  ${fam}/${mode}: done in ${((Date.now() - tf) / 1000).toFixed(0)}s, ${ctx.editedKeys[fam + '/' + mode]} keys edited for (d)`);
}
await b.close(); statics.close();

const uniq = a => [...new Set(a)];
const errs = uniq(ctx.errs);
if (errs.length) console.log(`\npage errors (${errs.length}):\n  ` + errs.slice(0, 10).join('\n  '));
const sect = (title, list) => { console.log(`\n${title}: ${list.length ? '' : 'none'}`); list.forEach(x => console.log('  ' + x)); };
sect('HARNESS', fails.harness);
sect('COVERAGE (fails the run)', fails.coverage);
sect('(a) GROWTH (fails the run)', fails.growth);
sect('(b) ECHO UPLOADS with nothing changed (fails the run)', fails.echo);
sect('(c) EXACT REPEAT ROWS (fails the run)', fails.dups);
sect('(d) EDIT-DUPLICATES (reported, does not fail the run)', fails.editDups);
const keysIn = l => uniq(l.map(x => x.split(' ')[0]));
const hard = fails.harness.length + fails.coverage.length + fails.growth.length + fails.echo.length + fails.dups.length;
console.log(`\nsummary: growth ${keysIn(fails.growth).join(',') || '-'} | echo ${keysIn(fails.echo).join(',') || '-'} | dups ${keysIn(fails.dups).join(',') || '-'} | edit-dups ${keysIn(fails.editDups).join(',') || '-'}`);
console.log(`runtime ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (CONTROL) {
  const caught = keysIn(fails.growth).includes('sc_autos');
  console.log(caught ? '\nCONTROL OK: the restored 2026-11-17 merge makes sc_autos grow, so the sweep can see the bug.' : '\nCONTROL FAILED: the sweep did not see sc_autos grow under the old merge. The harness is blind; do not trust a green run.');
  process.exit(caught && !fails.harness.length ? 0 : 1);
}
process.exit(hard ? 1 : 0);
