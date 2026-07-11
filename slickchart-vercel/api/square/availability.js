// POST /api/square/availability  { serviceVariationId, teamMemberId?, date 'YYYY-MM-DD' }
// Returns the REAL open time slots for a service on a given day, from Square's SearchAvailability.
// Square computes these against the seller's booking availability, the service's duration, its
// buffer-before/buffer-after settings, AND existing bookings — so surfacing only these slots is
// what prevents double-booking and honors the time each service needs to block.
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const b = req.body || {};
  const svid = String(b.serviceVariationId || '').trim();
  const date = String(b.date || '').trim();
  const teamMemberId = String(b.teamMemberId || '').trim();
  if (!svid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: 'Missing service or date.' }); return; }

  try {
    const locationId = await resolveLocationId(ctx.token, ctx.locationId);
    if (!locationId) { res.status(400).json({ error: 'No Square location found for this account.' }); return; }

    // Day window. Square requires start_at >= now and the range <= 32 days, so clamp the lower
    // bound to "now" for today and skip a fully-past day.
    const now = new Date();
    const dayStart = new Date(date + 'T00:00:00');
    const dayEnd = new Date(date + 'T23:59:59');
    const startAt = (dayStart > now ? dayStart : now);
    if (startAt >= dayEnd) { res.status(200).json({ slots: [] }); return; }

    const seg = { service_variation_id: svid };
    if (teamMemberId) seg.team_member_id_filter = { any: [teamMemberId] };
    const body = { query: { filter: {
      start_at_range: { start_at: startAt.toISOString(), end_at: dayEnd.toISOString() },
      location_id: locationId,
      segment_filters: [seg]
    } } };

    const d = await sf('/v2/bookings/availability/search', { method: 'POST', body });
    const seen = {};
    const slots = (d.availabilities || [])
      .map(a => { const s = (a.appointment_segments || [])[0] || {}; return { startAt: a.start_at, teamMemberId: s.team_member_id || teamMemberId || '' }; })
      .filter(s => s.startAt)
      .sort((x, y) => x.startAt.localeCompare(y.startAt))
      .filter(s => (seen[s.startAt] ? false : (seen[s.startAt] = true)));

    res.status(200).json({ slots });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null, code: e.status === 403 ? 'reconnect' : undefined });
  }
}
