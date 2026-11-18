// test-nurture-sent-preload-pg: lib/nurture.js processContact with the one-query "already sent" preload
// (2026-11-18) against REAL PostgreSQL 16. Proves: same emails as before, far fewer queries, and the
// overlap guard (a step claimed minutes ago stops the contact) still holds.
import { execFileSync } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const VERCEL = '/home/user/SlickChart/slickchart-vercel', PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nur-')), sock = fs.mkdtempSync(path.join(os.tmpdir(), 'nursock-')), PORT = '55512';
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' });
const USER = 'pgtest'; try { sh('id pgtest'); } catch (e) { sh('useradd -m pgtest'); }
sh('chown -R pgtest ' + root + ' ' + sock + ' && chmod 777 ' + sock);
const pg = c => sh("su pgtest -c '" + c.replace(/'/g, "'\\''") + "'");
pg(PGBIN + '/initdb -D ' + root + '/data -U pgtest --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
process.on('exit', () => { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} });
fs.mkdirSync(root + '/lib'); fs.writeFileSync(root + '/package.json', '{"type":"module"}');
fs.copyFileSync(VERCEL + '/lib/nurture.js', root + '/lib/nurture.js');
fs.writeFileSync(root + '/lib/db.js', `import { execFileSync } from 'child_process'; let n=0; export let CALLS={n:0};
function lit(v){ if(v===null||v===undefined)return 'NULL'; if(typeof v==='number')return String(v); const t='q'+(n++); return '$'+t+'$'+String(v)+'$'+t+'$'; }
function run(text){ CALLS.n++; const t=text.trim(); const sel=/^select/i.test(t); const ret=!sel&&/returning/i.test(t);
 const q=sel?"SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM ("+t+") t":ret?"WITH t AS ("+t+") SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM t":t;
 const out=execFileSync('${PGBIN}/psql',['-h','${sock}','-p','${PORT}','-U','pgtest','-d','postgres','-A','-t','-X','-q','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}); return (sel||ret)?JSON.parse(out.trim()||'[]'):[]; }
export function sql(){ return (s,...v)=>{ let x=''; s.forEach((p,i)=>{x+=p; if(i<v.length)x+=lit(v[i]);}); return Promise.resolve().then(()=>run(x)); }; }
export async function ensureProvidersTable(){}`);
fs.writeFileSync(root + '/lib/email.js', `export const SENT=[]; export async function sendEmail(m){ SENT.push(m.to+'|'+m.subject); return {ok:true}; } export function appOrigin(){return 'https://slickchart.app';}`);
fs.writeFileSync(root + '/lib/pricing.js', `export function signupPricing(){return {};}`);
fs.writeFileSync(root + '/lib/referral.js', `export async function getReferralSettings(){return null;}`);
const N = await import(pathToFileURL(root + '/lib/nurture.js')); const D = await import(pathToFileURL(root + '/lib/db.js')); const E = await import(pathToFileURL(root + '/lib/email.js'));
const q = D.sql(); await N.ensureNurtureTables(q);
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const DAY = 86400000, SEQ = N.LEAD_SEQUENCE;
// 40 contacts 30 days in, all steps sent; 5 contacts 3 days in with step 0 sent (step 1 due)
const done = Array.from({ length: 40 }, (_, i) => ({ email: 'done' + i + '@x.com', name: 'D', ts: Date.now() - 30 * DAY }));
const mid = Array.from({ length: 5 }, (_, i) => ({ email: 'mid' + i + '@x.com', name: 'M', ts: Date.now() - 3 * DAY }));
const vals = []; for (const r of done) SEQ.forEach((s, i) => vals.push(`('${r.email}','lead',${i}, now() - interval '5 days')`));
for (const r of mid) vals.push(`('${r.email}','lead',0, now() - interval '2 days')`);
await q([`INSERT INTO nurture_sends (email, seq, step, sent_at) VALUES ` + vals.join(',')]);
async function runAll(usePreload) {
  const sum = { lead: 0, errors: 0 }; D.CALLS.n = 0; E.SENT.length = 0;
  const sent = usePreload ? await N.loadSentSteps(q, 'lead') : undefined;
  for (const r of [...done, ...mid]) await N.processContact(q, 'lead', SEQ, r, {}, sum, undefined, sent);
  return { calls: D.CALLS.n, sent: [...E.SENT].sort(), sum };
}
const snap = await q`SELECT email, step FROM nurture_sends ORDER BY email, step`;
const A = await runAll(true);
ok(A.sent.length === 5 && A.sent.every(s => s.startsWith('mid')), 'preload: the 5 contacts with a step due each get exactly one email (' + A.sent.length + ')');
ok(A.calls <= 1 + 5 * 2, 'preload: ' + A.calls + ' queries for 45 contacts (one read + one claim per due step)');
// Reset to the same state, run the OLD way
await q`DELETE FROM nurture_sends WHERE email LIKE 'mid%' AND step > 0`;
const B = await runAll(false);
ok(JSON.stringify(B.sent) === JSON.stringify(A.sent), 'old path sends the identical emails');
ok(B.calls > A.calls * 10, 'old path used ' + B.calls + ' queries vs ' + A.calls);
// second run: nothing due anymore (just sent within 10 min -> guard returns, nothing re-sent)
const C = await runAll(true);
ok(C.sent.length === 0, 'run again right away: nothing sent twice');
// overlap guard: a step claimed 1 minute ago by another run stops the contact
await q`DELETE FROM nurture_sends WHERE email LIKE 'mid%' AND step > 0`;
await q`UPDATE nurture_sends SET sent_at = now() - interval '1 minute' WHERE email = 'mid0@x.com' AND step = 0`;
const F = await runAll(true);
ok(!F.sent.some(s => s.startsWith('mid0@')) && F.sent.length === 4, 'a step claimed a minute ago (another run in flight) stops that contact');
// a stale map (step claimed by another run AFTER the read) still cannot double-send
await q`DELETE FROM nurture_sends WHERE email LIKE 'mid%' AND step > 0`;
const stale = await N.loadSentSteps(q, 'lead');
await q`INSERT INTO nurture_sends (email, seq, step) VALUES ('mid1@x.com','lead',1)`;
E.SENT.length = 0; await N.processContact(q, 'lead', SEQ, mid[1], {}, { lead: 0, errors: 0 }, undefined, stale);
ok(E.SENT.length === 0, 'claimed by another run after the read: the atomic claim still stops a second email');
ok(N.loadSentSteps.length === 2 && (await N.loadSentSteps(async () => { throw new Error('x'); }, 'lead')) === null, 'a failed read returns null (falls back to the old per-step claim)');
console.log(pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
