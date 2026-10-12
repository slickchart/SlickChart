// GET /api/square/booking-options
// Returns the building blocks needed to CREATE a booking in Square:
//   - services:    bookable service variations (id + version + duration + price)
//   - teamMembers: bookable team members (id + name)
//
// Requires: Square Appointments enabled, services marked bookable, and the token
// to have "Items (read)" + "Appointments (read)" permissions. If Appointments
// isn't set up, `services`/`teamMembers` come back empty and the app falls back
// to its own local booking instead of erroring.
import { squareFetch as _sqf, sqContext, resolveLocationId, listBookableServices } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    const locationId = await resolveLocationId(ctx.token, ctx.locationId);

    // ── 1) Bookable services ──
    // Shared with lib/booking.js, which needs the same list to ask Square what is free. One
    // implementation: two catalog walks would drift, and the copy clients depend on would be the
    // one nobody notices has gone wrong.
    const services = await listBookableServices(ctx.token);

    // ── 2) Bookable team members ──
    let teamMembers = [];
    try {
      const qs = new URLSearchParams({ bookable_only: 'true' });
      if (locationId) qs.set('location_id', locationId);
      const tm = await sf('/v2/bookings/team-member-booking-profiles?' + qs.toString());
      teamMembers = (tm.team_member_booking_profiles || [])
        .filter(p => p.team_member_id)
        .map(p => ({ id: p.team_member_id, name: p.display_name || 'Team member' }));
    } catch (e) { /* Appointments not enabled — leave empty, app falls back */ }

    res.status(200).json({ locationId, count: services.length, services, teamMembers });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null });
  }
}
