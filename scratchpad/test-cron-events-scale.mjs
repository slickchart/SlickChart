// api/cron-events.js (2026-11-18 capacity review): reads ONE account's client list at a time, and
// only for an account with an event automation that can send this hour, never every account's list
// in one query. Birthdays still go out, to her own clients only.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V = new URL('../slickchart-vercel/', import.meta.url).pathname;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cev-')); fs.mkdirSync(root + '/lib'); fs.mkdirSync(root + '/api');
fs.writeFileSync(root + '/package.json', '{"type":"module"}');
fs.copyFileSync(V + 'api/cron-events.js', root + '/api/cron-events.js');
fs.writeFileSync(root + '/lib/db.js', `export const QUERIES=[]; export const KV={}; export const CLIENTS={};
export const dbEnabled=()=>true; export const ensureTable=async()=>{}; export async function getKVValue(o,k){ const x=KV[o+'|'+k]; return x==null?null:x; }
export async function readKeyAllOwners(q,key){ return REAL.readKeyAllOwners(q,key); } export const REAL={};
export function sql(){ return async (s,...v)=>{ const t=s.join('?'); QUERIES.push({t,v});
  if(/FROM kv WHERE k = \\? AND coalesce/.test(t)) return Object.entries(KV).filter(([k,val])=>k.endsWith('|'+v[0])&&val.length<=1000000).map(([k,val])=>({owner:k.split('|')[0],v:val}));
  if(/FROM kv WHERE k = \\? AND octet_length/.test(t)) return Object.entries(KV).filter(([k,val])=>k.endsWith('|'+v[0])&&val.length>1000000).map(([k])=>({owner:k.split('|')[0]}));
  if(/FROM kv WHERE owner = \\? AND k = \\?$/.test(t.trim())) { const x=KV[v[0]+'|'+v[1]]; return x==null?[]:[{owner:v[0],v:x}]; }
  if(/FROM kv WHERE k = 'sc_autos'/.test(t)) return Object.entries(KV).filter(([k])=>k.endsWith('|sc_autos')).map(([k,val])=>({owner:k.split('|')[0],v:val}));
  if(/FROM kv WHERE k = 'sc_clients'/.test(t)) return Object.entries(KV).filter(([k])=>k.endsWith('|sc_clients')).map(([k,val])=>({owner:k.split('|')[0],v:val}));
  if(/FROM kv WHERE owner = \\? AND k = 'sc_clients'/.test(t)) { const x=KV[v[0]+'|sc_clients']; return x==null?[]:[{v:x}]; }
  if(/FROM clients WHERE provider_id/.test(t)) return (CLIENTS[v[0]]||[]).map(id=>({id,token:'tok-'+id}));
  return []; }; }`);
