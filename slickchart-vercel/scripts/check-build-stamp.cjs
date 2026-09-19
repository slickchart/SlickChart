#!/usr/bin/env node
// slickchart.html and lib/app-build.js must carry the same build stamp, or /api/build-id would tell
// every device it is stale for ever and reload them in a loop.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'slickchart.html'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'lib', 'app-build.js'), 'utf8');
const a = (html.match(/const APP_BUILD\s*=\s*'([^']+)'/) || [])[1];
const b = (lib.match(/APP_BUILD\s*=\s*'([^']+)'/) || [])[1];
if (!a || !b) { console.error('build-stamp: could not read a stamp (html=' + a + ', lib=' + b + ')'); process.exit(1); }
if (a !== b) { console.error('build-stamp: MISMATCH — slickchart.html says ' + a + ', lib/app-build.js says ' + b); process.exit(1); }
console.log('build-stamp: ' + a + ' (html and lib agree)');
