// consolidateName (api/admin/client-recover.js): Cooper Howard had 141 live rows, none in her list.
// One call must keep the best one and put it in her list, soft-delete ONLY empty copies, leave any
// copy holding something, keep a copy of the list first, and touch only this provider's rows.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const SRC = new URL('../slickchart-vercel/api/admin/client-recover.js', import.meta.url).pathname;
const OUT = join(process.env.TMPDIR || '/tmp', 'sc-consolidate-undertest.mjs');
let src = readFileSync(SRC, 'utf8').replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '');
src = 'const sql=()=>{throw new Error("must take q");};const verifyToken=()=>null,isSessionValid=async()=>true,dbEnabled=()=>true;\n'
  + 'const ensureTable=async()=>{},ensureProvidersTable=async()=>{},ensureFilesTable=async()=>{},ensureClientTables=async()=>{};\n'
  + 'const listHistory=async()=>[],restoreVersion=async()=>({ok:false}),ensureHistoryTable=async()=>{},itemCount=()=>0;\n' + src;
writeFileSync(OUT, src);
const { consolidateName, consolidateAll } = await import(OUT);
const EMPTY = JSON.stringify({ studio: 'B', profile: { skin: '—', concerns: '—', allergies: 'None noted', fitz: '—', treatment: 'New client' } });
const REAL = JSON.stringify({ studio: 'B', profile: { skin: 'Oily', concerns: 'acne', allergies: '', fitz: '—', treatment: 'Facial' }, forms: [{ id: 'f1' }] });
function makeDb() {
  const clients = [];
  for (let i = 0; i < 139; i++) clients.push({ id: 'c17' + String(91588201040 + i * 1000) + 'x', provider_id: 'P', name: 'Cooper Howard', data: EMPTY, deleted_at: null });
  clients.push({ id: 'c1786666343193', provider_id: 'P', name: 'Cooper Howard', data: REAL, deleted_at: null });       // the real one: chart + form
  clients.push({ id: 'c1791000000000', provider_id: 'P', name: 'cooper howard ', data: EMPTY, deleted_at: null, opened_at: 123 }); // opened link: holds something
  clients.push({ id: 'other1', provider_id: 'Q', name: 'Cooper Howard', data: EMPTY, deleted_at: null });             // another provider
  return { clients, kv: { 'P|sc_clients': { someone: { name: 'X' } }, 'P|sc_session_summaries': {} }, history: [], writes: [] };
}
const norm = s => String(s).replace(/\s+/g, ' ').trim();
function makeQ(db) {
  return function q(strings, ...v) {
    const t = norm(strings.join('\u0000'));
    if (/^SELECT id, name, email, phone, data, opened_at, invited_at FROM clients/.test(t))
      return Promise.resolve(db.clients.filter(r => r.provider_id === v[0] && r.deleted_at == null && String(r.name || '').trim().toLowerCase() === String(v[1]).toLowerCase()).map(r => ({ ...r })));
    if (/^SELECT v FROM kv WHERE owner=.* AND k='sc_clients'/.test(t)) { const x = db.kv[v[0] + '|sc_clients']; return Promise.resolve(x ? [{ v: JSON.stringify(x) }] : []); }
    if (/entry\.key AS id, md5/.test(t)) { const x = db.kv[v[0] + '|' + v[1]]; return Promise.resolve(x ? Object.keys(x).filter(id => !['[]','{}','""','null'].includes(JSON.stringify(x[id]))).map(id => ({ id, h: JSON.stringify(x[id]) })) : []); }
    if (/FROM client_events/.test(t)) return Promise.resolve([]);
    if (/^SELECT lower\(trim\(name\)\) AS n, count/.test(t)) {
      const m = {}; db.clients.filter(r => r.provider_id === v[0] && r.deleted_at == null && String(r.name || '').trim()).forEach(r => { const k = String(r.name).trim().toLowerCase(); m[k] = (m[k] || 0) + 1; });
      return Promise.resolve(Object.keys(m).filter(k => m[k] > 1).map(k => ({ n: k, c: m[k] })));
    }
    if (/^INSERT INTO kv_history/.test(t)) { db.history.push(v[0]); return Promise.resolve([]); }
    if (/^INSERT INTO kv \(owner,k,v,updated_at\)/.test(t)) { db.kv[v[0] + '|sc_clients'] = JSON.parse(v[1]); return Promise.resolve([]); }
    if (/^UPDATE clients SET deleted_at=/.test(t)) {
      const [ts, owner, ids] = v; const out = [];
      db.clients.forEach(r => { if (r.provider_id === owner && r.deleted_at == null && ids.includes(r.id)) { r.deleted_at = ts; out.push({ id: r.id }); } });
      return Promise.resolve(out);
    }
    throw new Error('stub has no answer for: ' + t.slice(0, 90));
  };
}
const db = makeDb();
const out = await consolidateName(makeQ(db), 'P', 'Cooper Howard');
check('ok', out.status === 200 && out.body.ok, JSON.stringify(out));
check('keeps the real one (chart + form)', out.body.kept.id === 'c1786666343193', JSON.stringify(out.body.kept));
check('puts it in her list', !!db.kv['P|sc_clients'].c1786666343193 && !!db.kv['P|sc_clients'].someone, Object.keys(db.kv['P|sc_clients']).join(','));
check('retires the 139 empty copies', out.body.retired === 139, out.body.retired);
check('leaves the copy whose link was opened', out.body.leftAlone.length === 1 && db.clients.find(r => r.id === 'c1791000000000').deleted_at == null);
check('the kept one is not deleted', db.clients.find(r => r.id === 'c1786666343193').deleted_at == null);
check('another provider\'s row untouched', db.clients.find(r => r.id === 'other1').deleted_at == null);
check('a copy of her list kept first', db.history.length === 1 && db.history[0] === 'P');
const db2 = makeDb(); db2.clients = db2.clients.filter(r => r.id !== 'c1786666343193' && r.id !== 'c1791000000000');
const out2 = await consolidateName(makeQ(db2), 'P', 'Cooper Howard');
check('all empty: keeps the OLDEST', out2.body.kept.id === 'c1791588201040x', out2.body.kept.id);
const db3 = makeDb(); db3.kv['P|sc_clients'] = 'broken';
db3.kv['P|sc_clients'] = undefined;
const out3 = await consolidateName(makeQ(db3), 'P', 'Cooper Howard');
check('no readable list: nothing changed', out3.status === 400 && db3.clients.every(r => r.deleted_at == null), JSON.stringify(out3.body));
// 2026-10-13 live: 129 copies were left as "holding something". Most were only sent a link.
const db4 = makeDb(); db4.clients.forEach((r, i) => { if (r.provider_id === 'P' && r.data === EMPTY && !r.opened_at && i % 2 === 0) r.invited_at = 1; });
const invited = db4.clients.filter(r => r.invited_at && !r.opened_at).length;
const o4 = await consolidateName(makeQ(db4), 'P', 'Cooper Howard');
check('one tap: link-only copies go too, the opened one stays and says why', o4.body.retired === 139 && o4.body.leftWhy['the client opened this link'] === 1 && db4.clients.find(r => r.id === 'c1791000000000').deleted_at == null, JSON.stringify(o4.body.leftWhy));
// 2026-10-13 live, second run: 127 copies each "held 1 form / 1 chart field" — the same intake and
// the booked date on every one. Copies the kept record already covers are duplicates.
{
  const SAME = JSON.stringify({ forms: [{ formId: 'intake1', title: 'Intake' }], profile: { nextVisit: 'Oct 20', skin: '—', treatment: 'New client' } });
  const DIFF = JSON.stringify({ forms: [{ formId: 'consent9', title: 'Peel consent' }], profile: {} });
  const KEEP = JSON.stringify({ forms: [{ formId: 'intake1', title: 'Intake' }], profile: { concerns: 'acne' } });
  const db5 = { clients: [{ id: 'c1791493687681ygowr', provider_id: 'P', name: 'Cooper Howard', data: KEEP, deleted_at: null }], kv: { 'P|sc_clients': { c1791493687681ygowr: { name: 'Cooper Howard' } } }, history: [] };
  for (let i = 0; i < 120; i++) db5.clients.push({ id: 'c17920000' + String(10000 + i) + 'ab', provider_id: 'P', name: 'Cooper Howard', data: SAME, deleted_at: null, invited_at: i % 2 ? 1 : null });
  db5.clients.push({ id: 'c1792999999999zz', provider_id: 'P', name: 'Cooper Howard', data: DIFF, deleted_at: null });
  for (let i = 0; i < 5; i++) db5.clients.push({ id: 'd' + i, provider_id: 'P', name: 'Debbi Miranda', data: EMPTY, deleted_at: null });   // none in her list
  for (let i = 0; i < 3; i++) db5.clients.push({ id: 'bot' + i, provider_id: 'Q', name: 'Cooper Howard', data: EMPTY, deleted_at: null });
  const all = await consolidateAll(makeQ(db5), 'P');
  check('all: the 120 covered copies (same intake, booked date) retired', all.body.retired === 120, JSON.stringify(all.body));
  check('all: the copy with a different form is kept and says why', all.body.keptBack && Object.keys(all.body.keptBack).some(k => /Peel consent/.test(k)), JSON.stringify(all.body.keptBack));
  check('all: the kept record is untouched', db5.clients.find(r => r.id === 'c1791493687681ygowr').deleted_at == null);
  check('all: a name with no copy in her list is not touched', db5.clients.filter(r => /^d\d/.test(r.id)).every(r => r.deleted_at == null) && all.body.skipped.some(x => /debbi/.test(x.name)), JSON.stringify(all.body.skipped));
  check('all: other provider untouched', db5.clients.filter(r => r.provider_id === 'Q').every(r => r.deleted_at == null));
  check('all: one list backup only', db5.history.length === 1, db5.history.length);
}
// 2026-10-13 live, third run: 59 copies "saved work is filed under it" — empty plans and the starter
// homecare list the app writes for any client that is opened. Neither is her work; a real summary is.
{
  const db6 = { clients: [{ id: 'keepme', provider_id: 'P', name: 'Cooper Howard', data: EMPTY, deleted_at: null }], kv: { 'P|sc_clients': { keepme: { name: 'Cooper Howard' } }, 'P|sc_client_recs': {}, 'P|sc_client_homecare': {}, 'P|sc_session_summaries': {} }, history: [] };
  for (let i = 0; i < 10; i++) { const id = 'cp' + i; db6.clients.push({ id, provider_id: 'P', name: 'Cooper Howard', data: EMPTY, deleted_at: null });
    db6.kv['P|sc_client_recs'][id] = []; db6.kv['P|sc_client_homecare'][id] = ['Gentle cleanser AM/PM', 'SPF 30+ daily']; }
  db6.kv['P|sc_session_summaries'].cp3 = [{ note: 'real visit' }];
  const o6 = await consolidateName(makeQ(db6), 'P', 'Cooper Howard');
  check('empty plans and the starter homecare on many copies are not work', o6.body.retired === 9, JSON.stringify(o6.body));
  check('a copy with a real summary is kept, naming it', o6.body.leftAlone.length === 1 && o6.body.leftAlone[0].id === 'cp3' && /session summaries/.test(o6.body.leftAlone[0].why), JSON.stringify(o6.body.leftAlone));
}
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
