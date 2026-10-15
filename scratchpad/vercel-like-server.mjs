// Static server that behaves like Vercel for HTML: brotli/gzip, ETag, Cache-Control max-age=0 must-revalidate, 304s.
import http from 'http'; import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
const ROOT = process.argv[2]; const PORT = +(process.argv[3] || 8898);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const cache = new Map();
http.createServer(async (req, res) => {
  try { const d = +fs.readFileSync('/tmp/claude-0/shell-delay', 'utf8'); if (d && /\.html$|\/slickchart$/.test(req.url.split('?')[0])) await new Promise(z => setTimeout(z, d)); } catch (_) {}
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  let f = path.join(ROOT, u); if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const st = fs.statSync(f); const key = f + st.mtimeMs;
  let e = cache.get(key); if (!e) { const raw = fs.readFileSync(f); e = { raw, br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }), gz: zlib.gzipSync(raw, { level: 6 }), etag: '"' + crypto.createHash('md5').update(raw).digest('hex') + '"' }; cache.set(key, e); }
  const ext = path.extname(f); const h = { 'Content-Type': types[ext] || 'application/octet-stream', 'ETag': e.etag, 'Cache-Control': /\/assets\/app-[a-f0-9]+\./.test(u) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate', 'Vary': 'Accept-Encoding' };
  if (req.headers['if-none-match'] === e.etag) { res.writeHead(304, h); return res.end(); }
  const ae = req.headers['accept-encoding'] || '';
  if (/br/.test(ae)) { h['Content-Encoding'] = 'br'; res.writeHead(200, h); return res.end(e.br); }
  if (/gzip/.test(ae)) { h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); return res.end(e.gz); }
  res.writeHead(200, h); res.end(e.raw);
}).listen(PORT, () => console.log('vercel-like on ' + PORT));
