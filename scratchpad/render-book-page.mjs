// Renders api/book-page.js for a test, with the db/booking libs stubbed (real public-brand.js).
// Prints the HTML. Used by test-booking-qr.mjs.
import fs from 'fs'; import os from 'os'; import path from 'path';
const src = path.resolve('slickchart-vercel');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bookpg-')); fs.mkdirSync(d + '/api'); fs.mkdirSync(d + '/lib');
fs.copyFileSync(src + '/api/book-page.js', d + '/api/book-page.js');
fs.copyFileSync(src + '/lib/public-brand.js', d + '/lib/public-brand.js');
fs.writeFileSync(d + '/package.json', '{"type":"module"}');
fs.writeFileSync(d + '/lib/db.js', 'export const dbEnabled=()=>true; export async function getKVValue(){return null;}');
fs.writeFileSync(d + '/lib/consult.js', 'export async function getProviderBySlug(s){return {id:"p1",name:"Rose Glow Skin"};}');
const real = fs.readFileSync(src + '/lib/booking.js', 'utf8');
const keys = ['DAY_KEYS', 'toMins', 'openDayKeys', 'serviceMins', 'serviceDeposit'];
fs.writeFileSync(d + '/lib/booking.js', `
export const DAY_KEYS=['sun','mon','tue','wed','thu','fri','sat'];
export async function providerTz(){return ${JSON.stringify(process.env.PROV_TZ || 'America/Los_Angeles')};}
export const toMins=s=>{const [h,m]=String(s).split(':').map(Number);return h*60+(m||0);};
export const openDayKeys=h=>DAY_KEYS.filter(k=>h[k]&&h[k].open);
export const serviceMins=(s,c)=>s.mins||60; export const serviceDeposit=()=>0;
export async function getBookingConfig(){return {on:true,mode:'request',horizonDays:30,requirePhone:true,note:''};}
export async function getHours(){return {mon:{open:true,start:'09:00',end:'17:00'}};}
export async function getServices(){return [{name:'Facial',mins:60}];}
`);
const mod = await import(d + '/api/book-page.js');
let out = ''; const res = { setHeader() {}, status() { return res; }, send(b) { out = b; } };
await mod.default({ query: { slug: 'rose-glow' } }, res);
process.stdout.write(out);
