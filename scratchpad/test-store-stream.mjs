// api/store.js sendJson (2026-11-18): an account read over 3.5 MB goes out streamed (Vercel's 4.5 MB
// limit does not apply to streamed responses) and arrives byte-identical; a small one is unchanged.
import http from 'http'; import fs from 'fs';
const src = fs.readFileSync(new URL('../slickchart-vercel/api/store.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('export const STREAM_OVER'), src.indexOf('\n}\n', src.indexOf('export function sendJson')) + 3).replace(/export /g, '');
const { sendJson, STREAM_OVER } = new Function(fn + '; return { sendJson, STREAM_OVER };')();
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' — ' + d)); ok ? pass++ : fail++; };
const big = { data: { sc_clients: JSON.stringify({ c1: { notes: 'é😀"\n'.repeat(900000) } }) }, count: 1 };
const small = { data: { a: '1' }, count: 1 };
const srv = http.createServer((req, res) => {
  let json = null; res.status = c => { res.statusCode = c; return { json: o => { json = 1; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); } }; };
  res.on('finish', () => { res._viaJson = json; });
  sendJson(res, req.url === '/big' ? big : small);
  srv._last = () => json;
}).listen(0);
const port = srv.address().port;
const get = async p => { const r = await fetch('http://127.0.0.1:' + port + p); return { te: r.headers.get('transfer-encoding'), type: r.headers.get('content-type'), body: await r.text() }; };
const b = await get('/big');
check('big body is over the limit', Buffer.byteLength(JSON.stringify(big)) > 4.5e6, Buffer.byteLength(JSON.stringify(big)));
check('a value with an emoji every few bytes', JSON.stringify(big).includes('😀'));
check('big read is streamed (chunked)', b.te === 'chunked', b.te);
check('big read arrives identical', b.body === JSON.stringify(big));
check('big read is JSON', /application\/json/.test(b.type), b.type);
const s = await get('/small');
check('small read goes through res.json as before', s.body === JSON.stringify(small) && srv._last() === 1);
check('threshold leaves margin under 4.5 MB', STREAM_OVER < 4.5e6);
srv.close(); console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
