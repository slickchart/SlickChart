// An INSTANT booking from her link must land in HER Square as it is made (2026-11-11).
//   TZ=UTC node scratchpad/test-instant-booking-square.mjs
// Before: api/book-request.js answered "Booked" and only logged an event; nothing reached Square, and
// the app's instant branch never called _reqSyncOut either. CONTROL=1 strips the new call and must fail.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V = '/home/user/SlickChart/slickchart-vercel';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibsq-'));
fs.mkdirSync(path.join(root, 'lib')); fs.mkdirSync(path.join(root, 'api'));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
for (const f of ['booking.js', 'square.js', 'google-cal.js']) fs.copyFileSync(path.join(V, 'lib', f), path.join(root, 'lib', f));
let br = fs.readFileSync(path.join(V, 'api', 'book-request.js'), 'utf8');
if (process.env.CONTROL) br = br.replace(/const sq = await squareBookInstant\([^;]*;/, 'const sq = null;');
fs.writeFileSync(path.join(root, 'api', 'book-request.js'), br);
fs.writeFileSync(path.join(root, 'lib', 'db.js'), `
export const KV = {}; export const S = { connected: true };
export function dbEnabled(){ return true; }
export async function getKVValue(o,k){ return KV[o+'|'+k] ?? null; }
export async function ensureProvidersTable(){} export async function ensureSquareCreateLog(){}
export async function logSquareCreate(){}
export function sql(){ return (s) => Promise.resolve(S.connected && s.join('?').includes('square_connections') && s.join('?').includes('SELECT *') ? [{access_token:'TOK',location_id:'L1',merchant_id:'M1',expires_at:null}] : []); }
`);
fs.writeFileSync(path.join(root, 'lib', 'auth.js'), 'export function verifyToken(){return null;}\nexport async function sessionFromReq(){return null;}\nexport async function isSessionValid(){return true;}\nexport async function sessionOk(){return true;}\n');
fs.writeFileSync(path.join(root, 'lib', 'crypto.js'), 'export const encrypt=x=>x; export const decrypt=x=>x;\n');
fs.writeFileSync(path.join(root, 'lib', 'consult.js'), "export async function getProviderBySlug(s){ return s==='ashley'?{id:'p1',email:'a@x.com',name:'A'}:null; }\n");
fs.writeFileSync(path.join(root, 'lib', 'clients.js'), "export const EVENTS=[]; export async function ensureClientTables(){} export async function upsertClient(p,r){ return {}; } export async function logEvent(){} export async function logEventOnce(p,c,k,pl,key){ if(EVENTS.some(e=>e.key===key)) return {id:key,inserted:false}; EVENTS.push({p,c,k,pl,key}); return {id:key,inserted:true}; } export function genToken(){ return Math.random().toString(36).slice(2); }\n");
fs.writeFileSync(path.join(root, 'lib', 'email.js'), "export const SENT=[]; export async function sendEmail(m){ SENT.push(m.subject); } export const trustedOrigin=()=>'https://x'; export const bookingGuestEmailHtml=()=>''; export const bookingGuestEmailText=()=>''; export const bookingProviderEmailHtml=()=>''; export const bookingProviderEmailText=()=>'';\n");

const DAY = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
// 10:00 AM in Los Angeles that day, as Square would answer it.
const laOffsetH = (() => { const d = new Date(DAY + 'T12:00:00Z'); const h = +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Los_Angeles' }).format(d); return 12 - h; })();
const SLOT = new Date(Date.UTC(+DAY.slice(0, 4), +DAY.slice(5, 7) - 1, +DAY.slice(8, 10), 10 + laOffsetH, 0, 0)).toISOString().replace('.000', '');
const SQ = { posts: [], failBook: false, customers: [] };
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url); const p = u.pathname; const body = o.body ? JSON.parse(o.body) : null;
  const ok = (j, st = 200) => ({ ok: st < 300, status: st, text: async () => JSON.stringify(j) });
  if (p === '/v2/catalog/list') return ok({ objects: [{ type: 'ITEM', id: 'I1', item_data: { name: 'Facial', product_type: 'APPOINTMENTS_SERVICE', variations: [{ id: 'V1', version: 7, item_variation_data: { name: 'Regular', service_duration: 3600000, team_member_ids: ['TM1'] } }] } }] });
  if (p === '/v2/locations') return ok({ locations: [{ id: 'L1', status: 'ACTIVE', timezone: 'America/Los_Angeles' }] });
  if (p === '/v2/bookings/availability/search') return ok({ availabilities: [{ start_at: SLOT, location_id: 'L1', appointment_segments: [{ team_member_id: 'TM2', duration_minutes: 75, service_variation_id: 'V1', service_variation_version: 7 }] }] });
  if (p === '/v2/bookings' && o.method === 'GET') return ok({ bookings: [] });
  if (p === '/v2/customers/search') return ok(SQ.customers.length ? { customers: SQ.customers } : {});
  if (p === '/v2/customers') { SQ.posts.push({ p, body }); return ok({ customer: { id: 'C1' } }); }
  if (p === '/v2/bookings') { SQ.posts.push({ p, body }); if (SQ.failBook) return ok({ errors: [{ detail: 'Seller is not subscribed' }] }, 403); return ok({ booking: { id: 'BK1', start_at: body.booking.start_at } }); }
  return ok({});
};
const db = await import(path.join(root, 'lib', 'db.js'));
const cl = await import(path.join(root, 'lib', 'clients.js'));
db.KV['p1|sc_booking_page'] = JSON.stringify({ on: true, mode: 'instant', slotMins: 60, leadHours: 0, emailMe: false, services: [{ name: 'Facial', mins: 60 }] });
const all = { open: true, start: '09:00', end: '17:00' };
db.KV['p1|sc_availability'] = JSON.stringify({ sun: all, mon: all, tue: all, wed: all, thu: all, fri: all, sat: all });
const h = (await import(path.join(root, 'api', 'book-request.js'))).default;
const book = async (name, mail, ip) => { let st = 0, out = null; await h({ method: 'POST', headers: { 'x-real-ip': ip }, body: { slug: 'ashley', name, email: mail, phone: '5555550100', service: 'Facial', date: DAY, time: '10:00 AM' } }, { status(s) { st = s; return this; }, json(o) { out = o; return this; } }); return { st, out }; };
const sqm = await import(path.join(root, 'lib', 'square.js'));

const R = []; const check = (n, pass, d) => R.push({ n, pass: !!pass, d: d || '' });
const bookings = () => SQ.posts.filter(x => x.p === '/v2/bookings');

// 1. Square connected: the booking goes into her Square with Square's own slot details.
let a = await book('Ann One', 'ann@x.com', '1.1.1.1');
const bk = bookings()[0];
check('person is told Booked', a.st === 200 && a.out && a.out.confirmed === true, JSON.stringify(a.out));
check('a booking is created in HER Square', !!bk, SQ.posts.map(x => x.p).join(','));
check('at the exact slot Square offered', bk && bk.body.booking.start_at === SLOT, bk && bk.body.booking.start_at + ' vs ' + SLOT);
check('with Square\'s team member and duration', bk && bk.body.booking.appointment_segments[0].team_member_id === 'TM2' && bk.body.booking.appointment_segments[0].duration_minutes === 75, bk && JSON.stringify(bk.body.booking.appointment_segments));
check('for the person, as a Square customer', bk && bk.body.booking.customer_id === 'C1', '');
const ev = cl.EVENTS[0];
check('the event tells the app it is already in Square', ev && ev.pl.squareBookingId === 'BK1' && ev.pl.autoConfirmed === true, ev && JSON.stringify(ev.pl));
// 2. A retry / double tap reuses the SAME Square key, so Square keeps one booking.
await book('Ann One', 'ann@x.com', '1.1.1.1');
const ks = bookings().map(x => x.body.idempotency_key);
check('a retry sends the same Square key (one booking)', ks.length === 2 && ks[0] === ks[1] && ks[0].length <= 45, JSON.stringify(ks));
// 3. Square refuses (e.g. free Square plan): the booking still stands; the app finishes it.
SQ.failBook = true; cl.EVENTS.length = 0;
const b = await book('Bea Two', 'bea@x.com', '2.2.2.2');
check('Square refusing does not turn Booked into an error', b.st === 200 && b.out && b.out.confirmed === true, JSON.stringify(b.out));
check('...and the event has no Square id, so the app takes over', cl.EVENTS[0] && !cl.EVENTS[0].pl.squareBookingId, cl.EVENTS[0] && JSON.stringify(cl.EVENTS[0].pl));
// 4. No Square at all: nothing is sent to Square.
SQ.failBook = false; db.S.connected = false; SQ.posts.length = 0; cl.EVENTS.length = 0;
const c = await book('Cat Three', 'cat@x.com', '3.3.3.3');
check('no Square: still booked, nothing sent to Square', c.out && c.out.confirmed === true && SQ.posts.length === 0, JSON.stringify(c.out));
// 5. Keys: long ids sharing their first 45 characters no longer collide; short ones are unchanged.
const pre = 'req-ev_idem_p_0123456789abcdef_c_bk_0123456789abcdef_';
check('long keys with the same start stay different', sqm.squareIdemKey(pre + 'bkAAAA') !== sqm.squareIdemKey(pre + 'bkBBBB') && sqm.squareIdemKey(pre + 'bkAAAA').length === 45, '');
check('a short key is kept exactly (retries still match)', sqm.squareIdemKey('req-bktest1') === 'req-bktest1' && sqm.squareIdemKey('a b!c') === 'abc', '');

fs.rmSync(root, { recursive: true, force: true });
let fail = 0; for (const r of R) { console.log((r.pass ? 'PASS ' : 'FAIL ') + r.n + (r.pass ? '' : '  ' + r.d)); if (!r.pass) fail++; }
console.log(fail ? fail + ' FAILED' : 'ALL ' + R.length + ' PASS'); process.exit(fail ? 1 : 0);
