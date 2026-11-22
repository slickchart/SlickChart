// lib/kv-dedupe.js against a real PostgreSQL 16 (2026-11-18): the account copies of sc_autos and
// sc_imported_products held the same rows hundreds of times. The clean-up must remove ONLY exact
// repeats, only in top-level lists, keep the earlier copy in kv_history, and never touch a value
// that changed while it ran or another account's data.
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const src = fs.readFileSync(new URL('./sweep-dup-server-pg.mjs', import.meta.url), 'utf8');
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvdd-')), sock = fs.mkdtempSync(path.join(os.tmpdir(), 'kvddsock-'));
const PORT = '55497', asRoot = process.getuid() === 0, USER = asRoot ? 'pgtest' : os.userInfo().username;
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' });
const pg = c => sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c);
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;
const stub = src.slice(src.indexOf('const DBSTUB = `') + 16, src.indexOf('`;\nconst AUTHSTUB')).replace(/\$\{PGBIN\}/g, PGBIN).replace(/\$\{sock\}/g, sock).replace(/\$\{PORT\}/g, PORT).replace(/\$\{USER\}/g, USER).replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
const lib = path.join(root, 'lib'); fs.mkdirSync(lib);
fs.writeFileSync(path.join(lib, 'db.js'), stub);
for (const f of ['kv-dedupe.js', 'kv-history.js', 'exact-repeats.js']) fs.copyFileSync(new URL('../slickchart-vercel/lib/' + f, import.meta.url), path.join(lib, f));
const D = await import(path.join(lib, 'db.js')), K = await import(path.join(lib, 'kv-dedupe.js'));
const q = D.sql(); await D.ensureTable();
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  — ' + JSON.stringify(d) : '')); ok ? pass++ : fail++; };
const A1 = { name: 'Birthday', on: true }, A2 = { name: 'Rebook', on: true }, A3 = { name: 'Birthday', on: false };
const rep = (a, n) => [].concat(...Array(n).fill(a));
const put = (o, k, v) => q`INSERT INTO kv (owner,k,v) VALUES (${o},${k},${JSON.stringify(v)}) ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v`;
await put('A', 'sc_autos', [...rep([A1, A2], 50), A3]);                 // repeats + a near-twin that must stay
await put('B', 'sc_imported_products', rep([{ id: 'p1', name: 'Serum' }], 40));
await put('B', 'sc_clients_like_map', { c1: rep([{ t: 'hi' }], 30) });  // a MAP: never touched
await put('C', 'sc_vendors', [{ name: 'Glow' }, { name: 'Gauze' }]);    // no repeats: untouched
await put('C', 'sc_seen_events', rep(['e1', 'e2'], 30));                // strings repeat too

const dry = await K.dedupeAccounts(q, { minBytes: 1 });
check('dry run finds the three repeated lists, not the map or the clean list', dry.found.map(f => f.owner + ':' + f.k).sort().join(',') === 'A:sc_autos,B:sc_imported_products,C:sc_seen_events', dry.found.map(f => f.owner + ':' + f.k));
const before = await D.getKVValue('A', 'sc_autos');
check('dry run changes nothing', JSON.parse(before).length === 101, JSON.parse(before).length);

const r = await K.dedupeAccounts(q, { minBytes: 1, apply: true });
const autos = JSON.parse(await D.getKVValue('A', 'sc_autos'));
check('automations: 101 rows become 3 (the near-twin stays)', autos.length === 3, autos);
check('imported products: 40 become 1', JSON.parse(await D.getKVValue('B', 'sc_imported_products')).length === 1);
check('seen events: 60 become 2', JSON.parse(await D.getKVValue('C', 'sc_seen_events')).length === 2);
check('the map is untouched', JSON.parse(await D.getKVValue('B', 'sc_clients_like_map')).c1.length === 30);
check('the clean list is untouched', JSON.parse(await D.getKVValue('C', 'sc_vendors')).length === 2);
const h = await q`SELECT owner, k, items, reason FROM kv_history ORDER BY owner, k`;
check('each earlier copy is kept in kv_history', h.length === 3 && h.every(x => x.reason === 'dedupe') && h.find(x => x.k === 'sc_autos').items === 101, h);
check('every write moved updated_at', (await q`SELECT count(*)::int AS n FROM kv WHERE updated_at > now() - interval '1 minute'`)[0].n >= 3);
const again = await K.dedupeAccounts(q, { minBytes: 1, apply: true });
check('a second run finds nothing', again.found.length === 0, again.found);
// a value that changes between the read and the write is left alone
await put('A', 'sc_autos', rep([A1], 5));
const realQ = q; let hit = false;
const racy = (s, ...v) => { const t = s.join('?'); if (!hit && /^UPDATE kv/.test(t.trim())) { hit = true; return put('A', 'sc_autos', rep([A2], 7)).then(() => realQ(s, ...v)); } return realQ(s, ...v); };
const r3 = await K.dedupeAccounts(racy, { minBytes: 1, apply: true });
check('a value edited mid-run is not overwritten', JSON.parse(await D.getKVValue('A', 'sc_autos')).length === 7 && r3.found[0] && r3.found[0].applied === false, r3.found);
console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
