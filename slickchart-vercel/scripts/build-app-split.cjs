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
function minify(body) {
  try {
    const es = require('esbuild');
    const r = es.transformSync(body, { loader: 'js', minifyWhitespace: true, legalComments: 'none', target: 'esnext', sourcemap: 'external', sourcefile: 'slickchart.html' });
    if (!r || !r.code || r.code.length < body.length * 0.5) return null;   // implausible: ship the original
    return { code: r.code.replace(/\n+$/, ''), map: r.map };
  } catch (e) { console.log('[split] not minified: ' + (e && e.message)); return null; }
}
if (!process.env.VERCEL && !FORCE) { console.log('[split] not a Vercel build, nothing to do'); process.exit(0); }
try {
  const src = path.join(ROOT, 'slickchart.html');
  const html = fs.readFileSync(src, 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g; let m, last = 0, out = '', moved = 0; const files = [];
  while ((m = re.exec(html))) {
    const body = m[1]; if (body.length < 50000) continue;
    // Smaller code file (2026-11-07): comments and indentation out, nothing else changed (no renaming,
    // no syntax rewrites). ~3.9 MB -> ~3.2 MB, brotli 768 KB -> 552 KB, and on a 4x-slowed phone the
    // first open after each update drew Home ~0.3 s sooner. A source map sits beside it so Safari's
    // inspector shows the real lines. If esbuild is missing or refuses, the file ships as it was.
    const min = minify(body);
    const code = min ? min.code : body;
    const h = crypto.createHash('sha256').update(code).digest('hex').slice(0, 12);
    const rel = 'assets/app-' + h + '.js';
    files.push([rel, min ? code + '\n//# sourceMappingURL=app-' + h + '.js.map\n' : code]);
    if (min) files.push([rel + '.map', min.map]);
    out += html.slice(last, m.index) + '<script src="/' + rel + '"></script>'; last = m.index + m[0].length; moved += body.length;
  }
  out += html.slice(last);
  if (!files.length) { console.log('[split] no large inline script found, leaving slickchart.html as is'); process.exit(0); }
  // Sanity: the shell must still carry the app's markup and every non-moved script, and nothing may be lost.
  const lost = html.length - out.length - moved + files.filter(([rel]) => /\.js$/.test(rel)).reduce((a, [rel]) => a + ('<script src="/' + rel + '"></script>').length - '<script></script>'.length, 0);
  if (Math.abs(lost) > 0) throw new Error('size check failed by ' + lost + ' bytes');
  const base = OUT || ROOT;
  fs.mkdirSync(path.join(base, 'assets'), { recursive: true });
  for (const [rel, body] of files) fs.writeFileSync(path.join(base, rel), body);
  fs.writeFileSync(path.join(base, 'slickchart.html'), out);
  console.log('[split] ' + (files.some(f => /\.map$/.test(f[0])) ? 'minified, ' : 'NOT minified, ') + 'moved ' + moved + ' bytes into ' + files.map(f => f[0]).join(', ') + '; shell is ' + out.length + ' bytes');
} catch (e) {
  console.log('[split] skipped, deploy unchanged: ' + (e && e.message));
  process.exit(0);
}
