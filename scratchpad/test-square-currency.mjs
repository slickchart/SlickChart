// Money sent to Square is in HER location's currency (2026-11-19 sweep). A hard-coded 'USD' made
// Square refuse every charge, payment link and invoice for a seller outside the US.
// Copies the three endpoints next to a stubbed lib/ that holds the REAL resolveLocationCurrency.
import fs from 'fs'; import path from 'path'; import os from 'os';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cur-'));
fs.mkdirSync(path.join(dir, 'api/square'), { recursive: true }); fs.mkdirSync(path.join(dir, 'lib'));
for (const f of ['invoice', 'charge-card', 'payment-link']) fs.copyFileSync(path.join(ROOT, 'api/square/' + f + '.js'), path.join(dir, 'api/square/' + f + '.js'));
const sq = fs.readFileSync(path.join(ROOT, 'lib/square.js'), 'utf8');
const a = sq.indexOf('const _ZERO_DECIMAL'); const real = a < 0 ? 'export async function resolveLocationCurrency() { return "USD"; }' : sq.slice(a, sq.indexOf('\n}\n', sq.indexOf('export async function resolveLocationCurrency')) + 3);
fs.writeFileSync(path.join(dir, 'lib/square.js'), `
export const calls = []; export const S = { cur: 'USD' };
export async function sqContext() { return { token: 'T', locationId: 'L1' }; }
export async function resolveLocationId() { return 'L1'; }
export async function resolveLocationTz() { return null; }
export function zonedDateKey(t) { return new Date(t).toISOString().slice(0, 10); }
export async function squareFetch(p, o) { calls.push({ p, body: o && o.body });
  if (p === '/v2/locations') return { locations: [{ id: 'L0', status: 'ACTIVE', currency: 'USD' }, { id: 'L1', status: 'ACTIVE', currency: S.cur }] };
  if (p.startsWith('/v2/catalog')) return { objects: [] };
  if (p === '/v2/orders') return { order: { id: 'O1', total_money: { amount: 5000 } } };
  if (p === '/v2/invoices') return { invoice: { id: 'I1', version: 0 } };
  if (p === '/v2/payments') return { payment: { id: 'P1', status: 'COMPLETED' } };
  if (p.includes('payment-links')) return { payment_link: { url: 'u' } };
  return { invoice: { public_url: 'u' } }; }
${real}`);
fs.writeFileSync(path.join(dir, 'lib/db.js'), 'export async function logSquareCreate() {}');
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
const lib = await import(path.join(dir, 'lib/square.js'));
const ep = {}; for (const f of ['invoice', 'charge-card', 'payment-link']) ep[f] = (await import(path.join(dir, 'api/square/' + f + '.js'))).default;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const run = async (f, body) => { lib.calls.length = 0; const res = { status() { return this; }, json() {}, setHeader() {} }; await ep[f]({ method: 'POST', body, query: {} }, res); return lib.calls; };
const curOf = calls => { const out = []; JSON.stringify(calls.map(c => c.body), (k, v) => { if (v && typeof v === 'object' && 'currency' in v && 'amount' in v) out.push(v.currency + ':' + v.amount); return v; }); return out; };
for (const cur of ['CAD', 'GBP', 'AUD', 'USD']) {
  lib.S.cur = cur;
  ok(curOf(await run('payment-link', { amount: 85, name: 'Facial' })).join() === cur + ':8500', cur + ': payment link in ' + cur);
  ok(curOf(await run('charge-card', { amount: 85, cardId: 'card1', customerId: 'C1' })).join() === cur + ':8500', cur + ': saved-card charge in ' + cur);
  const inv = curOf(await run('invoice', { email: 'a@b.co', customerId: 'C1', lineItems: [{ name: 'Facial', price: 85, quantity: 1 }, { name: 'Serum', price: 40, quantity: 1 }] }));
  ok(inv.length === 2 && inv.every(x => x.startsWith(cur + ':')), cur + ': invoice lines in ' + cur + ' ' + inv.join());
  const inv2 = curOf(await run('invoice', { email: 'a@b.co', customerId: 'C1', amount: 60, title: 'Peel' }));
  ok(inv2.join() === cur + ':6000', cur + ': one-line invoice in ' + cur + ' ' + inv2.join());
}
lib.S.cur = 'JPY';
ok(curOf(await run('payment-link', { amount: 85, name: 'Facial' })).join() === 'USD:8500', 'JPY (no hundredths): stays USD so Square refuses it, never 100x the price');
lib.S.cur = undefined;
ok(curOf(await run('charge-card', { amount: 85, cardId: 'card1' })).join() === 'USD:8500', 'location with no currency: USD as before');
const src = fs.readFileSync(path.join(ROOT, 'lib/booking.js'), 'utf8');
ok(/currency = await resolveLocationCurrency\(conn\.token, (conn\.locationId|locId)\)/.test(src) && !/currency: 'USD'/.test(src), 'booking deposit link uses her currency');
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
