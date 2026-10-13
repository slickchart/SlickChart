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
const { consolidateName } = await import(OUT);
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
    if (/entry\.key AS id FROM kv, jsonb_each/.test(t)) { const x = db.kv[v[0] + '|' + v[1]]; return Promise.resolve(x ? Object.keys(x).map(id => ({ id })) : []); }
    if (/FROM client_events/.test(t)) return Promise.resolve([]);
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
check('reply says WHY copies were left', o4.body.leftWhy['a link was sent, never opened'] === invited && o4.body.leftWhy['the client opened this link'] === 1, JSON.stringify(o4.body.leftWhy));
const o5 = await consolidateName(makeQ(db4), 'P', 'Cooper Howard', true);
check('second pass removes link-only copies, never the opened one', o5.body.retired === invited && db4.clients.find(r => r.id === 'c1791000000000').deleted_at == null, JSON.stringify(o5.body.leftWhy));
let bad = 0; for (const x of results) { if (!x.pass) bad++; console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.detail !== '' ? '  — ' + x.detail : '')); }
console.log(`\n${results.length - bad}/${results.length} passed`); process.exit(bad ? 1 : 0);
