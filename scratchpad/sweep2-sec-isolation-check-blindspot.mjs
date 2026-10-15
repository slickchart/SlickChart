// sweep2-sec: does scripts/check-tenant-isolation.cjs check B ("SQL with no owner in it") ever fire?
// Copies the script + api/ into a temp tree, plants one obviously unscoped query written the way EVERY
// endpoint in this repo writes SQL (the tag is `q`), and runs the check.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { execFileSync } from 'child_process';
const V='/home/user/SlickChart/slickchart-vercel';
const t=fs.mkdtempSync(path.join(os.tmpdir(),'s2iso-'));
fs.mkdirSync(t+'/scripts'); fs.cpSync(V+'/api',t+'/api',{recursive:true});
fs.copyFileSync(V+'/scripts/check-tenant-isolation.cjs',t+'/scripts/check-tenant-isolation.cjs');
const run=()=>{try{return execFileSync('node',[t+'/scripts/check-tenant-isolation.cjs'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})}catch(e){return 'EXIT '+e.status+'\n'+e.stderr}};
fs.writeFileSync(t+'/api/zz-planted.js','export default async function h(req,res){ const q=sql(); const rows = await q`SELECT * FROM clients WHERE id = ${req.params.x}`; res.json(rows); }\n');
const a=run(); console.log('planted q`SELECT * FROM clients WHERE id=...`  ->', a.trim().split('\n')[0]);
fs.writeFileSync(t+'/api/zz-planted.js','export default async function h(req,res){ const rows = await sql`SELECT * FROM clients WHERE id = ${req.params.x}`; res.json(rows); }\n');
const b=run(); console.log('same query with tag `sql`               ->', b.trim().split('\n')[0]);
console.log(/clean/.test(a)&&!/clean/.test(b)?'CONFIRMED-BUG: check B only matches the tag names sql/query; every query in api/ uses q`...`, so check B has never inspected a single statement':'SOUND');
