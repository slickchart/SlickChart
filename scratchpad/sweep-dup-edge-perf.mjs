// Scale: 1500 real clients + 1500 copies (3000 records). Time the auto-merge and count the network
// requests it fires. Each merge calls saveClients() (full-roster JSON.stringify + _stampClientChanges over
// every client) and _serverDeleteClients([oneId]) (one POST per merge).
import { boot, reporter } from './sweep-dup-edge-harness.mjs';
const { check, done } = reporter();
const N = Number(process.env.N || 1500);
const { b, p, errs, posts } = await boot({ sq_seed: { name: 'Seed', squareId: 'SEED' } }, {}, 12000);
const before = posts.length;
const r = await p.evaluate((N) => {
  for (let i = 0; i < N; i++) {
    CL['sq_p' + i] = { name: 'Person ' + i, squareId: 'P' + i, phone: '555' + String(i).padStart(7, '0'), notes: 'chart ' + i, skin: 'Dry', concerns: 'Acne', email: 'p' + i + '@x.test' };
    CL['ccopy' + i] = { name: 'Person ' + i, squareId: 'P' + i, source: 'square', treatment: 'New client', skin: '—' };
  }
  saveClients();
  const t0 = performance.now(); const n = _autoMergeSquareDuplicates(); const ms = performance.now() - t0;
  return { n, ms: Math.round(ms), left: Object.keys(CL).length };
}, N);
await p.waitForTimeout(3000);
const delPosts = posts.slice(before).filter(x => /\/api\/clients/.test(x.u) && Array.isArray(x.body.deletedIds)).length;
console.log(JSON.stringify(r), 'deletedIds POSTs:', delPosts);
check(`auto-merge of ${N} copies (${2 * N} records) finishes in under 2s on desktop`, r.ms < 2000, r.ms + 'ms');
check('one server delete request per batch, not per copy', delPosts <= 5, delPosts + ' POST /api/clients');
check('no page errors', !errs.length, errs.join(' | '));
await b.close();
process.exit(done() ? 1 : 0);
