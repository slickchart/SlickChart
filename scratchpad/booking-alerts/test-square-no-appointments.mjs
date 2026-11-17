// Kristen, 2026-11-17: her booking link never showed open times. The health sweep said why: her
// Square is payments only, and Square answers the bookings list with "Merchant not onboarded to
// Appointments". That is "no Square bookings", not "calendar unreadable". Any OTHER Square failure
// must still hide the times (never publish a half-informed slot list).
// Run: node scratchpad/booking-alerts/test-square-no-appointments.mjs
import { register } from 'node:module';
register('../founder-push/hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
Object.assign(process.env, { DATABASE_URL: 'postgres://x', SESSION_SECRET: 's3cret' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const { encrypt } = await import(APP + 'lib/crypto.js');
const open = { open: true, start: '09:00', end: '17:00' };
const hours = JSON.stringify({ sun: open, mon: open, tue: open, wed: open, thu: open, fri: open, sat: open });
const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
globalThis.__sqlHandler = (t, v) => {
  if (/SELECT v FROM kv WHERE owner/.test(t)) {
    if (v[1] === 'sc_availability') return [{ v: hours }];
    if (v[1] === 'sc_manual_appts') return [{ v: JSON.stringify([{ id: 'm1', date: day, time: '10:00 AM', dur: 60 }]) }];
    return [];
  }
  if (/SELECT \* FROM square_connections WHERE provider_id/.test(t)) return [{ provider_id: v[0], access_token: encrypt('tok'), location_id: 'L1' }];
  return [];
};
let bookingsError = 'Merchant not onboarded to Appointments';
globalThis.fetch = async (url) => {
  const u = String(url);
  const J = (code, x) => ({ ok: code < 300, status: code, json: async () => x, text: async () => JSON.stringify(x) });
  if (/\/v2\/locations/.test(u)) return J(200, { locations: [{ id: 'L1', status: 'ACTIVE', timezone: 'America/New_York' }], location: { id: 'L1', timezone: 'America/New_York' } });
  if (/\/v2\/bookings\?/.test(u)) return J(bookingsError.includes('onboarded') ? 400 : 500, { errors: [{ code: 'BAD_REQUEST', detail: bookingsError }] });
  if (/\/v2\/catalog/.test(u)) return J(400, { errors: [{ detail: bookingsError }] });
  return J(404, { errors: [{ detail: 'not stubbed' }] });
};
const { openSlots, getBookingConfig, busyRanges } = await import(APP + 'lib/booking.js');
const cfg = Object.assign(await getBookingConfig('prov_k'), { on: true, mode: 'instant', leadHours: 0, slotMins: 60 });
let s = await openSlots('prov_k', day, cfg, null, 'Glow Starter Consult');
ok(Array.isArray(s) && s.length > 0, 'Square for payments only: her open times show (' + JSON.stringify(s) + ')');
ok(Array.isArray(s) && s.indexOf('10:00 AM') < 0 && s.indexOf('9:00 AM') >= 0, 'and her own SlickChart appointment at 10 is still taken out');
bookingsError = 'Internal error';
s = await openSlots('prov_k', day, cfg, null, 'Glow Starter Consult');
ok(s === null && /square bookings: Internal error/.test(busyRanges.why), 'any other Square failure still hides the times (' + busyRanges.why + ')');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
