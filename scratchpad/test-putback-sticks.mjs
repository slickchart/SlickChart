// Debbi Miranda, 2026-10-13: "it wont put her back on my list". Put back on the server, then the
// device's _purgeRemovedClients stripped her again because her id was on the delete record. Checks
// (1) the device keeps an un-deleted client through the purge, (2) a deleted one still goes, and
// (3) the server's put-back takes the ids off the delete record and stamps them un-deleted.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
// --- server
const SRC = new URL('../slickchart-vercel/api/admin/client-recover.js', import.meta.url).pathname;
const OUT = join(process.env.TMPDIR || '/tmp', 'sc-undelete-undertest.mjs');
let src = readFileSync(SRC, 'utf8').replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '');
src = 'const sql=()=>{};const verifyToken=()=>null,isSessionValid=async()=>true,dbEnabled=()=>true;const ensureTable=async()=>{},ensureProvidersTable=async()=>{},ensureFilesTable=async()=>{},ensureClientTables=async()=>{};const listHistory=async()=>[],restoreVersion=async()=>({ok:false}),ensureHistoryTable=async()=>{},itemCount=()=>0;\n' + src;
writeFileSync(OUT, src);
const { undeleteIds } = await import(OUT);
const kv = { 'P|sc_deleted_clients': JSON.stringify({ debbi1: 1, other: 1 }), 'Q|sc_deleted_clients': JSON.stringify({ debbi1: 1 }) };
const q = (strings, ...v) => { const t = strings.join('?').replace(/\s+/g, ' ');
  if (/^SELECT v FROM kv WHERE owner=\? AND k='sc_deleted_clients'/.test(t)) return Promise.resolve(kv[v[0] + '|sc_deleted_clients'] ? [{ v: kv[v[0] + '|sc_deleted_clients'] }] : []);
  if (/^SELECT v FROM kv WHERE owner=\? AND k='sc_undeleted_clients'/.test(t)) return Promise.resolve(kv[v[0] + '|sc_undeleted_clients'] ? [{ v: kv[v[0] + '|sc_undeleted_clients'] }] : []);
  if (/^INSERT INTO kv \(owner,k,v,updated_at\) VALUES \(\?,'sc_deleted_clients'/.test(t)) { kv[v[0] + '|sc_deleted_clients'] = v[1]; return Promise.resolve([]); }
  if (/^INSERT INTO kv \(owner,k,v,updated_at\) VALUES \(\?,'sc_undeleted_clients'/.test(t)) { kv[v[0] + '|sc_undeleted_clients'] = v[1]; return Promise.resolve([]); }
  throw new Error('no stub for ' + t.slice(0, 80)); };
const n = await undeleteIds(q, 'P', ['debbi1']);
check('server: put-back takes her off the delete record', n === 1 && !JSON.parse(kv['P|sc_deleted_clients']).debbi1 && JSON.parse(kv['P|sc_deleted_clients']).other, kv['P|sc_deleted_clients']);
check('server: and stamps her un-deleted', !!JSON.parse(kv['P|sc_undeleted_clients']).debbi1);
check('server: another provider untouched', JSON.parse(kv['Q|sc_deleted_clients']).debbi1 === 1);
// --- device
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.addInitScript(() => { try { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
await page.goto('http://localhost:8899/slickchart.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  CL.debbi1 = { name: 'Debbi Miranda' }; CL.gone1 = { name: 'Gone Person' };
  _deletedClientIds.debbi1 = 1; _deletedClientIds.gone1 = 1;
  localStorage.setItem('sc_undeleted_clients', JSON.stringify({ debbi1: Date.now() }));
  _purgeRemovedClients();
  return { debbi: !!CL.debbi1, gone: !!CL.gone1 };
});
check('device: a client put back survives the purge', r.debbi, JSON.stringify(r));
check('device: a client still deleted is removed', !r.gone, JSON.stringify(r));
await browser.close();
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
