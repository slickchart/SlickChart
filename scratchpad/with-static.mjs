// Runs a scratchpad test that expects the app on http://localhost:8899 (sweep-dup-xdevice-lib.mjs),
// serving slickchart-vercel/ from inside this process so no separate server is needed.
//   node scratchpad/with-static.mjs scratchpad/test-merge-no-doubling.mjs
import http from 'http'; import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const ROOT = path.resolve(process.env.SC_APP_DIR || path.join(process.cwd(), 'slickchart-vercel')) + '/';   // run from the repo root
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
  try { const d = fs.readFileSync(f); r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }
  catch (e) { r.writeHead(404); r.end(); }
});
await new Promise(res => srv.listen(Number(process.env.PORT || 8899), res));
process.on('exit', () => { try { srv.close(); } catch (e) {} });
await import(pathToFileURL(path.resolve(process.argv[2])).href);
setTimeout(() => process.exit(process.exitCode || 0), 500).unref();
