// SWEEP 2 / Square path: public booking slots vs. the provider's real calendar.
//
//   TZ=UTC node scratchpad/sweep2-square-slots-tz.mjs        (Vercel runs in UTC)
//
// Runs the SHIPPED lib/booking.js + lib/square.js + lib/google-cal.js in a temp tree with db/auth/
// crypto stubbed and global fetch answering for Square and Google. Provider is in Los Angeles.
//
// Day: Tue 2026-10-20, hours 9:00-17:00, 60-minute grid.
//   Square booking   10:00-11:00 PDT  (17:00Z)
//   Google event     13:00-14:00 PDT  (20:00Z)
//   Manual appt      15:00 (sc_manual_appts, wall clock)
// None of 10:00 AM, 1:00 PM, 3:00 PM may be offered.
import fs from 'fs'; import os from 'os'; import path from 'path';
const VERCEL = '/home/user/SlickChart/slickchart-vercel';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sw2slots-'));
fs.mkdirSync(path.join(root, 'lib'));
for (const f of ['booking.js', 'square.js', 'google-cal.js']) fs.copyFileSync(path.join(VERCEL, 'lib', f), path.join(root, 'lib', f));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(root, 'lib', 'db.js'), `
export const KV = {};
export function dbEnabled(){ return true; }
export async function getKVValue(o,k){ return KV[o+'|'+k] ?? null; }
export async function ensureProvidersTable(){} export async function ensureSquareCreateLog(){}
export function sql(){ return (s, ...v) => { const t = s.join('?');
  if (/FROM square_connections WHERE provider_id/.test(t)) return Promise.resolve([{ provider_id:'p1', access_token:'SQTOK', refresh_token:'R', expires_at: new Date(Date.now()+90*864e5).toISOString(), merchant_id:'M1', location_id:'L1' }]);
  if (/FROM google_accounts WHERE provider_id/.test(t)) return Promise.resolve(globalThis.__GOOGLE_ON ? [{ id:'p1:g', provider_id:'p1', label:'her', access_token:'GTOK', refresh_token:'GR', expires_at: Date.now()+3600e3, calendar_ids:'primary', event_map:'{}', private_titles:false, created_at:1 }] : []);
  if (/FROM google_connections/.test(t)) return Promise.resolve([]);
  const p = Promise.resolve([]); return p; }; }
`);
fs.writeFileSync(path.join(root, 'lib', 'auth.js'), 'export function verifyToken(){return null;}\n');
fs.writeFileSync(path.join(root, 'lib', 'crypto.js'), 'export const encrypt=x=>x; export const decrypt=x=>x;\n');

const SQ_BOOKING = { id: 'b1', status: 'ACCEPTED', start_at: '2026-10-20T17:00:00Z', location_id: 'L1', appointment_segments: [{ duration_minutes: 60, service_variation_id: 'V1' }] };
const G_EVENT = { id: 'g1', status: 'confirmed', start: { dateTime: '2026-10-20T13:00:00-07:00' }, end: { dateTime: '2026-10-20T14:00:00-07:00' } };
const seen = [];
globalThis.fetch = async (url, opts) => {
  const u = String(url); seen.push(u.replace(/^https:\/\/[^/]+/, ''));
  const J = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
  if (u.includes('/v2/locations')) return J({ locations: [{ id: 'L1', status: 'ACTIVE', timezone: 'America/Los_Angeles' }] });
  if (u.includes('/v2/catalog/list')) return J({ objects: [{ type: 'ITEM', id: 'I1', item_data: { name: 'Signature Facial', product_type: 'APPOINTMENTS_SERVICE', variations: [{ id: 'V1', version: 1, item_variation_data: { name: 'Regular', service_duration: 3600000, team_member_ids: ['T1'] } }] } }] });
  if (u.includes('/v2/bookings/availability/search')) {
    // Square knows only its own bookings: every hour 9-4 PDT except 10.
    const av = [9, 11, 12, 13, 14, 15, 16].map(h => ({ start_at: new Date(Date.UTC(2026, 9, 20, h + 7)).toISOString() }));
    return J({ availabilities: av });
  }
  if (u.includes('/v2/bookings')) {
    const q = new URL(u).searchParams; const mn = Date.parse(q.get('start_at_min')), mx = Date.parse(q.get('start_at_max'));
    const t = Date.parse(SQ_BOOKING.start_at);
    return J({ bookings: (t >= mn && t < mx) ? [SQ_BOOKING] : [] });
  }
  if (u.includes('googleapis.com/calendar')) {
    const q = new URL(u).searchParams; const mn = Date.parse(q.get('timeMin')), mx = Date.parse(q.get('timeMax'));
    const t = Date.parse(G_EVENT.start.dateTime);
    return J({ items: (t >= mn && t < mx) ? [G_EVENT] : [] });
  }
  return J({});
};

const db = await import(path.join(root, 'lib', 'db.js'));
const B = await import(path.join(root, 'lib', 'booking.js'));
db.KV['p1|sc_manual_appts'] = JSON.stringify([{ id: 'ma1', client: 'Pat', date: '2026-10-20', time: '3:00 PM', dur: 60 }]);
const hours = { sun: { open: false }, mon: { open: false }, tue: { open: true, start: '09:00', end: '17:00' }, wed: { open: false }, thu: { open: false }, fri: { open: false }, sat: { open: false } };
const cfg = Object.assign({}, B.DEFAULT_CONFIG, { on: true, mode: 'instant', slotMins: 60, leadHours: 0 });

const results = []; const check = (n, ok, d) => results.push({ n, ok, d });
console.log('process TZ =', Intl.DateTimeFormat().resolvedOptions().timeZone);

// 1) book-slots.js passes NO service name -> Square path skipped -> grid with busyRanges.
globalThis.__GOOGLE_ON = true;
const pub = await B.openSlots('p1', '2026-10-20', cfg, hours);
check('public page (api/book-slots, no service): 10:00 AM Square booking not offered', Array.isArray(pub) && !pub.includes('10:00 AM'), JSON.stringify(pub));
check('public page: 1:00 PM Google event not offered', Array.isArray(pub) && !pub.includes('1:00 PM'), JSON.stringify(pub));
check('public page: 3:00 PM manual appt not offered', Array.isArray(pub) && !pub.includes('3:00 PM'), JSON.stringify(pub));
const busy = await B.busyRanges('p1', '2026-10-20', 60, 0);
check('busyRanges puts the 10:00 PDT Square booking at 600 minutes', Array.isArray(busy) && busy.some(b => b.start === 600), JSON.stringify(busy));

// 2) client app / book-request pass the service name -> Square availability path.
const svc = await B.openSlots('p1', '2026-10-20', cfg, hours, 'Signature Facial');
check('Square-answer path (client app / book-request): 1:00 PM Google event not offered', Array.isArray(svc) && !svc.includes('1:00 PM'), JSON.stringify(svc));
check('Square-answer path: 3:00 PM manual SlickChart appt not offered', Array.isArray(svc) && !svc.includes('3:00 PM'), JSON.stringify(svc));

let bad = 0; for (const r of results) { if (!r.ok) bad++; console.log((r.ok ? 'SOUND        ' : 'CONFIRMED-BUG') + '  ' + r.n + '  — ' + r.d); }
console.log(`\n${results.length - bad}/${results.length} sound`);
fs.rmSync(root, { recursive: true, force: true });
