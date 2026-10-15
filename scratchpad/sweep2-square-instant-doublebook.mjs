// SWEEP 2 / public booking link, INSTANT mode: two strangers are both told "Booked" for the same slot.
//
//   TZ=UTC node scratchpad/sweep2-square-instant-doublebook.mjs
//
// api/book-request.js re-checks the slot with openSlots() and, if free, answers confirmed:true and
// emails the guest "Booked: ...". But it only LOGS a client_event; nothing it writes is read by
// busyRanges (sc_manual_appts / Square / Google). In the app the event arrives as a PENDING request
// (syncClientEvents ignores autoConfirmed), so until Ashley opens the app AND confirms it, the slot
// stays free and the next stranger is auto-confirmed into it too.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V = '/home/user/SlickChart/slickchart-vercel';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sw2ib-'));
fs.mkdirSync(path.join(root, 'lib')); fs.mkdirSync(path.join(root, 'api'));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
for (const f of ['booking.js', 'square.js', 'google-cal.js']) fs.copyFileSync(path.join(V, 'lib', f), path.join(root, 'lib', f));
fs.copyFileSync(path.join(V, 'api', 'book-request.js'), path.join(root, 'api', 'book-request.js'));
fs.writeFileSync(path.join(root, 'lib', 'db.js'), `
export const KV = {};
export function dbEnabled(){ return true; }
export async function getKVValue(o,k){ return KV[o+'|'+k] ?? null; }
export async function ensureProvidersTable(){} export async function ensureSquareCreateLog(){}
export function sql(){ return () => Promise.resolve([]); }
`);
fs.writeFileSync(path.join(root, 'lib', 'auth.js'), 'export function verifyToken(){return null;}\n');
fs.writeFileSync(path.join(root, 'lib', 'crypto.js'), 'export const encrypt=x=>x; export const decrypt=x=>x;\n');
fs.writeFileSync(path.join(root, 'lib', 'consult.js'), "export async function getProviderBySlug(s){ return s==='ashley'?{id:'p1',email:'a@x.com',name:'A'}:null; }\n");
fs.writeFileSync(path.join(root, 'lib', 'clients.js'), "export const EVENTS=[]; export async function ensureClientTables(){} export async function upsertClient(p,r){ return {}; } export async function logEvent(p,c,k,pl){ EVENTS.push({p,c,k,pl}); } export function genToken(){ return Math.random().toString(36).slice(2); }\n");
fs.writeFileSync(path.join(root, 'lib', 'email.js'), "export const SENT=[]; export async function sendEmail(m){ SENT.push(m.subject); } export const trustedOrigin=()=>'https://x'; export const bookingGuestEmailHtml=()=>''; export const bookingGuestEmailText=()=>''; export const bookingProviderEmailHtml=()=>''; export const bookingProviderEmailText=()=>'';\n");
globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '{}', json: async () => ({}) });

const db = await import(path.join(root, 'lib', 'db.js'));
const email = await import(path.join(root, 'lib', 'email.js'));
db.KV['p1|sc_booking_page'] = JSON.stringify({ on: true, mode: 'instant', slotMins: 60, leadHours: 0, emailMe: false, services: [{ name: 'Facial', mins: 60 }] });
const DAY = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
const all = { open: true, start: '09:00', end: '17:00' };
db.KV['p1|sc_availability'] = JSON.stringify({ sun: all, mon: all, tue: all, wed: all, thu: all, fri: all, sat: all });
const h = (await import(path.join(root, 'api', 'book-request.js'))).default;
const book = async (name, mail, ip) => { let st = 0, out = null; await h({ method: 'POST', headers: { 'x-real-ip': ip }, body: { slug: 'ashley', name, email: mail, phone: '5555550100', service: 'Facial', date: DAY, time: '10:00 AM' } }, { status(s) { st = s; return this; }, json(o) { out = o; return this; } }); return { st, out }; };
const a = await book('Ann One', 'ann@x.com', '1.1.1.1');
const b = await book('Bea Two', 'bea@x.com', '2.2.2.2');
const ok = !(a.out && a.out.confirmed && b.out && b.out.confirmed);
console.log((ok ? 'SOUND        ' : 'CONFIRMED-BUG') + '  second stranger is refused the slot the first was told is booked  — first=' + JSON.stringify(a.out) + ' second=' + JSON.stringify(b.out) + ' guest emails=' + JSON.stringify(email.SENT));
fs.rmSync(root, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
