// An INSTANT booking from the public link must land in the provider's OWN Square, once.
//
//   node scratchpad/test-instant-booking-square.mjs
//
// Before 2026-11-11, api/book-request.js only logged an event; the app filed it on the SlickChart
// calendar and nothing sent it to Square or Google. This drives the real handler with the real
// lib/booking.js + lib/square.js + lib/square-book.js against a mocked Square, and checks:
//   1  Square connected: one Square booking, at 10:00 AM in HER zone, for the guest's email, and the
//      event is marked sqBookingId so the app does not book it again
//   2  a double submit books nothing new (same Square key, same appointment)
//   3  the same person booking a SECOND day gets a second booking (the key is not the shared prefix)
//   4  no Square: no Square call at all, event marked sqSkip (the app sends it to Google)
//   5  Square cannot take it (no bookable team member): still "Booked", event marked sqMissed
//   6  Square refuses the create: still "Booked", sqMissed, nothing thrown
//   7  REQUEST mode: never touches Square bookings
//   8  isolation: the token used is the slug owner's, never anything from the body
import fs from 'fs'; import os from 'os'; import path from 'path';
const V = '/home/user/SlickChart/slickchart-vercel';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibsq-'));
fs.mkdirSync(path.join(root, 'lib')); fs.mkdirSync(path.join(root, 'api'));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
for (const f of ['booking.js', 'square.js', 'square-book.js', 'google-cal.js']) fs.copyFileSync(path.join(V, 'lib', f), path.join(root, 'lib', f));
fs.copyFileSync(path.join(V, 'api', 'book-request.js'), path.join(root, 'api', 'book-request.js'));
fs.writeFileSync(path.join(root, 'lib', 'db.js'), `
export const KV = {}; export const UPDATES = []; export const CONN = {}; export const CREATES = [];
export function dbEnabled(){ return true; }
export async function getKVValue(o,k){ return KV[o+'|'+k] ?? null; }
export async function ensureProvidersTable(){} export async function ensureSquareCreateLog(){}
export async function logSquareCreate(p,m,e){ CREATES.push([p,m,e]); }
export function sql(){ return (strs, ...vals) => {
  const t = strs.join('?');
  if (/FROM square_connections/.test(t)) { const c = CONN[vals[0]]; return Promise.resolve(c ? [c] : []); }
  if (/UPDATE client_events SET payload/.test(t)) { UPDATES.push({ mark: JSON.parse(vals[0]), id: vals[1], prov: vals[2] }); return Promise.resolve([]); }
  return Promise.resolve([]);
}; }
`);
fs.writeFileSync(path.join(root, 'lib', 'auth.js'), 'export function verifyToken(){return null;}\nexport async function sessionFromReq(){return null;}\n');
fs.writeFileSync(path.join(root, 'lib', 'crypto.js'), 'export const encrypt=x=>x; export const decrypt=x=>x;\n');
fs.writeFileSync(path.join(root, 'lib', 'consult.js'), "export async function getProviderBySlug(s){ return s==='ashley'?{id:'p_aaaaaaaaaaaaaaaa',email:'a@x.com',name:'A'}:(s==='nosq'?{id:'p_bbbbbbbbbbbbbbbb',email:'b@x.com',name:'B'}:null); }\n");
fs.writeFileSync(path.join(root, 'lib', 'clients.js'), "export const EVENTS=[]; export async function ensureClientTables(){} export async function upsertClient(p,r){ return {}; } export async function logEvent(){} export async function logEventOnce(p,c,k,pl,key){ const id='ev_idem_'+(p+'_'+c).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48)+'_'+key; if(EVENTS.some(e=>e.id===id)) return {id,inserted:false}; EVENTS.push({id,p,c,k,pl}); return {id,inserted:true}; } export function genToken(){ return Math.random().toString(36).slice(2); }\n");
fs.writeFileSync(path.join(root, 'lib', 'email.js'), "export const SENT=[]; export async function sendEmail(m){ SENT.push(m.subject); } export const trustedOrigin=()=>'https://x'; export const bookingGuestEmailHtml=()=>''; export const bookingGuestEmailText=()=>''; export const bookingProviderEmailHtml=()=>''; export const bookingProviderEmailText=()=>'';\n");

