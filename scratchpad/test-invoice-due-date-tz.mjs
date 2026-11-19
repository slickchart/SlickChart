// The invoice due date is the provider's own today (her Square location's time zone), not UTC's.
// Copies api/square/invoice.js next to a stubbed lib/ (real zonedDateKey) and runs it at an instant
// where UTC, Los Angeles and Auckland disagree on the date.
import fs from 'fs'; import path from 'path'; import os from 'os';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-'));
fs.mkdirSync(path.join(dir, 'api/square'), { recursive: true }); fs.mkdirSync(path.join(dir, 'lib'));
fs.copyFileSync(path.join(ROOT, 'api/square/invoice.js'), path.join(dir, 'api/square/invoice.js'));
const sq = fs.readFileSync(path.join(ROOT, 'lib/square.js'), 'utf8');
const zdk = sq.slice(sq.indexOf('export function zonedDateKey'), sq.indexOf('// Minutes since midnight'));
fs.writeFileSync(path.join(dir, 'lib/square.js'), `
export const calls = []; export let TZ = null; export function setTz(t) { TZ = t; }
export async function sqContext() { return { token: 'T', locationId: 'L1' }; }
export async function resolveLocationId() { return 'L1'; }
export async function resolveLocationTz() { return TZ; }
export async function resolveLocationCurrency() { return 'USD'; }
export async function squareFetch(p, o) { calls.push({ p, body: o && o.body });
  if (p.startsWith('/v2/catalog')) return { objects: [] };
  if (p === '/v2/orders') return { order: { id: 'O1', total_money: { amount: 5000 } } };
  if (p === '/v2/invoices') return { invoice: { id: 'I1', version: 0 } };
  return { invoice: { public_url: 'u' } }; }
${zdk}`);
fs.writeFileSync(path.join(dir, 'lib/db.js'), 'export async function logSquareCreate() {}');
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
const lib = await import(path.join(dir, 'lib/square.js'));
const { default: handler } = await import(path.join(dir, 'api/square/invoice.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const realNow = Date.now;
async function due(tz, body = {}) { lib.calls.length = 0; lib.setTz(tz);
  let out; const res = { status() { return this; }, json(j) { out = j; } };
  await handler({ method: 'POST', body: { email: 'a@b.co', customerId: 'C1', amount: 50, title: 'Facial', ...body } }, res);
  const c = lib.calls.find(x => x.p === '/v2/invoices'); return c ? c.body.invoice.payment_requests[0].due_date : 'NO-INVOICE ' + JSON.stringify(out); }
// 2026-11-19 20:30 UTC = Nov 20 09:30 in Auckland, Nov 19 12:30 in Los Angeles.
Date.now = () => Date.parse('2026-11-19T20:30:00Z');
ok((await due('Pacific/Auckland')) === '2026-11-20', 'Auckland morning: due today (Nov 20), not UTC yesterday');
ok((await due('America/Los_Angeles')) === '2026-11-19', 'Los Angeles: due Nov 19');
// 2026-11-20 05:30 UTC = Nov 19 21:30 in Los Angeles: UTC says tomorrow.
Date.now = () => Date.parse('2026-11-20T05:30:00Z');
ok((await due('America/Los_Angeles')) === '2026-11-19', 'Los Angeles evening: due today (Nov 19), not UTC tomorrow');
ok((await due(null)) === '2026-11-20', 'no time zone known: falls back to UTC as before');
ok((await due('America/Los_Angeles', { dueDate: '2026-12-01' })) === '2026-12-01', 'a due date the app sends is kept');
ok((await due('America/Los_Angeles', { dueDate: 'next week' })) === '2026-11-19', 'a garbage due date falls back to her today');
Date.now = realNow;
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
