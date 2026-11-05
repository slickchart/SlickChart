export const calls = [];
export const cfg = { bulkFails: false, limitSingles: 0 };
let inflight = 0;
const people = { C1: { given_name: 'Ann', family_name: 'One' }, C2: { given_name: 'Bea', family_name: 'Two', email_address: 'b@x.test' }, C3: { given_name: 'Cat', family_name: 'Three' } };
export async function squareFetch(path, opts = {}) {
  calls.push((opts.method || 'GET') + ' ' + path);
  if (path.startsWith('/v2/locations')) return { locations: [{ id: 'L1' }] };
  if (path.startsWith('/v2/bookings')) return { bookings: ['C1', 'C2', 'C3'].map((c, i) => ({ id: 'b' + i, customer_id: c, status: 'ACCEPTED', start_at: new Date(Date.now() + 86400000 * (i + 1)).toISOString(), created_at: '2026-11-01T00:00:00Z', appointment_segments: [{}] })) };
  if (path === '/v2/customers/bulk-retrieve') { if (cfg.bulkFails) { const e = new Error('nope'); e.status = 429; throw e; } const r = {}; opts.body.customer_ids.forEach(id => { if (id !== 'C3') r[id] = { customer: people[id] }; else r[id] = { errors: [{ code: 'RATE_LIMITED' }] }; }); return { responses: r }; }
  const m = path.match(/^\/v2\/customers\/(\w+)$/);
  if (m) { if (cfg.flaky && !cfg.flaky[m[1]]) { cfg.flaky[m[1]] = 1; const e = new Error('rl'); e.status = 429; throw e; } return { customer: people[m[1]] }; }
  return {};
}
export async function sqContext() { return { token: 'T' }; }
export async function listBookableServices() { return []; }
