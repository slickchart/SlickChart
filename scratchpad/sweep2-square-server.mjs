// SWEEP 2 / Square server endpoints, run as SHIPPED with db/auth/crypto/email stubbed and a fake Square.
//
//   node scratchpad/sweep2-square-server.mjs
//
// A) /api/square/appointments ignores Square's `cursor`: a 30-day window with more than 100
//    bookings returns only the first page, so later bookings never reach the app.
// B) /api/square/book with no email (phone-only client) CREATES a new Square customer on every
//    booking, even for a client she already has in Square. The app never passes customerId.
// C) /api/square/book retried with the same idempotency key creates a second Square customer
//    (the customer create carries no idempotency key).
// D) /api/square/invoices ignores `cursor` (first 100 only).
// E) sqContext never checks isSessionValid: a revoked (signed-out) session token still drives her Square.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V = '/home/user/SlickChart/slickchart-vercel';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sw2sq-'));
fs.mkdirSync(path.join(root, 'lib')); fs.mkdirSync(path.join(root, 'api', 'square'), { recursive: true });
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
fs.copyFileSync(path.join(V, 'lib', 'square.js'), path.join(root, 'lib', 'square.js'));
for (const f of ['appointments.js', 'book.js', 'invoices.js']) fs.copyFileSync(path.join(V, 'api', 'square', f), path.join(root, 'api', 'square', f));
fs.writeFileSync(path.join(root, 'lib', 'db.js'), `
export function dbEnabled(){ return true; }
export async function ensureProvidersTable(){} export async function ensureSquareCreateLog(){} export async function logSquareCreate(){}
export function sql(){ return (s, ...v) => { const t = s.join('?');
  if (/FROM square_connections WHERE provider_id/.test(t)) return Promise.resolve([{ provider_id:'p1', access_token:'SQTOK', refresh_token:'R', expires_at: new Date(Date.now()+90*864e5).toISOString(), merchant_id:'M1', location_id:'L1' }]);
  const p = Promise.resolve([]); return p; }; }
`);
fs.writeFileSync(path.join(root, 'lib', 'auth.js'), "export function verifyToken(t){ return t==='GOOD' ? {u:'p1'} : (t==='SIGNEDOUT' ? {u:'p1', sid:'s_revoked'} : null); }\nexport async function isSessionValid(q, sid){ return sid !== 's_revoked'; }\n");
fs.writeFileSync(path.join(root, 'lib', 'crypto.js'), 'export const encrypt=x=>x; export const decrypt=x=>x;\n');
fs.writeFileSync(path.join(root, 'lib', 'email.js'), 'export async function sendEmail(){ return true; }\n');
process.env.SESSION_SECRET = 'x';

