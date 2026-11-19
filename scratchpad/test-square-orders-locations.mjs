// A client's Square purchases come from EVERY location on her account (2026-11-19 sweep). Before,
// only the location saved at connect time was searched, and a connection saved with no location
// returned nothing at all ('no-location'), so her chart showed no purchases and homecare never filled.
import fs from 'fs'; import path from 'path'; import os from 'os';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord-'));
fs.mkdirSync(path.join(dir, 'api/square'), { recursive: true }); fs.mkdirSync(path.join(dir, 'lib'));
fs.copyFileSync(path.join(ROOT, 'api/square/orders.js'), path.join(dir, 'api/square/orders.js'));
fs.writeFileSync(path.join(dir, 'lib/square.js'), `
export const S = { stored: 'L1', locs: [], fail: false, searched: [] };
export async function sqContext() { return { token: 'T', locationId: S.stored }; }
export async function squareFetch(p, o) {
  if (p === '/v2/locations') { if (S.fail) throw new Error('down'); return { locations: S.locs }; }
  if (p === '/v2/orders/search') { const ids = o.body.location_ids; S.searched.push(ids);
    return { orders: ids.map(id => ({ id: 'O-' + id, created_at: '2026-11-01', total_money: { amount: 4000, currency: 'USD' }, customer_id: 'C1', line_items: [{ name: 'Serum ' + id }], tenders: [] })) }; }
  return {}; }`);
fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
const lib = await import(path.join(dir, 'lib/square.js'));
const { default: h } = await import(path.join(dir, 'api/square/orders.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const run = async () => { lib.S.searched = []; let out; const res = { status() { return this; }, json(j) { out = j; }, setHeader() {} }; await h({ method: 'GET', query: { customerId: 'C1' } }, res); return out; };
lib.S.locs = [{ id: 'L1', status: 'ACTIVE' }, { id: 'L2', status: 'ACTIVE' }, { id: 'L3', status: 'INACTIVE' }];
let o = await run();
ok(JSON.stringify(lib.S.searched) === '[["L1","L2"]]', 'two active locations: both searched, the closed one not ' + JSON.stringify(lib.S.searched));
ok((o.orders || []).length === 2, 'purchases from both locations reach her chart (' + (o.orders || []).length + ')');
lib.S.stored = null; o = await run();
ok((o.orders || []).length === 2 && o.note !== 'no-location', 'connection saved with no location: purchases still show');
lib.S.stored = 'L1'; lib.S.fail = true; o = await run();
ok(JSON.stringify(lib.S.searched) === '[["L1"]]' && (o.orders || []).length === 1, 'locations lookup fails: falls back to the saved location');
lib.S.stored = null; o = await run();
ok(o.note === 'no-location' && !lib.S.searched.length, 'no location known at all: empty, no search');
lib.S.fail = false; lib.S.stored = 'L1'; lib.S.locs = Array.from({ length: 14 }, (_, i) => ({ id: 'X' + i, status: 'ACTIVE' })); o = await run();
ok(lib.S.searched[0].length === 10 && lib.S.searched[0][0] === 'L1', 'many locations: capped at Square\'s 10, the saved one first');
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