fs.writeFileSync(root + '/lib/clients.js', `export const LOGGED=[]; const seen=new Set();
export const ensureClientTables=async()=>{}; export const claimReminder=async(c,k)=>{ if(seen.has(k)) return false; seen.add(k); return true; };
export const logEvent=async(o,c,k,p)=>{ LOGGED.push({o,c,text:p.text}); }; export const listPushSubs=async()=>[]; export const deletePushSub=async()=>{};
export const spaceUrl=t=>'/space/'+t; export const wantsPush=async()=>false;`);
fs.writeFileSync(root + '/lib/push.js', 'export const pushConfigured=()=>false; export const sendPushToAll=async()=>0;');
fs.writeFileSync(root + '/lib/fcm.js', 'export const nativePushConfigured=()=>false; export const sendNativeToClient=async()=>0;');
fs.writeFileSync(root + '/lib/cron-runs.js', 'export const withCronRun=(n,h)=>h;');
process.env.CRON_SECRET = 's';
const D = await import(root + '/lib/db.js');
{ const real = fs.readFileSync(V + 'lib/db.js', 'utf8'); const f = real.slice(real.indexOf('export async function readKeyAllOwners')); D.REAL.readKeyAllOwners = new Function('return ' + f.replace('export ', ''))(); }
const C = await import(root + '/lib/clients.js');
const run = (await import(root + '/api/cron-events.js')).default;
const now = new Date(); const md = String(now.getUTCMonth() + 1).padStart(2, '0') + '-' + String(now.getUTCDate()).padStart(2, '0');
const morning = now.getUTCHours() >= 8 && now.getUTCHours() <= 11;
// pick a zone where it is morning now, so the test runs at any hour
const tz = (() => { for (let o = -12; o <= 14; o++) { const z = 'Etc/GMT' + (o <= 0 ? '+' + (-o) : '-' + o); const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: z, hour: 'numeric', hourCycle: 'h23' }).format(now)); if (h >= 8 && h <= 11) return z; } return 'UTC'; })();
const localMD = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: '2-digit', day: '2-digit' }).format(now);
const bday = '1990-' + localMD;
const bdayAuto = { id: 'a1', name: 'Birthday', trigger: 'Birthday', msg: 'Happy birthday {client_name}! From {business_name}', tz };
D.KV['pA|sc_autos'] = JSON.stringify([bdayAuto]);
D.KV['pA|sc_clients'] = JSON.stringify({ c1: { name: 'Rae Smith', birthday: bday }, cX: { name: 'Not hers', birthday: bday } });
D.CLIENTS.pA = ['c1'];
D.KV['pA|sc_bizinfo'] = JSON.stringify({ name: 'Glow Studio' });   // {business_name} is her own business name (2026-11-19)
D.KV['pB|sc_autos'] = JSON.stringify([{ id: 'b1', name: 'Promo', msg: 'hi', sendAt: '2026-12-01' }]);   // date-scheduled: not this job
D.KV['pB|sc_clients'] = JSON.stringify({ d1: { name: 'Dee', birthday: bday } }); D.CLIENTS.pB = ['d1'];
// an oversized automation list (a runaway once reached 85 MB) is read on its own and still runs
D.KV['pD|sc_autos'] = JSON.stringify([{ ...bdayAuto, id: 'd1', pad: 'x'.repeat(1200000) }]);
D.KV['pD|sc_clients'] = JSON.stringify({ f1: { name: 'Fay Lee', birthday: bday } }); D.CLIENTS.pD = ['f1'];
D.KV['pC|sc_clients'] = JSON.stringify({ e1: { name: 'Eve', birthday: bday } });                    // no automations at all
const res = { status(c) { this.c = c; return this; }, json(b) { this.b = b; return this; } };
await run({ method: 'GET', headers: { authorization: 'Bearer s' }, query: {} }, res);
let pass = 0, fail = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' — ' + JSON.stringify(d))); ok ? pass++ : fail++; };
const reads = D.QUERIES.filter(x => /sc_clients/.test(x.t));
check('ran OK', res.c === 200 && res.b.ok, res);
check('never reads every account\'s client list at once', !reads.some(x => /FROM kv WHERE k = 'sc_clients'/.test(x.t)), reads.map(x => x.t));
check('reads only the accounts with a sendable event automation', reads.filter(x => /owner = \?/.test(x.t)).map(x => x.v[0]).sort().join() === 'pA,pD', reads.map(x => x.v));
check('the birthday note goes to her own client', C.LOGGED.some(x => x.c === 'c1' && x.text === 'Happy birthday Rae! From Glow Studio'), C.LOGGED);
check('the account with an oversized list still gets its birthday note', C.LOGGED.some(x => x.c === 'f1' && x.text === 'Happy birthday Fay! From us'), C.LOGGED);
check('no bulk read without a size cap', !D.QUERIES.some(x => /FROM kv WHERE k = 'sc_autos'/.test(x.t)));
check('never to an id that is not her client row', !C.LOGGED.some(x => x.c === 'cX'));
await run({ method: 'GET', headers: { authorization: 'Bearer s' }, query: {} }, res);
check('a second run the same day sends nothing new', C.LOGGED.length === 2, C.LOGGED);
console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
