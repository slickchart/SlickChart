// GET /api/square/diag  → self-diagnostic for the logged-in provider.
// Shows which Square location the app is using, all locations on the account,
// and how many bookings/invoices Square returns — so we can see WHY a list is empty.
// Aggregate/technical info only; no client PII beyond counts.
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';

export default async function handler(req, res) {
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const out = { usingLocationId: null, storedLocationId: ctx.locationId || null, locations: [], bookings: {}, invoices: {} };
  try {
    // all locations on the account
    try {
      const loc = await sf('/v2/locations');
      out.locations = (loc.locations || []).map(l => ({ id: l.id, name: l.name, status: l.status }));
    } catch (e) { out.locationsError = e.message; }

    const locationId = await resolveLocationId(ctx.token, ctx.locationId);
    out.usingLocationId = locationId;

    // bookings: next 14 and next 60 days (any location match), to see if it's a window issue
    for (const days of [14, 30]) {
      try {
        const now = new Date(); const end = new Date(now.getTime() + days * 86400000);
        const qs = new URLSearchParams({ location_id: locationId, start_at_min: now.toISOString(), start_at_max: end.toISOString(), limit: '100' });
        const d = await sf('/v2/bookings?' + qs.toString());
        out.bookings['next' + days] = { count: (d.bookings || []).length, statuses: (d.bookings || []).map(b => b.status) };
      } catch (e) { out.bookings['next' + days] = { error: e.message }; }
    }
    // bookings across ALL locations (no location filter) — reveals a location mismatch
    try {
      const now = new Date(); const end = new Date(now.getTime() + 30 * 86400000);
      const qs = new URLSearchParams({ start_at_min: now.toISOString(), start_at_max: end.toISOString(), limit: '100' });
      const d = await sf('/v2/bookings?' + qs.toString());
      out.bookings.anyLocation = { count: (d.bookings || []).length, locationIds: [...new Set((d.bookings || []).map(b => b.location_id))] };
    } catch (e) { out.bookings.anyLocation = { error: e.message }; }

    // Per-location booking counts (14-day window each) — reveals exactly where bookings live.
    out.bookings.perLocation = {};
    try {
      const now2 = new Date(); const end2 = new Date(now2.getTime() + 14 * 86400000);
      for (const l of out.locations) {
        try {
          const qs = new URLSearchParams({ location_id: l.id, start_at_min: now2.toISOString(), start_at_max: end2.toISOString(), limit: '100' });
          const d = await sf('/v2/bookings?' + qs.toString());
          out.bookings.perLocation[(l.name || l.id)] = (d.bookings || []).length;
        } catch (e) { out.bookings.perLocation[(l.name || l.id)] = 'err:' + e.message.slice(0, 40); }
      }
    } catch (e) {}

    // invoices at the resolved location
    try {
      const d = await sf('/v2/invoices/search', { method: 'POST', body: { query: { filter: { location_ids: [locationId] } }, limit: 100 } });
      out.invoices.atLocation = { count: (d.invoices || []).length, statuses: (d.invoices || []).slice(0, 10).map(i => i.status) };
    } catch (e) { out.invoices.atLocation = { error: e.message }; }

    res.status(200).json(out);
  } catch (e) { res.status(e.status || 500).json({ error: e.message, out }); }
}
