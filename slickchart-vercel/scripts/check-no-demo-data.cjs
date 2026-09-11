#!/usr/bin/env node
/* Fails the build if invented people or placeholder data appear in anything a REAL provider loads.
 *
 * Demo data reached production once and a real client saw another practitioner's name presented as
 * their esthetician. The sample dataset now lives ONLY in scripts/demo-seed.js, which is injected
 * into the public demo by build-demo.cjs and nowhere else. This check keeps it that way.
 *
 *   node scripts/check-no-demo-data.cjs
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

// Files that are ALLOWED to contain sample data, because they are the demo itself.
const ALLOW = [/^scripts\/demo-seed\.js$/, /-demo\.html$/, /^scripts\/check-no-demo-data\.cjs$/];

// Files a real provider or client actually loads.
const TARGETS = ['slickchart.html', 'slickchart-client.html', 'index.html', 'get.html', 'mylink.html'];
for (const d of ['api', 'lib']) {
  const walk = p => fs.readdirSync(p, { withFileTypes: true }).forEach(e => {
    const fp = path.join(p, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/\.(js|mjs|cjs|html)$/.test(e.name)) TARGETS.push(path.relative(root, fp));
  });
  walk(path.join(root, d));
}

// Names and values that must never ship in the product.
const DENY = [
  'Maya Rodriguez', 'Sophie Turner', 'Priya Patel', 'Jessica Lee', 'Glowing Skin Studio',
  'John Doe', 'Jane Smith', 'Test Client', 'Lorem ipsum', 'lorem ipsum',
  'test@test.com', 'foo@bar', 'asdf', 'LE123456',
];
// Fake US "555" numbers reserved for fiction, in the formats this codebase uses.
const DENY_RE = [/\(\d{3}\)\s?555-01\d\d/, /\b555-01\d\d\b/];

let bad = 0;
for (const rel of TARGETS) {
  if (ALLOW.some(a => a.test(rel))) continue;
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  const lines = fs.readFileSync(fp, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const needle of DENY) {
      if (line.includes(needle)) { console.error(`${rel}:${i + 1}  contains placeholder "${needle}"`); bad++; }
    }
    for (const re of DENY_RE) {
      const m = line.match(re);
      if (m) { console.error(`${rel}:${i + 1}  contains fake phone "${m[0]}"`); bad++; }
    }
  });
}

if (bad) {
  console.error(`\n${bad} placeholder occurrence(s) in files a real provider loads.`);
  console.error('Sample data belongs in scripts/demo-seed.js, which only the public demo gets.');
  process.exit(1);
}
console.log(`no-demo-data: clean (${TARGETS.length} files checked)`);
