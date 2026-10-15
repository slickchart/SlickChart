// sweep2-sec: unauthenticated POST /api/client-link with {email, origin} — where does the emailed
// token-bearing link point? Runs the REAL api/client-link.js with db/email stubbed.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V='/home/user/SlickChart/slickchart-vercel';
const t=fs.mkdtempSync(path.join(os.tmpdir(),'s2cl-')); fs.mkdirSync(t+'/api'); fs.mkdirSync(t+'/lib');
fs.copyFileSync(V+'/api/client-link.js',t+'/api/client-link.js');
fs.writeFileSync(t+'/package.json','{"type":"module"}');
fs.writeFileSync(t+'/lib/db.js',`export function dbEnabled(){return true} export function sql(){return async()=>[{token:'REAL_CLIENT_TOKEN_abc123',name:'Jane Victim',email:'jane@victim.com',provider_id:'p_x'}]}`);
fs.writeFileSync(t+'/lib/clients.js','export async function ensureClientTables(){}');
fs.writeFileSync(t+'/lib/email.js',`export const SENT=[]; export async function sendEmail(m){SENT.push(m)} export function trustedOrigin(){return 'https://slickchart.app'} export function safeLinkOrigin(c){const o=['https://slickchart.app','https://www.slickchart.app','https://slick-chart.vercel.app'];c=String(c||'').trim().replace(/\\/+$/,'').toLowerCase();return o.indexOf(c)>=0?c:'https://slickchart.app';}`);
const { default: h } = await import(t+'/api/client-link.js');
const E = await import(t+'/lib/email.js');
const res={status(){return this},json(b){this.b=b}};
await h({method:'POST',headers:{'x-real-ip':'1.2.3.4'},body:{email:'jane@victim.com',origin:'https://attacker.example'}},res);
const m=E.SENT[0]||{};
const link=(String(m.text||'').match(/https?:\/\/\S+/)||[''])[0];
console.log('response to attacker:',JSON.stringify(res.b));
console.log('email sent to',m.to,'with link',link);
console.log(link.startsWith('https://attacker.example')?'CONFIRMED-BUG: a stranger chooses the host of the token link emailed to a real client':'SOUND');
