#!/usr/bin/env node
// DEPLOY-TIME ONLY. Moves the provider app's big inline <script> out of slickchart.html into
// assets/app-<hash>.js, so a phone can keep the COMPILED code between launches (browsers code-cache
// external scripts, not inline ones) and the file is cached as immutable. Measured on a 4x-throttled
// phone profile with a 300-client account (2026-10-15): repeat-launch "Home drawn" 1.2-2.7s -> 0.6s.
//
// slickchart.html in the repo is NOT changed: this runs only inside Vercel's build (VERCEL=1), on the
// build container's copy. Every test, sweep and build script keeps reading the single file as before.
// Fail-safe: any error leaves every file untouched and exits 0, so the deploy ships exactly what it
// would have shipped without this step.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const FORCE = process.argv.includes('--force');           // local dry runs write to an out dir instead
const OUT = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6);
if (!process.env.VERCEL && !FORCE) { console.log('[split] not a Vercel build, nothing to do'); process.exit(0); }
try {
  const src = path.join(ROOT, 'slickchart.html');
  const html = fs.readFileSync(src, 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g; let m, last = 0, out = '', moved = 0; const files = [];
  while ((m = re.exec(html))) {
    const body = m[1]; if (body.length < 50000) continue;
    const h = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
    const rel = 'assets/app-' + h + '.js'; files.push([rel, body]);
    out += html.slice(last, m.index) + '<script src="/' + rel + '"></script>'; last = m.index + m[0].length; moved += body.length;
  }
  out += html.slice(last);
  if (!files.length) { console.log('[split] no large inline script found, leaving slickchart.html as is'); process.exit(0); }
  // Sanity: the shell must still carry the app's markup and every non-moved script, and nothing may be lost.
  const lost = html.length - out.length - moved + files.reduce((a, [rel]) => a + ('<script src="/' + rel + '"></script>').length - '<script></script>'.length, 0);
  if (Math.abs(lost) > 0) throw new Error('size check failed by ' + lost + ' bytes');
  const base = OUT || ROOT;
  fs.mkdirSync(path.join(base, 'assets'), { recursive: true });
  for (const [rel, body] of files) fs.writeFileSync(path.join(base, rel), body);
  fs.writeFileSync(path.join(base, 'slickchart.html'), out);
  console.log('[split] moved ' + moved + ' bytes into ' + files.map(f => f[0]).join(', ') + '; shell is ' + out.length + ' bytes');
} catch (e) {
  console.log('[split] skipped, deploy unchanged: ' + (e && e.message));
  process.exit(0);
}