// ── mocked Square ──
const SQ = { bookings: {}, calls: [], tokens: new Set(), failCreate: false };
const svcCatalog = { objects: [{ type: 'ITEM', id: 'I1', item_data: { name: 'Facial', product_type: 'APPOINTMENTS_SERVICE', variations: [{ id: 'V1', version: 7, item_variation_data: { service_duration: 3600000, team_member_ids: ['TM1'] } }] } }] };
const j = (o, st = 200) => ({ ok: st < 300, status: st, text: async () => JSON.stringify(o) });
globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(url); const p = u.pathname; const m = opt.method || 'GET';
  const body = opt.body ? JSON.parse(opt.body) : null;
  SQ.tokens.add(String((opt.headers || {}).Authorization || ''));
  SQ.calls.push(m + ' ' + p);
  if (p === '/v2/catalog/list') return j(svcCatalog);
  if (p === '/v2/locations') return j({ locations: [{ id: 'L1', status: 'ACTIVE', timezone: 'America/Los_Angeles' }] });
  if (p === '/v2/bookings' && m === 'GET') return j({ bookings: [] });
  if (p === '/v2/bookings/availability/search') {
    const day = body.query.filter.start_at_range.start_at.slice(0, 10);
    // 10:00 and 12:00 Pacific on any day asked about
    const out = [];
    for (const h of [10, 12]) { const d = new Date(body.query.filter.start_at_range.end_at); d.setUTCHours(0, 0, 0, 0); }
    const base = new Date(body.query.filter.end_at || body.query.filter.start_at_range.end_at);
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
    for (const h of [10, 12]) {
      // find the UTC instant whose LA wall clock is ymd h:00
      for (let off = 6; off <= 9; off++) { const iso = new Date(ymd + 'T' + String(h + off).padStart(2, '0') + ':00:00Z'); const lbl = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false }).format(iso); if (+lbl === h) { out.push({ start_at: iso.toISOString() }); break; } }
    }
    return j({ availabilities: out });
  }
  if (p === '/v2/customers/search') return j({});
  if (p === '/v2/customers' && m === 'POST') return j({ customer: { id: 'C_' + (body.email_address || 'x') } });
  if (p === '/v2/bookings' && m === 'POST') {
    if (SQ.failCreate) return j({ errors: [{ detail: 'Square said no' }] }, 400);
    const k = body.idempotency_key;
    if (SQ.bookings[k]) { if (SQ.bookings[k].start_at !== body.booking.start_at) return j({ errors: [{ detail: 'IDEMPOTENCY_KEY_REUSED' }] }, 400); return j({ booking: SQ.bookings[k] }); }
    SQ.bookings[k] = { id: 'B' + Object.keys(SQ.bookings).length, ...body.booking };
    return j({ booking: SQ.bookings[k] });
  }
  if (p.startsWith('/v2/bookings/team-member-booking-profiles')) return j({ team_member_booking_profiles: SQ.noTeam ? [] : [{ team_member_id: 'TM1' }] });
  return j({});
};

const db = await import(path.join(root, 'lib', 'db.js'));
const all = { open: true, start: '09:00', end: '17:00' };
for (const pid of ['p_aaaaaaaaaaaaaaaa', 'p_bbbbbbbbbbbbbbbb']) {
  db.KV[pid + '|sc_booking_page'] = JSON.stringify({ on: true, mode: 'instant', slotMins: 60, leadHours: 0, emailMe: false, services: [{ name: 'Facial', mins: 60 }, { name: 'Brow tidy', mins: 30 }] });
  db.KV[pid + '|sc_availability'] = JSON.stringify({ sun: all, mon: all, tue: all, wed: all, thu: all, fri: all, sat: all });
  db.KV[pid + '|sc_bizinfo'] = JSON.stringify({ tz: 'America/Los_Angeles' });
}
db.CONN['p_aaaaaaaaaaaaaaaa'] = { access_token: 'TOKEN_A', location_id: 'L1', merchant_id: 'M_A' };
const h = (await import(path.join(root, 'api', 'book-request.js'))).default;
const book = async (slug, name, mail, ip, date, time, service) => { let st = 0, out = null; await h({ method: 'POST', headers: { 'x-real-ip': ip }, body: { slug, name, email: mail, phone: '5555550100', service: service || 'Facial', date, time, provider_id: 'p_bbbbbbbbbbbbbbbb' } }, { status(s) { st = s; return this; }, json(o) { out = o; return this; } }); return { st, out }; };
const dayN = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const posts = () => SQ.calls.filter(c => c === 'POST /v2/bookings').length;

