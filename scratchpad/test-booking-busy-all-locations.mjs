import fs from 'fs'; import os from 'os'; import path from 'path';
const VERCEL = new URL('../slickchart-vercel', import.meta.url).pathname+'';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sw2slots-'));
fs.mkdirSync(path.join(root, 'lib'));
for (const f of ['booking.js', 'square.js', 'google-cal.js']) fs.copyFileSync(path.join(VERCEL, 'lib', f), path.join(root, 'lib', f));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(root, 'lib', 'db.js'), `
export const KV = {};
export function dbEnabled(){ return true; }
export async function getKVValue(o,k){ return KV[o+'|'+k] ?? null; }
export async function ensureProvidersTable(){} export async function ensureSquareCreateLog(){} export async function logSquareCreate(){}
export function sql(){ return (s, ...v) => { const t = s.join('?');
  if (/FROM square_connections WHERE provider_id/.test(t)) return Promise.resolve([{ provider_id:'p1', access_token:'SQTOK', refresh_token:'R', expires_at: new Date(Date.now()+90*864e5).toISOString(), merchant_id:'M1', location_id:'L1' }]);
  if (/FROM google_accounts WHERE provider_id/.test(t)) return Promise.resolve(globalThis.__GOOGLE_ON ? [{ id:'p1:g', provider_id:'p1', label:'her', access_token:'GTOK', refresh_token:'GR', expires_at: Date.now()+3600e3, calendar_ids:'primary', event_map:'{}', private_titles:false, created_at:1 }] : []);
  if (/FROM google_connections/.test(t)) return Promise.resolve([]);
  const p = Promise.resolve([]); return p; }; }
`);
fs.writeFileSync(path.join(root, 'lib', 'auth.js'), 'export function verifyToken(){return null;}\nexport async function sessionFromReq(){return null;}\nexport async function isSessionValid(){return true;}\nexport async function sessionOk(){return true;}\n');
fs.writeFileSync(path.join(root, 'lib', 'crypto.js'), 'export const encrypt=x=>x; export const decrypt=x=>x;\n');

// A booking at her SECOND Square location (L2) must block the same time on her booking link: she is
// one person. Before, busyRanges asked Square for location L1 only, so 10:00 stayed open.
const SQ_BOOKING = { id: 'b2', status: 'ACCEPTED', start_at: '2026-10-20T17:00:00Z', location_id: 'L2', appointment_segments: [{ duration_minutes: 60 }] };
const asked = [];
globalThis.fetch = async (url) => {
  const u = String(url); const J = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
  if (u.includes('/v2/locations')) return J({ locations: [{ id: 'L1', status: 'ACTIVE', timezone: 'America/Los_Angeles' }, { id: 'L2', status: 'ACTIVE', timezone: 'America/Los_Angeles' }] });
  if (u.includes('/v2/bookings?')) { const q = new URL(u).searchParams; asked.push(q.get('location_id') || 'ALL');
    const loc = q.get('location_id'); return J({ bookings: (!loc || loc === SQ_BOOKING.location_id) ? [SQ_BOOKING] : [] }); }
  return J({});
};
const B = await import(path.join(root, 'lib', 'booking.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const r = await B.busyRanges('p1', '2026-10-20', 60, 0);
ok(Array.isArray(r), 'her calendar was readable');
const ten = 10 * 60;
ok(Array.isArray(r) && r.some(x => x.start <= ten && x.end > ten), 'a booking at her second location makes 10:00 busy ' + JSON.stringify(r) + ' asked=' + asked.join());
fs.rmSync(root, { recursive: true, force: true });
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
