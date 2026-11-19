// api/cron-automations.js: a scheduled message fills every token the editor offers ({business_name} etc.),
// not only {client_name} (2026-11-19). Stubbed db/clients, real handler.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V = new URL('../slickchart-vercel/', import.meta.url).pathname;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cau-')); fs.mkdirSync(root + '/lib'); fs.mkdirSync(root + '/api');
fs.writeFileSync(root + '/package.json', '{"type":"module"}');
fs.copyFileSync(V + 'api/cron-automations.js', root + '/api/cron-automations.js');
fs.writeFileSync(root + '/lib/db.js', `export const KV={}; export const READS=[];
export const dbEnabled=()=>true; export const ensureTable=async()=>{}; export function sql(){ return async()=>[]; }
export async function readKeyAllOwners(q,key){ return Object.entries(KV).filter(([k])=>k.endsWith('|'+key)).map(([k,v])=>({owner:k.split('|')[0],v})); }
export async function getKVValue(o,k){ READS.push(o+'|'+k); const x=KV[o+'|'+k]; return x==null?null:x; }`);
fs.writeFileSync(root + '/lib/clients.js', `export const LOGGED=[]; export const CL={}; const seen=new Set();
export const ensureClientTables=async()=>{}; export const listClients=async(o)=>CL[o]||[];
export const claimReminder=async(c,k)=>{ const kk=c+'|'+k; if(seen.has(kk)) return false; seen.add(kk); return true; };
export const logEvent=async(o,c,k,p)=>{ LOGGED.push({o,c,text:p.text}); }; export const listPushSubs=async()=>[]; export const deletePushSub=async()=>{};
export const spaceUrl=t=>'/space/'+t; export const getClientToken=async()=>'t'; export const wantsPush=async()=>false;`);
fs.writeFileSync(root + '/lib/push.js', 'export const pushConfigured=()=>false; export const sendPushToAll=async()=>0;');
fs.writeFileSync(root + '/lib/fcm.js', 'export const nativePushConfigured=()=>false; export const sendNativeToClient=async()=>0;');
fs.writeFileSync(root + '/lib/cron-runs.js', 'export const withCronRun=(n,h)=>h;');
process.env.CRON_SECRET = 's';
const D = await import(root + '/lib/db.js'); const C = await import(root + '/lib/clients.js');
const run = (await import(root + '/api/cron-automations.js')).default;
const due = Date.now() - 60000;
D.KV['pA|sc_autos'] = JSON.stringify([{ id: 'a1', name: 'Holiday', msg: 'Hi {client_name}, {business_name} is open late for {treatment_name} before {appointment_date}!', sendAt: due }]);
D.KV['pA|sc_bizinfo'] = JSON.stringify({ name: 'Glow Studio' });
C.CL.pA = [{ id: 'c1', name: 'Rae Smith' }, { id: 'c2', name: '' }];
D.KV['pB|sc_autos'] = JSON.stringify([{ id: 'b1', name: 'Promo', msg: 'Thanks from {business_name}', sendAt: due }]);   // no business name saved
C.CL.pB = [{ id: 'd1', name: 'Dee' }];
const res = { status(c) { this.c = c; return this; }, json(b) { this.b = b; return this; } };
await run({ method: 'GET', headers: { authorization: 'Bearer s' }, query: {} }, res);
let fails = 0; const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' — ' + JSON.stringify(d))); if (!ok) fails++; };
check('ran OK', res.c === 200, res);
check('every token filled', C.LOGGED.some(x => x.c === 'c1' && x.text === 'Hi Rae, Glow Studio is open late for your treatment before your next visit!'), C.LOGGED);
check('no name: "there"', C.LOGGED.some(x => x.c === 'c2' && /^Hi there,/.test(x.text)), C.LOGGED);
check('no business name saved: a plain fallback, never the raw token', C.LOGGED.some(x => x.c === 'd1' && x.text === 'Thanks from your studio'), C.LOGGED);
check('no braces reach a client', !C.LOGGED.some(x => /[{}]/.test(x.text)), C.LOGGED);
check('business name read once per provider, only her own', D.READS.filter(r => /sc_bizinfo/.test(r)).sort().join() === 'pA|sc_bizinfo,pB|sc_bizinfo', D.READS);
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