let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

// 1
const D1 = dayN(5);
const r1 = await book('ashley', 'Ann One', 'ann@x.com', '1.1.1.1', D1, '10:00 AM');
const bk = Object.values(SQ.bookings);
const la = bk[0] ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(bk[0].start_at)) : '';
check(r1.st === 200 && r1.out.confirmed === true, '1 guest told Booked');
check(bk.length === 1 && bk[0].customer_id === 'C_ann@x.com' && bk[0].location_id === 'L1' && bk[0].appointment_segments[0].service_variation_id === 'V1' && bk[0].appointment_segments[0].team_member_id === 'TM1', '1 one Square booking for her customer, her service, her team member');
check(/10:00\s?AM/.test(la) && la.startsWith(D1.slice(5, 7) + '/' + D1.slice(8, 10)), '1 at 10:00 AM on that day in her zone (got ' + la + ')');
check(db.UPDATES.length === 1 && db.UPDATES[0].mark.sqBookingId === bk[0].id && db.UPDATES[0].prov === 'p_aaaaaaaaaaaaaaaa', '1 event marked sqBookingId (scoped to her)');
check(Object.keys(SQ.bookings)[0].length <= 45, '1 Square key within 45 characters');
// 2
const before2 = Object.keys(SQ.bookings).length;
await book('ashley', 'Ann One', 'ann@x.com', '1.1.1.1', D1, '10:00 AM');
check(Object.keys(SQ.bookings).length === before2, '2 a double submit books nothing new');
// 3
const r3 = await book('ashley', 'Ann One', 'ann@x.com', '1.1.1.2', dayN(6), '12:00 PM');
check(r3.out && r3.out.confirmed && Object.keys(SQ.bookings).length === before2 + 1, '3 same person, second day, second Square booking (no reused key)');
// 4
const calls4 = SQ.calls.length; db.UPDATES.length = 0;
const r4 = await book('nosq', 'Bea Two', 'bea@x.com', '2.2.2.2', D1, '10:00 AM');
check(r4.out && r4.out.confirmed && SQ.calls.length === calls4, '4 no Square: booked, no Square call at all');
check(db.UPDATES.length === 1 && db.UPDATES[0].mark.sqSkip === true && db.UPDATES[0].prov === 'p_bbbbbbbbbbbbbbbb', '4 event marked sqSkip');
// 5
db.UPDATES.length = 0; const p5 = posts();
SQ.noTeam = true; svcCatalog.objects[0].item_data.variations[0].item_variation_data.team_member_ids = [];
const r5 = await book('ashley', 'Cat Three', 'cat@x.com', '3.3.3.3', dayN(7), '12:00 PM');
SQ.noTeam = false; svcCatalog.objects[0].item_data.variations[0].item_variation_data.team_member_ids = ['TM1'];
check(r5.out && r5.out.confirmed && posts() === p5 && db.UPDATES[0] && /team member/.test(db.UPDATES[0].mark.sqMissed || ''), '5 no bookable team member: Booked, sqMissed, no booking attempt (' + JSON.stringify(db.UPDATES[0] && db.UPDATES[0].mark) + ')');
// 6
db.UPDATES.length = 0; SQ.failCreate = true;
const r6 = await book('ashley', 'Dee Four', 'dee@x.com', '4.4.4.4', dayN(8), '10:00 AM');
SQ.failCreate = false;
check(r6.st === 200 && r6.out.confirmed && db.UPDATES[0] && /Square said no/.test(db.UPDATES[0].mark.sqMissed || ''), '6 Square refuses: still Booked, sqMissed recorded');
// 7
db.KV['p_aaaaaaaaaaaaaaaa|sc_booking_page'] = JSON.stringify({ on: true, mode: 'request', slotMins: 60, leadHours: 0, emailMe: false, services: [{ name: 'Facial', mins: 60 }] });
db.UPDATES.length = 0; const p7 = posts();
const r7 = await book('ashley', 'Eve Five', 'eve@x.com', '5.5.5.5', dayN(9), '10:00 AM');
check(r7.out && r7.out.confirmed === false && posts() === p7 && db.UPDATES.length === 0, '7 request mode: no Square booking, nothing marked');
// 8
check([...SQ.tokens].every(t => t === 'Bearer TOKEN_A'), '8 only the slug owner\'s own token was ever used');

fs.rmSync(root, { recursive: true, force: true });
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