// ── fake Square ──
const BOOKINGS = []; const base = Date.now() + 2 * 864e5;
for (let i = 0; i < 130; i++) BOOKINGS.push({ id: 'bk' + i, status: 'ACCEPTED', location_id: 'L1', customer_id: 'C1', start_at: new Date(base + i * 4 * 3600e3).toISOString(), appointment_segments: [{ duration_minutes: 60, service_variation_id: 'V1' }] });
const INVOICES = []; for (let i = 0; i < 140; i++) INVOICES.push({ id: 'inv' + i, status: 'PAID', location_id: 'L1', payment_requests: [], primary_recipient: {} });
const customers = [{ id: 'C1', given_name: 'Pat', family_name: 'Lee', phone_number: '+15555550100' }];
let customerCreates = 0; const bookingKeys = {};
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); const m = (opts.method || 'GET').toUpperCase(); const body = opts.body ? JSON.parse(opts.body) : {};
  const R = (o, st = 200) => ({ ok: st < 400, status: st, text: async () => JSON.stringify(o), json: async () => o });
  const page = (arr, cursor, lim) => { const s = cursor ? parseInt(cursor, 10) : 0; const e = s + lim; return { items: arr.slice(s, e), cursor: e < arr.length ? String(e) : undefined }; };
  if (u.pathname === '/v2/locations') return R({ locations: [{ id: 'L1', status: 'ACTIVE', timezone: 'America/Los_Angeles' }] });
  if (u.pathname === '/v2/bookings' && m === 'GET') {
    const mn = Date.parse(u.searchParams.get('start_at_min')), mx = Date.parse(u.searchParams.get('start_at_max'));
    const lim = Math.min(parseInt(u.searchParams.get('limit') || '100', 10), 100);
    const inWin = BOOKINGS.filter(b => { const t = Date.parse(b.start_at); return t >= mn && t < mx; });
    const pg = page(inWin, u.searchParams.get('cursor'), lim); return R({ bookings: pg.items, cursor: pg.cursor });
  }
  if (u.pathname === '/v2/bookings' && m === 'POST') {
    const k = body.idempotency_key;
    if (bookingKeys[k] && bookingKeys[k].customer !== body.booking.customer_id) return R({ errors: [{ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Idempotency key reused with a different request' }] }, 400);
    if (!bookingKeys[k]) bookingKeys[k] = { customer: body.booking.customer_id, id: 'nb' + Object.keys(bookingKeys).length };
    return R({ booking: { id: bookingKeys[k].id, start_at: body.booking.start_at, status: 'ACCEPTED' } });
  }
  if (u.pathname.startsWith('/v2/customers/search')) {
    const em = body.query && body.query.filter && body.query.filter.email_address && body.query.filter.email_address.exact;
    return R({ customers: customers.filter(c => em && c.email_address === em) });
  }
  if (u.pathname.startsWith('/v2/customers/') && m === 'GET') { const c = customers.find(x => x.id === u.pathname.split('/').pop()); return R({ customer: c }); }
  if (u.pathname === '/v2/customers' && m === 'POST') { customerCreates++; const c = { id: 'CN' + customerCreates, ...body }; customers.push(c); return R({ customer: c }); }
  if (u.pathname === '/v2/catalog/list') return R({ objects: [] });
  if (u.pathname === '/v2/invoices/search') { const pg = page(INVOICES, body.cursor, Math.min(body.limit || 100, 200)); return R({ invoices: pg.items, cursor: pg.cursor }); }
  if (u.pathname === '/v2/orders/batch-retrieve') return R({ orders: [] });
  return R({});
};
const call = async (file, { method = 'GET', query = {}, body, tok = 'GOOD' } = {}) => {
  const h = (await import(path.join(root, 'api', 'square', file))).default;
  let out = null, status = 0;
  const res = { status(s) { status = s; return this; }, json(o) { out = o; return this; }, setHeader() {} };
  await h({ method, query, body, headers: { authorization: 'Bearer ' + tok } }, res);
  return { status, out };
};
const results = []; const check = (n, ok, d) => results.push({ n, ok, d });

// A
const a = await call('appointments.js', { query: { days: '30' } });
const inWindow = BOOKINGS.filter(b => Date.parse(b.start_at) < Date.now() - 864e5 + 30 * 864e5).length;
check('A appointments: every booking in the window is returned', a.out && a.out.count === inWindow, `returned ${a.out && a.out.count} of ${inWindow} Square bookings in the next 30 days`);

// B
customerCreates = 0;
for (let i = 0; i < 2; i++) await call('book.js', { method: 'POST', body: { serviceVariationId: 'V1', teamMemberId: 'T1', startAt: new Date(base + (200 + i) * 3600e3).toISOString(), durationMinutes: 60, customerName: 'Pat Lee', customerEmail: '', idempotencyKey: 'k' + i } });
check('B book: booking an existing phone-only Square customer twice creates no new customer', customerCreates === 0, `Square customers created: ${customerCreates} (her Square already has Pat Lee as C1)`);

// C
customerCreates = 0;
const r1 = await call('book.js', { method: 'POST', body: { serviceVariationId: 'V1', teamMemberId: 'T1', startAt: new Date(base + 300 * 3600e3).toISOString(), durationMinutes: 60, customerName: 'New Person', customerEmail: '', idempotencyKey: 'retrykey' } });
const r2 = await call('book.js', { method: 'POST', body: { serviceVariationId: 'V1', teamMemberId: 'T1', startAt: new Date(base + 300 * 3600e3).toISOString(), durationMinutes: 60, customerName: 'New Person', customerEmail: '', idempotencyKey: 'retrykey' } });
check('C book: a retry with the same key makes ONE customer and answers ok', customerCreates === 1 && r2.status === 200, `customers created ${customerCreates}; retry status ${r2.status} ${JSON.stringify(r2.out).slice(0, 120)}`);

// D
const d = await call('invoices.js');
check('D invoices: all invoices returned', d.out && d.out.invoices && d.out.invoices.length === INVOICES.length, `returned ${d.out && d.out.invoices && d.out.invoices.length} of ${INVOICES.length}`);

// E
const e = await call('appointments.js', { query: { days: '14' }, tok: 'SIGNEDOUT' });
check('E a session she signed out (revoked sid) is refused by Square endpoints (sqContext)', e.status === 401, `status ${e.status}, returned ${e.out && e.out.count} bookings with customer names/emails/phones`);

let bad = 0; for (const r of results) { if (!r.ok) bad++; console.log((r.ok ? 'SOUND        ' : 'CONFIRMED-BUG') + '  ' + r.n + '  — ' + r.d); }
console.log(`\n${results.length - bad}/${results.length} sound`);
fs.rmSync(root, { recursive: true, force: true });
