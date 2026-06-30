// GET /api/square/appointments?days=14
// Lists UPCOMING bookings from Square Appointments for the next N days (default
// 14, max 31) and resolves each booking's customer name. Returns a clean array.
//
// Requires: the seller uses Square Appointments, and your token/app has the
// "Appointments (read)" permission. If you don't use Square Appointments, this
// endpoint will return a Square permission error — the customers import still works.
import { squareFetch, requireAuth, resolveLocationId } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!requireAuth(req, res)) return;

  try {
    const locationId = await resolveLocationId();
    if (!locationId) { res.status(400).json({ error: 'No Square location found for this account.' }); return; }

    const now = new Date();
    const days = Math.min(Math.max(parseInt(req.query.days || '14', 10) || 14, 1), 31);
    const end = new Date(now.getTime() + days * 86400000);

    const qs = new URLSearchParams({
      location_id: locationId,
      start_at_min: now.toISOString(),
      start_at_max: end.toISOString(),
      limit: '100'
    });

    const data = await squareFetch('/v2/bookings?' + qs.toString());
    const bookings = (data.bookings || []).filter(isLive);

    // Resolve customer names (one lookup per unique customer, in parallel).
    const ids = [...new Set(bookings.map(b => b.customer_id).filter(Boolean))];
    const names = {};
    await Promise.all(ids.map(async (id) => {
      try {
        const cd = await squareFetch('/v2/customers/' + id);
        if (cd.customer) {
          names[id] = [cd.customer.given_name, cd.customer.family_name].filter(Boolean).join(' ').trim()
            || cd.customer.email_address || 'Client';
        }
      } catch { /* ignore a single failed lookup */ }
    }));

    const appointments = bookings
      .map((b) => {
        const seg = (b.appointment_segments || [])[0] || {};
        return {
          id: b.id,
          startAt: b.start_at || '',
          status: b.status || '',
          customerId: b.customer_id || '',
          customerName: names[b.customer_id] || 'Client',
          durationMinutes: seg.duration_minutes || null,
          serviceVariationId: seg.service_variation_id || '',
          teamMemberId: seg.team_member_id || ''
        };
      })
      .sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));

    res.status(200).json({ locationId, count: appointments.length, appointments });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null });
  }
}

function isLive(b) {
  const dead = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SELLER', 'DECLINED', 'NO_SHOW'];
  return !dead.includes(b.status);
}
