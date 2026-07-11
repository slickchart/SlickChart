// POST /api/square/reschedule-booking  { bookingId, startAt, version? }
// Moves an existing Square Appointments booking to a new start time.
// Square: PUT /v2/bookings/{booking_id} with { booking: { version, start_at, appointment_segments } }.
// startAt must be RFC3339 (e.g. "2026-07-15T17:00:00Z").
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const b = req.body || {};
  const bookingId = String(b.bookingId || '').trim();
  const startAt = String(b.startAt || '').trim();
  if (!bookingId || !startAt) { res.status(400).json({ error: 'Missing bookingId or startAt' }); return; }

  try {
    // Read the current booking to get its live version and segments (a reschedule keeps the same
    // service/team member, only the time changes). This also avoids a version-conflict rejection.
    let version = (b.version != null && b.version !== '') ? b.version : null;
    let segments = [];
    try {
      const cur = await sf('/v2/bookings/' + encodeURIComponent(bookingId));
      const bk = cur.booking || {};
      if (version == null) version = bk.version;
      segments = (bk.appointment_segments || []).map(s => {
        const seg = { duration_minutes: s.duration_minutes, team_member_id: s.team_member_id, service_variation_id: s.service_variation_id };
        if (s.service_variation_version != null) seg.service_variation_version = s.service_variation_version;
        return seg;
      });
    } catch (e) { /* if the read fails we still try the update with just start_at + version below */ }

    const booking = { start_at: startAt };
    if (version != null) booking.version = version;
    if (segments.length) booking.appointment_segments = segments;
    const r = await sf('/v2/bookings/' + encodeURIComponent(bookingId), { method: 'PUT', body: { booking } });
    res.status(200).json({ ok: true, startAt: (r.booking && r.booking.start_at) || startAt, status: (r.booking && r.booking.status) || '' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null, code: e.status === 403 ? 'reconnect' : undefined });
  }
}
