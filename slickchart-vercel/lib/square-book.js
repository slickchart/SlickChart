// Creating a booking in a provider's OWN Square, in one place.
//
// Two callers, one implementation:
//   - api/square/book.js: the provider's app (Book in Square sheet, confirming a booking request).
//     The token comes from sqContext, i.e. the signed-in provider's own connection.
//   - lib/booking.js squareBookInstant: a booking her public link confirmed INSTANTLY. The token comes
//     from getConnection(providerId) where providerId is the owner of the slug that was booked, never
//     from anything in the request body (CLAUDE.md §0.1/§0.2).
// A second copy of the customer find-or-create would drift, and the drifted copy is the one that
// mints duplicate Square customers that then sync back into SlickChart as extra charts.
import { squareFetch } from './square.js';

// Square's idempotency key for CreateCustomer is capped at 45 characters; CreateBooking allows more,
// and the booking key is kept at 45 here as it always was. Callers pass the booking key; the customer
// key is derived from it so a retry finds the customer the first try made.
export function safeKey(k, max) { return String(k || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, max); }

// The customer the booking is for: the given id, else her Square customer with that email, else the
// one with that phone, else a new one. Throws only if Square itself errors on the create.
export async function resolveSquareCustomer(token, { customerId, name, email, phone, idempotencyKey }, log) {
  const sf = (p, o) => squareFetch(p, o, token);
  let id = String(customerId || '').trim();
  if (id) return id;
  name = String(name || '').trim();
  email = String(email || '').trim();
  if (email) {
    try {
      const found = await sf('/v2/customers/search', {
        method: 'POST',
        body: { limit: 1, query: { filter: { email_address: { exact: email } } } }
      });
      if (found.customers && found.customers[0]) id = found.customers[0].id;
    } catch (e) { /* fall through to create */ }
  }
  // A client she has in Square by PHONE only used to get a brand-new Square customer on every
  // booking (which then synced back into SlickChart as another chart).
  const ph = String(phone || '').replace(/[^0-9+]/g, '');
  if (!id && ph.replace(/\D/g, '').length >= 7) {
    try {
      const e164 = ph.startsWith('+') ? ph : ('+1' + ph.replace(/\D/g, '').slice(-10));
      const found = await sf('/v2/customers/search', {
        method: 'POST',
        body: { limit: 1, query: { filter: { phone_number: { exact: e164 } } } }
      });
      if (found.customers && found.customers[0]) id = found.customers[0].id;
    } catch (e) { /* fall through to create */ }
  }
  if (!id) {
    const parts = name.split(/\s+/).filter(Boolean);
    const ck = safeKey(idempotencyKey, 43);
    const created = await sf('/v2/customers', {
      method: 'POST',
      body: {
        idempotency_key: ck ? (ck + '-c') : undefined,
        given_name: parts[0] || name || 'Client',
        family_name: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
        email_address: email || undefined
      }
    });
    id = created.customer && created.customer.id;
    if (id && log) { try { await log(); } catch (e) {} }
  }
  return id || '';
}

// POST /v2/bookings. Returns Square's booking object. A stable idempotencyKey makes a retry (a lost
// response, a second device, the app re-trying what the server already did) resolve to the SAME
// appointment instead of a second one.
export async function createSquareBooking(token, { locationId, customerId, startAt, teamMemberId,
  serviceVariationId, serviceVariationVersion, durationMinutes, idempotencyKey }) {
  const segment = {
    team_member_id: teamMemberId,
    service_variation_id: serviceVariationId,
    duration_minutes: Math.max(parseInt(durationMinutes, 10) || 60, 1)
  };
  if (serviceVariationVersion != null) segment.service_variation_version = serviceVariationVersion;
  const key = safeKey(idempotencyKey, 45) || ('sc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
  const result = await squareFetch('/v2/bookings', {
    method: 'POST',
    body: {
      idempotency_key: key,
      booking: { location_id: locationId, customer_id: customerId, start_at: startAt, appointment_segments: [segment] }
    }
  }, token);
  return result.booking || {};
}

// The idempotency key for a booking REQUEST / link booking, from its event id. The app has always
// sent 'req-' + the event id cut to 45 characters. Event ids from a client's app or the booking link
// are 'ev_idem_<provider>_<client>_<key>', so the first 45 characters are the same for EVERY booking
// one client ever makes: her second booking from the same person collided with the first one's key
// and Square refused it. The tail is the part that differs, so keep that. The app computes the
// same thing (_reqIdemKey in slickchart.html) so the server and a device retrying land on one key.
export function requestIdemKey(eventId) {
  return 'req-' + safeKey(eventId, 1000).slice(-41);
}
