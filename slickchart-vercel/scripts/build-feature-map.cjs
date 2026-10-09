#!/usr/bin/env node
// Generates FEATURES.md: what SlickChart actually DOES, derived from the code, never hand-written.
//
// Why this exists. A session told Ashley a provider's photos were "device-only and gone". They were
// not: they had been uploaded per-photo to the server for three weeks. The claim came from reading
// ONE comment in _exportAllData ("Session photos are not included — they stay on this device"),
// which is true of the EXPORT and says nothing about backup, and generalising it. The upload lived
// three functions away. That cost a day and nearly cost a provider 38 photos.
//
// A hand-written feature list would have rotted into the same kind of confident wrong answer. So
// every line below is derived from the source on each run, and check-generated.cjs fails the build
// if the committed file no longer matches. The section that would have prevented that specific
// mistake is "What leaves the device", which lists every client -> server call WITH the function
// that makes it: grepping it for "photo" answers the question in one look.
const fs = require('fs'), path = require('path');
const V = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(V, 'slickchart.html'), 'utf8');

const out = [];
const W = s => out.push(s);

// ── endpoints ────────────────────────────────────────────────────────────────
function walk(dir, acc) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (f.endsWith('.js')) acc.push(p);
  }
  return acc;
}
const apiFiles = walk(path.join(V, 'api'), []).sort();
const endpoints = apiFiles.map(p => {
  const src = fs.readFileSync(p, 'utf8');
  const rel = path.relative(path.join(V, 'api'), p).replace(/\.js$/, '');
  // Purpose: the first line of the file's leading comment block, minus the route restating itself.
  let purpose = '';
  for (const line of src.split('\n')) {
    const m = /^\s*\/\/\s?(.*)$/.exec(line);
    if (!m) { if (line.trim() === '') continue; break; }
    const t = m[1].trim();
    if (!t) continue;
    purpose = t.replace(/^\/api\/[a-z0-9/-]+\s*[—:-]*\s*/i, '').trim();
    if (purpose) break;
  }
  const methods = [...new Set([...src.matchAll(/req\.method\s*(?:===|!==|==|!=)\s*'([A-Z]+)'/g)].map(m => m[1]))];
  const gates = [];
  if (/FOUNDER_EMAILS|isFounder/.test(src)) gates.push('founder');
  if (/providerFromReq|verifyToken\(/.test(src)) gates.push('provider session');
  if (/getClientByToken|clientFromToken/.test(src)) gates.push('client link token');
  if (/APP_SHARED_SECRET/.test(src)) gates.push('shared secret');
  if (/STRIPE_WEBHOOK_SECRET|constructEvent|Invalid signature/.test(src)) gates.push('stripe signature');
  if (/CRON_SECRET|x-vercel-cron/i.test(src)) gates.push('cron');
  return { rel, purpose, methods, gates };
});

// ── what leaves the device: client -> server calls, with the caller ──────────
// This is the section that answers "is X saved to the server". Each row is a fetch in
// slickchart.html paired with the nearest enclosing function, so the capability is searchable by
// name rather than by remembering which file it lives in.
const lines = app.split('\n');
const fnAt = [];
{
  let cur = '(top level)';
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^\s*([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/.exec(lines[i]);
    if (m) cur = m[1] || m[2];
    fnAt[i] = cur;
  }
}
// A fetch is not always in the function you would search for. _backupPhotosToServer — the entire
// answer to "are photos on the server" — reaches it three hops away, through
// _uploadGuideFileToServer and _putFileWithRetry. A direct-fetch-only scan left it out, which
// would have made this table's own claim ("not here means device-only") wrong about the exact
// capability that caused the incident. So reachability is transitive, breadth-first, and each row
// records how many hops it took. Capped at 3: beyond that every generic caller (nav, a render)
// "reaches the server" and the table stops meaning anything.
const bodyLines = new Map();   // fn -> [line numbers]
lines.forEach((_, i) => {
  const fn = fnAt[i];
  if (!bodyLines.has(fn)) bodyLines.set(fn, []);
  bodyLines.get(fn).push(i);
});
const known = new Set([...bodyLines.keys()].filter(n => n !== '(top level)'));
const direct = new Map();   // fn -> Set(endpoint)
const callees = new Map();  // fn -> Set(fn)
for (const fn of known) {
  const body = bodyLines.get(fn).map(i => lines[i]).join('\n');
  const eps = new Set();
  for (const m of body.matchAll(/(?:fetch|_sqFetch)\(\s*['"`](\/api\/[A-Za-z0-9/_-]+)/g)) eps.add(m[1]);
  direct.set(fn, eps);
  const cs = new Set();
  for (const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (m[1] !== fn && known.has(m[1])) cs.add(m[1]);
  }
  callees.set(fn, cs);
}
const MAX_HOPS = 3;
const callRows = [];
for (const fn of [...known].sort()) {
  // BFS out from this function until an endpoint is found, shortest path first.
  const seen = new Set([fn]);
  let frontier = [{ n: fn, via: null }], hop = 0;
  const found = new Map();   // endpoint -> {hops, via}
  while (frontier.length && hop <= MAX_HOPS) {
    const next = [];
    for (const cur of frontier) {
      for (const ep of direct.get(cur.n) || []) {
        if (!found.has(ep)) found.set(ep, { hops: hop, via: cur.n === fn ? null : cur.n });
      }
      for (const c of callees.get(cur.n) || []) {
        if (seen.has(c)) continue;
        seen.add(c);
        next.push({ n: c, via: cur.n === fn ? c : cur.via });
      }
    }
    frontier = next; hop++;
  }
  // A function that reaches half the API is an orchestrator (nav, a reload pass, a render), not a
  // capability, and listing all of its endpoints buries the rows that mean something. Those keep
  // only what they call themselves.
  const busy = found.size > 5;
  for (const [ep, info] of [...found].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (busy && info.hops > 0) continue;
    callRows.push({ fn, ep, hops: info.hops, via: info.via });
  }
}
const interesting = callRows;

// ── server tables ────────────────────────────────────────────────────────────
const dbsrc = fs.readFileSync(path.join(V, 'lib', 'db.js'), 'utf8');
const tables = [...new Set([...dbsrc.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/g)].map(m => m[1]))].sort();
const otherLibs = fs.readdirSync(path.join(V, 'lib')).filter(f => f.endsWith('.js'));
otherLibs.forEach(f => {
  const s = fs.readFileSync(path.join(V, 'lib', f), 'utf8');
  [...s.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/g)].forEach(m => { if (!tables.includes(m[1])) tables.push(m[1]); });
});
tables.sort();

// ── synced keys and how each one merges ──────────────────────────────────────
function registry(name) {
  const m = new RegExp('const ' + name + '=\\{([\\s\\S]*?)\\n?\\};', 'm').exec(app)
         || new RegExp('const ' + name + '=\\{([^}]*)\\}').exec(app);
  return m ? [...new Set([...m[1].matchAll(/(sc_[a-z0-9_]+)\s*:/g)].map(x => x[1]))] : [];
}
const REG = {
  'union by id + delete record (_mergeAuthoredById)': registry('_LIB_TOMB'),
  'map of lists, union per bucket (_mergeAuthoredMap)': registry('_MAP_LIB_TOMB'),
  'grow-only object union (_TOMB_OBJ)': registry('_TOMB_OBJ'),
  'grow-only list union (_TOMB_ARR)': registry('_TOMB_ARR'),
  'sticky true (_STICKY_TRUE)': registry('_STICKY_TRUE'),
  'per-client map (_mergeClientMap)': registry('_CLIENT_MAP_KEYS'),
  'per-client map whose entries ACCUMULATE (_CLIENT_MAP_LIST)': registry('_CLIENT_MAP_LIST')
};
const pullDispatch = (() => {
  const a = app.indexOf('const setFromServer='), b = app.indexOf('pushAllLocal()', a);
  const seg = a >= 0 && b >= 0 ? app.slice(a, b) : '';
  return [...new Set([...seg.matchAll(/k\s*===\s*['"](sc_[a-z0-9_]+)['"]/g)].map(m => m[1]))].sort();
})();

// ── recovery tools, and whether anything can actually REACH them ─────────────
// _openPhotoRecovery existed, worked, and had NO CALLERS for weeks. Nothing flagged it. A defined
// function whose name appears exactly once in the file is called from nowhere.
const recovery = [];
[...app.matchAll(/^\s*(?:async\s+)?function\s+(_?[A-Za-z_$][\w$]*(?:[Rr]ecover|[Rr]estore|[Rr]escue|[Hh]eal|[Rr]epair)[\w$]*)\s*\(/gm)]
  .forEach(m => {
    const name = m[1];
    if (recovery.some(r => r.name === name)) return;
    const uses = (app.match(new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g')) || []).length;
    recovery.push({ name, uses, reachable: uses > 1 });
  });
recovery.sort((a, b) => a.name.localeCompare(b.name));
const orphaned = recovery.filter(r => !r.reachable);

// ── write ────────────────────────────────────────────────────────────────────
W('# What SlickChart does');
W('');
W('**Generated by `node scripts/build-feature-map.cjs`. Do not edit by hand** — `check-generated.cjs`');
W('rebuilds it and fails CI if this file no longer matches the code.');
W('');
W('Read this before answering "does SlickChart do X" or "is X saved anywhere". It exists because a');
W('session once told the owner a provider\'s photos were gone when they had been on the server for');
W('three weeks; the claim came from one comment about the EXPORT, generalised without grepping.');
W('**Never state that a capability does not exist without searching this file first.**');
W('');
W('## What leaves the device');
W('');
W('Every call slickchart.html makes to the server, with the function that reaches it, following up');
W('to 3 hops of helpers. **If something a provider creates is backed up, its upload is in this');
W('table. If it is not in this table, it is device-only.**');
W('');
W('It errs toward over-reporting: a listed call may be conditional, and a long helper chain can');
W('attribute a call to a caller that only reaches it on one branch. That is the deliberate');
W('direction — a spurious row costs a moment, a missing one cost a day. Use it to answer "is this');
W('saved anywhere", not "does this always call that".');
W('');
W('| Caller | Endpoint | How |');
W('|---|---|---|');
interesting.forEach(r => W('| `' + r.fn + '` | `' + r.ep + '` | '
  + (r.hops === 0 ? 'direct' : ('via `' + r.via + '`')) + ' |'));
W('');
W('Plus every synced `sc_*` key below, which rides `/api/store`.');
W('');
W('## Server endpoints');
W('');
W('| Endpoint | Methods | Gated by | Purpose |');
W('|---|---|---|---|');
endpoints.forEach(e => W('| `/api/' + e.rel + '` | ' + (e.methods.join(', ') || '—') + ' | '
  + (e.gates.join(', ') || '**public**') + ' | ' + e.purpose.replace(/\|/g, '\\|').slice(0, 150) + ' |'));
W('');
W('## Server tables');
W('');
W(tables.map(t => '`' + t + '`').join(', ') + '.');
W('');
W('Anything in these survives a lost or wiped device. Anything only in localStorage or IndexedDB');
W('does not.');
W('');
W('## Synced keys, and how each one merges on pull');
W('');
W('A key that accumulates data and is NOT listed here rides the plain overwrite, which means a');
W('stale device can wipe newer data from another one (CLAUDE.md §0.6).');
W('');
Object.keys(REG).forEach(k => {
  if (!REG[k].length) return;
  W('**' + k + '**  ');
  W(REG[k].sort().map(x => '`' + x + '`').join(', ') + '');
  W('');
});
W('**Special-cased in `Cloud.pull()`**  ');
W(pullDispatch.map(x => '`' + x + '`').join(', '));
W('');
W('## Recovery and repair paths that already exist');
W('');
W('Check here before building a new one.');
W('');
W('| Function | Reachable |');
W('|---|---|');
recovery.forEach(r => W('| `' + r.name + '` | ' + (r.reachable ? 'yes' : '**NO — nothing calls it**') + ' |'));
W('');
if (orphaned.length) {
  W('> **' + orphaned.length + ' recovery function(s) above are defined but never called.** That is how');
  W('> `_openPhotoRecovery` sat unreachable while a provider was told her photos were unrecoverable.');
  W('> Either wire it up or delete it.');
  W('');
}

const target = path.join(V, '..', 'FEATURES.md');
const text = out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
fs.writeFileSync(target, text);
console.log('feature-map: ' + endpoints.length + ' endpoints, ' + interesting.length + ' client→server calls, '
  + tables.length + ' tables, ' + recovery.length + ' recovery paths'
  + (orphaned.length ? (', ' + orphaned.length + ' UNREACHABLE') : '')
  + (prev === text ? ' (unchanged)' : ' (updated)'));
