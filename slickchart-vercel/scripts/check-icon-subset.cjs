#!/usr/bin/env node
// The provider app carries its OWN copy of the Tabler icon font, holding only the icons it uses
// (2026-11-07: the whole 865 KB set came from jsDelivr on every cold open). The price of a subset is
// that a NEW icon shows as a blank square until the subset is rebuilt. This fails the build first.
// Fix: python3 scratchpad/fonts/build-icon-subset.py <tabler-icons.min.css> <tabler-icons.woff2> (3.19.0)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'slickchart.html'), 'utf8');
const all = new Set(fs.readFileSync(path.join(root, '..', 'scratchpad', 'fonts', 'tabler-3.19.0-names.txt'), 'utf8').split('\n').filter(Boolean));
const A = '/* ICON-SUBSET:START', B = '/* ICON-SUBSET:END */';
const a = src.indexOf(A), b = src.indexOf(B);
if (a < 0 || b < 0) { console.error('icon-subset: the ICON-SUBSET block is missing from slickchart.html'); process.exit(1); }
const block = src.slice(a, b);
const have = new Set([...block.matchAll(/\.ti-([a-z0-9-]+):before/g)].map(m => m[1]));
const font = (block.match(/\/assets\/fonts\/(tabler-[a-f0-9]+\.woff2)/) || [])[1];
if (!font || !fs.existsSync(path.join(root, 'assets', 'fonts', font))) { console.error('icon-subset: the font file named in the block is not in assets/fonts: ' + font); process.exit(1); }
const pre = (src.match(/<link rel="preload" href="\/assets\/fonts\/(tabler-[a-f0-9]+\.woff2)"/) || [])[1];
if (pre !== font) { console.error('icon-subset: the <link rel=preload> names ' + pre + ' but the font is ' + font); process.exit(1); }
let scan = src.slice(0, a) + src.slice(b + B.length);
for (const f of ['demo-seed-client.js', 'scripts/demo-seed.js']) { try { scan += fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) {} }
const used = new Set();
for (const m of scan.matchAll(/ti-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) if (all.has(m[1])) used.add(m[1]);
for (const m of scan.matchAll(/['"`]([a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g)) if (all.has(m[1])) used.add(m[1]);
const missing = [...used].filter(n => !have.has(n)).sort();
if (missing.length) { console.error('icon-subset: ' + missing.length + ' icon(s) used but not in the subset, so they would draw blank: ' + missing.join(', ') + '\nRebuild: python3 scratchpad/fonts/build-icon-subset.py <tabler-icons.min.css> <tabler-icons.woff2> (Tabler Icons 3.19.0)'); process.exit(1); }
console.log('icon-subset: all ' + used.size + ' icons the app uses are in ' + font);
