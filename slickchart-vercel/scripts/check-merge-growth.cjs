#!/usr/bin/env node
// THE "HUGE LIST" GUARD (2026-11-18). On 2026-11-17 two synced lists (sc_autos, sc_imported_products)
// copied themselves on EVERY pull, because a merge put the account's copy and the device's copy side by
// side. Lisa's sc_autos reached 85 MB, every upload was refused as too large, and six providers saw a
// "photo too large" popup over and over. Every merge function had been reviewed; none had been RUN
// against itself.
//
// This runs the app's REAL merge functions (lifted out of slickchart.html, with every helper they call)
// in plain Node, so CI needs no browser. For every merge, on several shapes of data (rows with ids,
// rows without, strings, objects in id lists, per-client maps, nested forms/summaries):
//   1. merge(X, X) is X: identical copies on both sides never grow and never report a change.
//   2. Repeated syncing settles: two devices + the account trading copies for 6 rounds stop growing
//      after the first exchange, and the account stops changing (no push on every pull, forever).
//   3. No exact repeat row appears that neither side had.
// A NEW merge function, or a new registry key whose merge is one of these, is covered automatically
// because the functions are found by name in the source. The full in-browser version of this, which
// drives Cloud.pull() on every synced key in Chromium and WebKit, is scratchpad/sweep-sync-growth.mjs.
const fs = require('fs'), path = require('path'), vm = require('vm');
// MERGE_GROWTH_SRC=<file> runs it against another copy (e.g. the 2026-11-17 build, which must fail).
const SRC = fs.readFileSync(process.env.MERGE_GROWTH_SRC || path.join(__dirname, '..', 'slickchart.html'), 'utf8');

