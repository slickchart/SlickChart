#!/usr/bin/env node
// Every write to the kv table must move updated_at (2026-11-13).
//
// The app now reads only what CHANGED in the account since its last read (api/store.js ?since=),
// and "changed" means updated_at moved. A writer that updates `v` without it would leave the change
// invisible to that read. The app double-checks each reused value against the account's md5 of it and
// reads everything when one does not match, so this would cost speed, not data; still, two writers
// were found doing it (the Square webhook and the founder exposure tool). This keeps a third out.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const bad = [];
function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p);
  if (st.isDirectory()) { if (f !== 'node_modules') walk(p); } else if (/\.(js|cjs|mjs)$/.test(f)) scan(p); } }
function scan(p) {
  const src = fs.readFileSync(p, 'utf8');
  // Each tagged-template SQL statement that writes kv.
  const re = /q`([^`]*)`/g; let m;
  while ((m = re.exec(src))) {
    const s = m[1].replace(/\s+/g, ' ');
    const line = src.slice(0, m.index).split('\n').length;
    if (/\bUPDATE kv\b/i.test(s) && !/updated_at/i.test(s)) bad.push(path.relative(root, p) + ':' + line + ' UPDATE kv without updated_at');
    if (/\bINSERT INTO kv\b/i.test(s) && /DO UPDATE SET/i.test(s) && !/DO UPDATE SET[^]*updated_at/i.test(s)) bad.push(path.relative(root, p) + ':' + line + ' INSERT INTO kv ... DO UPDATE without updated_at');
  }
}
walk(path.join(root, 'api')); walk(path.join(root, 'lib'));
if (bad.length) { console.error('kv-stamps: ' + bad.length + ' kv write(s) do not move updated_at:\n  ' + bad.join('\n  ') + '\nAdd `updated_at = now()` to the SET.'); process.exit(1); }
console.log('kv-stamps: every kv write moves updated_at');
