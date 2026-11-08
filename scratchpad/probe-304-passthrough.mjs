// Does this engine hand a 304 to the page's fetch() when the page sets If-None-Match itself, with
// cache:'no-store'? The 15-second form check (syncClientEvents) relies on it. Real server, no routing.
import http from 'http'; import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ENGINE = process.env.ENGINE || 'chromium';
const srv = http.createServer((q, s) => { if (q.url === '/') { s.writeHead(200, { 'Content-Type': 'text/html' }); return s.end('<p>x</p>'); }
  const tag = '"abc"'; if (q.headers['if-none-match'] === tag) { s.writeHead(304, { ETag: tag, 'Cache-Control': 'private, no-store' }); return s.end(); }
  s.writeHead(200, { ETag: tag, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }); s.end('{"big":1}'); }).listen(8911);
const b = ENGINE === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage(); await p.goto('http://localhost:8911/');
const out = await p.evaluate(async () => { const a = await fetch('/e', { cache: 'no-store' }); const et = a.headers.get('ETag'); await a.text();
  const c = await fetch('/e', { cache: 'no-store', headers: { 'If-None-Match': et } }); return { first: a.status, etag: et, second: c.status, ok: c.ok, body: await c.text() }; });
console.log(ENGINE, JSON.stringify(out)); await b.close(); srv.close();