// ── Lift top-level declarations out of the page by name ─────────────────────────────────────────
// A small scanner that knows strings, template literals, comments and regex literals, so a brace
// inside any of them does not end the function early.
function matchBrace(s, open) {
  let depth = 0, i = open, prevSig = '';
  const stack = [];                     // template literal nesting: depth at which `${` opened
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { i = s.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && n === '*') { i = s.indexOf('*/', i + 2) + 2; continue; }
    if (c === '"' || c === "'") { i++; while (i < s.length && s[i] !== c) { if (s[i] === '\\') i++; i++; } i++; prevSig = 'a'; continue; }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1] === depth)) {
      if (c === '}') stack.pop();
      i++;
      while (i < s.length && s[i] !== '`') {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === '$' && s[i + 1] === '{') { depth++; stack.push(depth); i += 2; break; }
        i++;
      }
      if (s[i] === '`') i++;
      prevSig = 'a';
      continue;
    }
    if (c === '/') {
      // A regex literal can only start where an expression can.
      if (!prevSig || /[(,=:[!&|?{};+\-*%<>~^]/.test(prevSig) || /\b(return|typeof|case|in|of)$/.test(s.slice(Math.max(0, i - 8), i).trimEnd())) {
        i++; let cls = false;
        while (i < s.length) { const d = s[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; else if (d === '\n') break; i++; }
        i++; while (/[a-z]/i.test(s[i])) i++;
        prevSig = 'a'; continue;
      }
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return -1;
}
const TOP_FN = new Map();
for (const m of SRC.matchAll(/\n(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) if (!TOP_FN.has(m[2])) TOP_FN.set(m[2], m.index + 1);
function liftFunction(name) {
  const at = TOP_FN.get(name); if (at == null) return null;
  const open = SRC.indexOf('{', SRC.indexOf(')', at));
  // parameters can hold defaults with braces; find the body brace after the closing paren of params
  let p = SRC.indexOf('(', at), d = 0, j = p;
  for (; j < SRC.length; j++) { if (SRC[j] === '(') d++; else if (SRC[j] === ')') { d--; if (!d) break; } }
  const body = SRC.indexOf('{', j);
  const end = matchBrace(SRC, body);
  if (end < 0 || open < 0) return null;
  return SRC.slice(at, end + 1);
}
function liftConst(name) {
  const m = new RegExp('\\n(?:const|let|var)\\s+' + name.replace(/\$/g, '\\$') + '\\s*=\\s*').exec(SRC);
  if (!m) return null;
  const start = m.index + 1, valAt = m.index + m[0].length;
  const ch = SRC[valAt];
  if (ch === '{' || ch === '[') {
    // object/array literal: match its own brackets via the brace scanner on a wrapped copy
    if (ch === '{') { const end = matchBrace(SRC, valAt); return SRC.slice(start, end + 1) + ';'; }
    let d = 0, i = valAt; for (; i < SRC.length; i++) { if (SRC[i] === '[') d++; else if (SRC[i] === ']') { d--; if (!d) break; } }
    return SRC.slice(start, i + 1) + ';';
  }
  const semi = SRC.indexOf(';', valAt);
  return SRC.slice(start, semi + 1);
}

// The merges under test, and the registries that steer them.
const ROOTS = ['_mergeClients', '_mergeTombstone', '_mergeMsgStore', '_mergeThreads', '_mergeBookings', '_mergeAuthoredById',
  '_mergeClientMap', '_mergeWorkspace', '_mergeSeenEvents', '_mergeAuthoredMap', '_unionEntryLists', '_dedupeList', '_dedupeSyncValue',
  '_mergeCourses', '_mergeResources', '_mergeAppts', '_mergeSummaryDrafts', '_mergeSentRoutines', '_mergeAttnSeen', '_mergeImportBatches',
  '_mergeForms', '_mergeStamped', '_libKeyFn', '_sameSyncValue'];
const CONSTS = ['_TOMB_OBJ', '_TOMB_ARR', '_TOMB_ARR_CAP', '_STICKY_TRUE', '_LIB_TOMB', '_MAP_LIB_TOMB', '_LIB_NATURAL', '_CLIENT_MAP_KEYS',
  '_CLIENT_MAP_LIST', '_CLIENT_MAP_OBJ', '_SAME_MAX', '_SHRINK_SCOPED'];
// Page globals that are state, not logic: provided empty.
const STATE = 'var _deletedClientIds={};var Cloud=undefined;var _lsStore={};function _lsGet(k){return Object.prototype.hasOwnProperty.call(_lsStore,k)?_lsStore[k]:null;}' +
  'var localStorage={getItem:_lsGet,setItem:function(k,v){_lsStore[k]=String(v);},removeItem:function(k){delete _lsStore[k];}};' +
  'function _goneClientIds(){return {};}function _unDeletedClientIds(){return {};}function _alAdd(){}function _noteClientRepaired(){}';
const STUBBED = new Set(['_lsGet', '_goneClientIds', '_unDeletedClientIds', '_alAdd', '_noteClientRepaired']);
const lifted = new Map(), missingRoots = [], unliftable = new Set();
const queue = ROOTS.filter(n => { if (!TOP_FN.has(n)) { missingRoots.push(n); return false; } return true; });
while (queue.length) {
  const n = queue.shift(); if (lifted.has(n) || STUBBED.has(n)) continue;
  let code = liftFunction(n);
  // A function the scanner cut short (an odd regex or template) does not compile on its own: stub it.
  if (code) { try { new vm.Script(code); } catch (e) { if (process.env.VERBOSE) console.log('cannot lift ' + n + ': ' + e.message); code = null; } }
  if (!code) { unliftable.add(n); continue; }
  lifted.set(n, code);
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) if (TOP_FN.has(m[1]) && !lifted.has(m[1]) && !STUBBED.has(m[1])) queue.push(m[1]);
}
let consts = '';
const needConsts = new Set(CONSTS);
for (const code of lifted.values()) for (const m of code.matchAll(/\b(_[A-Z][A-Z0-9_]+)\b/g)) needConsts.add(m[1]);
for (const c of needConsts) {
  const v = liftConst(c); if (!v) continue;
  const code = v.replace(/^(const|let)\s/, 'var ');
  try { new vm.Script(code); } catch (e) { if (process.env.VERBOSE) console.log('cannot lift ' + c + ': ' + e.message); continue; }
  consts += code + '\n';
}
const ctx = vm.createContext({ console });
try {
  // A helper the scanner could not lift (UI code, toasts) becomes a no-op: the merges only call
  // those for side effects. A ROOT that cannot be lifted is a failure, below.
  const stubs = [...unliftable].map(n => 'function ' + n + '(){}').join('\n');
  vm.runInContext(STATE + '\n' + consts + '\n' + stubs + '\n' + [...lifted.values()].join('\n'), ctx, { filename: 'merges-from-slickchart.html' });
} catch (e) { console.error('check-merge-growth: could not load the merge functions from slickchart.html: ' + e.message); process.exit(2); }
const has = n => typeof vm.runInContext('typeof ' + n, ctx) === 'string' && vm.runInContext('typeof ' + n, ctx) === 'function';
const call = (fn, ...a) => vm.runInContext(fn, ctx)(...a);

// ── Samples ────────────────────────────────────────────────────────────────────────────────────
const J = JSON.stringify;
const keyed = (p, n) => Array.from({ length: n }, (_, i) => ({ id: p + i, name: 'Row ' + p + i, n: i, _ts: 1700000000000 + i }));
const unkeyed = (p, n) => Array.from({ length: n }, (_, i) => ({ name: 'Plain ' + p + i, icon: 'x', trigger: 't' + i, on: true }));
const objs = (p, n) => Array.from({ length: n }, (_, i) => ({ id: 'ip' + p + i, name: 'Serum ' + p + i, imported: true }));
const strs = (p, n) => Array.from({ length: n }, (_, i) => 'id_' + p + i);
const client = (id, extra) => Object.assign({ id, name: 'Client ' + id, _uAt: 1700000000000, submittedForms: [{ formId: 'intake', signed: true, date: '2026-01-02', title: 'Intake', evId: 'ev_' + id }, { formId: 'consent', signed: true, date: '2026-01-03', title: 'Consent' }], summaries: [{ _draftDate: '2026-01-02', ts: 1700000000000, text: 'Visit' }], signedForms: ['Intake'] }, extra || {});
const clients = (p, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['c' + p + i, client('c' + p + i)]));
const msgs = (p) => ({ cA: [{ from: 'them', text: 'hi', evId: 'e' + p + '1', ts: 1 }, { from: 'me', text: 'hello', _mid: 'm' + p + '1', ts: 2 }, { from: 'them', text: 'legacy ' + p, ts: 3 }] });
const threads = (p, n) => Array.from({ length: n }, (_, i) => ({ id: 'c' + p + i, preview: 'p' + i, ts: 1700000000000 + i, unread: i % 2 === 0 }));
const bookings = (p, n) => Array.from({ length: n }, (_, i) => ({ id: 'b' + p + i, status: i % 2 ? 'pending' : 'confirmed', decidedAt: i, treatment: 'Facial' }));
const cmap = (p, kind) => ({ ['c' + p]: kind === 'list' ? [{ ts: 1700000000002, text: 'b' + p }, { ts: 1700000000001, text: 'a' + p }, { text: 'nokey ' + p }] : ['prod_' + p, 'prod_common'] });

// Each case: [label, mergeFnSource taking (serverStr, localStr) → string | {str, changed} | null,
//             a function making a side's value from a tag (common part + part unique to that side)].
const T = (k) => `(function(s,l){return _mergeTombstone(${J(k)},s,l);})`;
const A = (k, opts) => `(function(s,l){return _mergeAuthoredById(s,l,_LIB_TOMB[${J(k)}]||null,${opts || `{keyFn:_libKeyFn(${J(k)}),keepUnkeyed:true}`});})`;
const CM = (k) => `(function(s,l){return _mergeClientMap(s,l,${J(k)});})`;
const both = (f) => (tag) => f('common', tag);
const cases = [];
const libKeys = Object.keys(vm.runInContext('_LIB_TOMB', ctx) || {});
for (const k of libKeys) {
  cases.push([k + ' (rows with ids)', A(k), (t) => J([...keyed('k', 4), ...keyed(t, 2)])]);
  cases.push([k + ' (rows without ids)', A(k), (t) => J([...unkeyed('k', 4), ...unkeyed(t, 2)])]);
}
for (const k of Object.keys(vm.runInContext('_TOMB_ARR', ctx) || {})) {
  cases.push([k + ' (id list)', T(k), (t) => J([...strs('k', 5), ...strs(t, 2)])]);
  cases.push([k + ' (records in an id list)', T(k), (t) => J([...objs('k', 3), ...objs(t, 2)])]);
}
for (const k of Object.keys(vm.runInContext('_TOMB_OBJ', ctx) || {})) cases.push([k + ' (dated record)', T(k), (t) => J(Object.fromEntries([...strs('k', 4), ...strs(t, 2)].map((x, i) => [x, 1700000000000 + i])))]);
const listKeys = vm.runInContext('_CLIENT_MAP_LIST', ctx) || {};
for (const k of Object.keys(vm.runInContext('_CLIENT_MAP_KEYS', ctx) || {})) cases.push([k + ' (per-client map)', CM(k), (t) => J(Object.assign(cmap('k', listKeys[k] ? 'list' : 'ids'), cmap(t, listKeys[k] ? 'list' : 'ids')))]);
cases.push(['sc_clients', '_mergeClients', (t) => J(Object.assign(clients('k', 3), clients(t, 1)))]);
cases.push(['sc_msgstore', '_mergeMsgStore', (t) => { const m = msgs('k'); m.cA = m.cA.concat(msgs(t).cA); return J(m); }]);
cases.push(['sc_threads', '_mergeThreads', (t) => J([...threads('k', 4), ...threads(t, 2)])]);
cases.push(['sc_bookings', '_mergeBookings', (t) => J([...bookings('k', 4), ...bookings(t, 2)])]);
cases.push(['sc_seen_events', '_mergeSeenEvents', (t) => J([...strs('k', 5), ...strs(t, 2)])]);
for (const [k, fn] of [['sc_courses', '_mergeCourses'], ['sc_resources', '_mergeResources'], ['sc_manual_appts', '_mergeAppts']]) {
  if (has(fn)) cases.push([k, fn, (t) => J([...keyed('k', 4), ...keyed(t, 2)])]);
}

// ── Properties ─────────────────────────────────────────────────────────────────────────────────
const strOf = (r, fallback) => (r == null ? fallback : (typeof r === 'string' ? r : (r && typeof r.str === 'string' ? r.str : fallback)));
const changedOf = (r, before, after) => (r && typeof r === 'object' && 'changed' in r) ? !!r.changed : (after !== before);
const sizeOf = (v) => { try { const x = JSON.parse(v); if (Array.isArray(x)) return x.length; if (x && typeof x === 'object') return Object.values(x).reduce((n, y) => n + (Array.isArray(y) ? y.length : 1), 0); } catch (e) {} return 0; };
const repeats = (v) => { try { const x = JSON.parse(v); const lists = Array.isArray(x) ? [x] : (x && typeof x === 'object' ? Object.values(x).filter(Array.isArray) : []); let n = 0; for (const l of lists) { const s = new Set(); for (const r of l) { const k = J(r); if (s.has(k)) n++; else s.add(k); } } return n; } catch (e) { return 0; } };
const same = (a, b) => { try { return vm.runInContext('_sameSyncValue', ctx)(a, b); } catch (e) { return a === b; } };
let fails = 0; const failMsgs = [];
const fail = (m) => { fails++; failMsgs.push(m); };
for (const [label, fnSrc, make] of cases) {
  const fn = vm.runInContext(fnSrc, ctx);
  vm.runInContext('_lsStore={}', ctx);
  // 1. identical copies
  const X = make('x');
  const r1 = fn(X, X), s1 = strOf(r1, X);
  if (sizeOf(s1) > sizeOf(X)) fail(label + ': merging two identical copies grew it (' + sizeOf(X) + ' -> ' + sizeOf(s1) + ' rows)');
  if (!same(s1, X)) { fail(label + ': merging two identical copies changed it'); if (process.env.VERBOSE) console.log(label, X, '=>', s1); }
  if (r1 && typeof r1 === 'object' && r1.changed) fail(label + ': merging two identical copies reports a change (a push on every pull)');
  // 2. two devices and the account, 6 rounds of: device pulls (merge), pushes back if changed
  let acct = make('acct'), dev = { a: make('a'), b: make('b') };
  const start = sizeOf(acct) + sizeOf(dev.a) + sizeOf(dev.b);
  const sizes = [], acctLog = [];
  for (let round = 0; round < 6; round++) {
    for (const d of ['a', 'b']) {
      const before = acct;
      const r = fn(acct, dev[d]);
      const m = strOf(r, acct);
      dev[d] = m;
      if (changedOf(r, before, m)) acct = m;
    }
    sizes.push(sizeOf(acct)); acctLog.push(acct);
  }
  const grewLate = sizes.slice(2).some((n, i) => n > sizes[i + 1]);
  if (grewLate) fail(label + ': keeps growing with no edits (account rows by round: ' + sizes.join(' -> ') + ')');
  if (sizes[sizes.length - 1] > start) fail(label + ': ended bigger than everything both devices and the account started with (' + start + ' -> ' + sizes[sizes.length - 1] + ')');
  if (!same(acctLog[4], acctLog[5])) fail(label + ': the account still changes after 5 rounds with no edits (devices push to each other forever)');
  const rep = repeats(acct) - Math.max(repeats(make('acct')), repeats(make('a')), repeats(make('b')));
  if (rep > 0) fail(label + ': ' + rep + ' exact repeat rows appeared');
}
if (missingRoots.length) console.log('check-merge-growth: note, not found in the page (renamed or removed?): ' + missingRoots.join(', '));
if (fails) {
  console.error('check-merge-growth: ' + fails + ' problem(s). A merge that grows on its own is how sc_autos reached 85 MB (CLAUDE.md §0.9).');
  failMsgs.forEach(m => console.error('  - ' + m));
  process.exit(1);
}
console.log('check-merge-growth: clean (' + cases.length + ' merge cases, ' + lifted.size + ' functions lifted from slickchart.html)');
