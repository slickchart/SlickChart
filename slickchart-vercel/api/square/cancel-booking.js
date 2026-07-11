// POST /api/square/cancel-booking  { bookingId, version? }
// Cancels a Square Appointments booking on the provider's connected account.
// Square: POST /v2/bookings/{booking_id}/cancel with the current booking_version.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const b = req.body || {};
  const bookingId = String(b.bookingId || '').trim();
  if (!bookingId) { res.status(400).json({ error: 'Missing bookingId' }); return; }

  try {
    // Square needs the current version to cancel. Use the one passed in; if absent (or stale),
    // fetch the booking to read its live version so a cancel isn't rejected as a version conflict.
    let version = (b.version != null && b.version !== '') ? b.version : null;
    if (version == null) {
      try { const cur = await sf('/v2/bookings/' + encodeURIComponent(bookingId)); version = cur.booking && cur.booking.version; } catch (e) {}
    }
    const body = { idempotency_key: 'sc-cancel-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) };
    if (version != null) body.booking_version = version;
    const r = await sf('/v2/bookings/' + encodeURIComponent(bookingId) + '/cancel', { method: 'POST', body });
    res.status(200).json({ ok: true, status: (r.booking && r.booking.status) || 'CANCELLED_BY_SELLER' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null, code: e.status === 403 ? 'reconnect' : undefined });
  }
}
