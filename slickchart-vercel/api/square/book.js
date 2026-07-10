// POST /api/square/book
// Creates a REAL booking in Square Appointments.
//
// Body: {
//   serviceVariationId, serviceVariationVersion?, durationMinutes, startAt,  // required booking bits
//   teamMemberId,                                                            // who performs it
//   customerId?  | (customerName? + customerEmail?)                          // who it's for
// }
// startAt must be RFC3339 (e.g. "2026-07-15T17:00:00Z"). The app builds this
// from the chosen date + time before calling.
//
// Requires the token to have "Appointments (write)" + "Customers (write/read)".
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const serviceVariationId = body.serviceVariationId;
    const teamMemberId = body.teamMemberId;
    const startAt = body.startAt;
    if (!serviceVariationId || !teamMemberId || !startAt) {
      res.status(400).json({ error: 'serviceVariationId, teamMemberId and startAt are all required.' });
      return;
    }

    const locationId = await resolveLocationId(ctx.token, ctx.locationId);
    if (!locationId) { res.status(400).json({ error: 'No Square location found for this account.' }); return; }

    // ── Resolve the customer: use the given id, else find by email, else create ──
    let customerId = (body.customerId || '').trim();
    if (!customerId) {
      const name = (body.customerName || '').trim();
      const email = (body.customerEmail || '').trim();
      if (email) {
        try {
          const found = await sf('/v2/customers/search', {
            method: 'POST',
            body: { limit: 1, query: { filter: { email_address: { exact: email } } } }
          });
          if (found.customers && found.customers[0]) customerId = found.customers[0].id;
        } catch (e) { /* fall through to create */ }
      }
      if (!customerId) {
        const parts = name.split(/\s+/).filter(Boolean);
        const created = await sf('/v2/customers', {
          method: 'POST',
          body: {
            given_name: parts[0] || name || 'Client',
            family_name: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
            email_address: email || undefined
          }
        });
        customerId = created.customer && created.customer.id;
      }
    }
    if (!customerId) { res.status(400).json({ error: 'Could not find or create a customer for this booking.' }); return; }

    // ── Build the appointment segment + create the booking ──
    const segment = {
      team_member_id: teamMemberId,
      service_variation_id: serviceVariationId,
      duration_minutes: Math.max(parseInt(body.durationMinutes, 10) || 60, 1)
    };
    if (body.serviceVariationVersion != null) segment.service_variation_version = body.serviceVariationVersion;

    // Prefer the client's stable key so a retried booking (lost response, tap-after-error) resolves
    // to the SAME appointment instead of creating a duplicate. Fall back to a generated one.
    const clientKey = String(body.idempotencyKey || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 45);
    const bookKey = clientKey || ('sc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
    const result = await sf('/v2/bookings', {
      method: 'POST',
      body: {
        idempotency_key: bookKey,
        booking: {
          location_id: locationId,
          customer_id: customerId,
          start_at: startAt,
          appointment_segments: [segment]
        }
      }
    });

    const b = result.booking || {};
    res.status(200).json({ ok: true, booking: { id: b.id, startAt: b.start_at || startAt, status: b.status || 'PENDING', customerId } });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null });
  }
}
