#!/usr/bin/env node
// Every saved row needs an id NOTHING else has (CLAUDE.md §0.9, 2026-11-28).
//
// Two faults of one kind, found a day apart:
//  - Form questions were 'q'+(nextQIdLocal++) with the counter back at 20 on every launch, so a
//    question added on a later day took an earlier question's id and the client's two answers were
//    saved as one (Maddie, 2026-11-26: "My form answers are all messed up and not matching with the
//    correct questions").
//  - Custom products were 'cust'+(++custProdSeq) with the counter back at 0, so every launch's first
//    product was "cust1": the plan showed the older product and the next load kept only one.
// Ashley, 2026-11-27: "make sure to permanently fix this and anything like it".
//
// 1. No id may come from a per-launch counter or a list length on its own: those restart, and two
//    devices count the same way. Use time + random, or pick one the existing rows do not use. A line
//    that does it safely is listed in ALLOW with the reason, and is re-checked to still be there.
// 2. The repair helpers run from the SHIPPED files (extracted, never copied): they split a shared id,
//    leave a clean list as the very same array, and a second pass changes nothing (merge(X,X)=X).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['slickchart.html', 'slickchart-client.html'];
const ALLOW = [
  { file: 'slickchart.html', has: "do{id='q'+(nextQIdLocal++);}while(used.has(id));", why: '_newQId: the counter only proposes; the loop skips every id already used on screen or in any saved form' },
  { file: 'slickchart-client.html', has: "_id:'cm'+Date.now().toString(36)+'_'+(++_clientMsgSeq)", why: 'time first; the counter only separates two messages sent in the same millisecond' },
  { file: 'slickchart-client.html', has: "_lock:(msg._id||('m'+(++_clientMsgSeq)))", why: 'an in-flight lock for one send, never saved as a row id' },
  { file: 'slickchart.html', has: "c.moduleNames.forEach(nm=>out.push({id:'l'+(out.length+1)", why: 'one-time read of a legacy course: derived from position in a list that no longer changes' },
  { file: 'slickchart.html', has: "if(r.type==='link')out.push({id:'l'+(out.length+1)", why: 'same legacy course read as above' },
];
const RX = [
  { re: /['"`][\w-]{0,16}['"`]\s*\+\s*\(\s*(\+\+\s*[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*\s*\+\+)\s*\)/g, what: 'an id from a counter that restarts on every launch' },
  { re: /['"`][\w-]{0,16}['"`]\s*\+\s*\(\s*[A-Za-z_$][\w$.]*\.length\s*\+\s*1\s*\)/g, what: 'an id from a list length (a delete makes the next one reuse an id)' },
];
let bad = 0;
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    for (const { re, what } of RX) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(ln))) {
        const ctx = ln.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
        if (ALLOW.some(a => a.file === f && ln.includes(a.has))) continue;
        console.error(`FAIL ${f}:${i + 1}: ${what}\n     ${ctx.trim()}\n     Use time + random (checked against the list), or add it to ALLOW in this file with the reason it cannot collide.`);
        bad++;
      }
    }
  });
}
for (const a of ALLOW) {
  const src = fs.readFileSync(path.join(ROOT, a.file), 'utf8');
  if (!src.includes(a.has)) { console.error(`FAIL ALLOW entry no longer matches ${a.file}: ${a.has}\n     Re-read that code and update or remove the entry.`); bad++; }
}
// 2. The repair helpers, from the shipped files.
function grab(src, sig, file) {
  const i = src.indexOf(sig);
  if (i < 0) { console.error(`FAIL ${file}: not found: ${sig}`); bad++; return ''; }
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  return '';
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const t = (cond, msg) => { if (!cond) { console.error('FAIL ' + msg); bad++; } };
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(grab(src, 'function _uniqQIds(qs){', f) + '\n' + grab(src, 'function _qsSharedOnce(qs){', f), ctx);
  const qs = [{ id: 'q20', label: 'A' }, { id: 'q21', label: 'B' }, { id: 'q20', label: 'C' }, { id: 'q20_2', label: 'D' }];
  const c1 = JSON.parse(JSON.stringify(qs)); ctx._uniqQIds(c1);
  t(new Set(c1.map(q => q.id)).size === c1.length && c1[0].id === 'q20' && c1[1].id === 'q21' && c1[3].id === 'q20_2', f + ': _uniqQIds gives every question its own id, keeps the first and any existing one: ' + c1.map(q => q.id));
  const c2 = JSON.parse(JSON.stringify(c1)); t(ctx._uniqQIds(c2) === false && eq(c1, c2), f + ': _uniqQIds a second time changes nothing');
  const clean = [{ id: 'a' }, { id: 'b' }]; t(ctx._qsSharedOnce(clean) === clean, f + ': _qsSharedOnce leaves a clean list as the same array');
  const sh = ctx._qsSharedOnce(qs); t(sh.length === 3 && /A \/ C/.test(sh[0].label) && qs[2].label === 'C', f + ': _qsSharedOnce shows a shared answer once and never changes the saved list');
}
{
  const f = 'slickchart.html', src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(grab(src, 'function _healCustProdIds(list){', f), ctx);
  const L = [{ id: 'cust1', name: 'Serum' }, { id: 'cust1', name: 'Cream' }, { id: 'cust1', name: 'Serum' }, { id: 'cust1_2', name: 'Toner' }, { id: 'sq_9', name: 'Mask' }];
  const h = ctx._healCustProdIds(L);
  t(h !== L && h[0].id === 'cust1' && h[1].id === 'cust1_3' && h[2].id === 'cust1' && h[3].id === 'cust1_2' && L[1].id === 'cust1', 'slickchart.html: _healCustProdIds splits two different products on one id, leaves a repeat, never takes an id in use, and copies rather than edits: ' + h.map(x => x.id));
  t(eq(ctx._healCustProdIds(h), h) && ctx._healCustProdIds(h) === h, 'slickchart.html: _healCustProdIds a second time changes nothing');
  const C = [{ id: 'cust1', name: 'Serum' }, { id: 'a2', name: 'X' }]; t(ctx._healCustProdIds(C) === C, 'slickchart.html: _healCustProdIds leaves a clean list as the same array');
  t(!/'cust'\+\(\+\+custProdSeq\)/.test(src) && /const aid=_newCustProdId\(\);/.test(src), 'slickchart.html: a new custom product gets _newCustProdId()');
}
if (bad) { console.error(bad + ' problem(s).'); process.exit(1); }
console.log('check-unique-ids: no id comes from a restarting counter or a list length; the repair helpers split shared ids and settle after one pass.');
