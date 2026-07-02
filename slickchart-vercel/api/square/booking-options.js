// GET /api/square/booking-options
// Returns the building blocks needed to CREATE a booking in Square:
//   - services:    bookable service variations (id + version + duration + price)
//   - teamMembers: bookable team members (id + name)
//
// Requires: Square Appointments enabled, services marked bookable, and the token
// to have "Items (read)" + "Appointments (read)" permissions. If Appointments
// isn't set up, `services`/`teamMembers` come back empty and the app falls back
// to its own local booking instead of erroring.
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    const locationId = await resolveLocationId(ctx.token, ctx.locationId);

    // ── 1) Bookable services (APPOINTMENTS_SERVICE items → their variations) ──
    const objects = [];
    let cursor = '', guard = 0;
    do {
      const qs = new URLSearchParams({ types: 'ITEM' });
      if (cursor) qs.set('cursor', cursor);
      const data = await sf('/v2/catalog/list?' + qs.toString());
      (data.objects || []).forEach(o => objects.push(o));
      cursor = data.cursor || '';
      guard++;
    } while (cursor && guard < 25);

    const services = [];
    objects
      .filter(o => o.type === 'ITEM' && !o.is_deleted && o.item_data && o.item_data.product_type === 'APPOINTMENTS_SERVICE')
      .forEach(o => {
        const itemName = o.item_data.name || 'Service';
        (o.item_data.variations || []).filter(v => !v.is_deleted).forEach(v => {
          const vd = v.item_variation_data || {};
          const durMs = vd.service_duration || 0; // Square stores duration in milliseconds
          const p = vd.price_money && typeof vd.price_money.amount === 'number' ? vd.price_money.amount / 100 : null;
          const label = vd.name && vd.name.toLowerCase() !== 'regular' ? itemName + ' — ' + vd.name : itemName;
          services.push({
            variationId: v.id,
            variationVersion: (v.version != null ? v.version : null),
            name: label,
            durationMinutes: durMs ? Math.round(durMs / 60000) : 60,
            price: p,
            teamMemberIds: Array.isArray(vd.team_member_ids) ? vd.team_member_ids : []
          });
        });
      });
    services.sort((a, b) => a.name.localeCompare(b.name));

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
