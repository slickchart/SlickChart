// GET /api/square/appointments?days=14
// Lists UPCOMING bookings from Square Appointments for the next N days (default
// 14, max 31). Queries EVERY location on the account (a seller may have their
// Appointments set up under a location other than the resolved default, including
// an inactive one), then resolves each booking's customer name.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    const now = new Date();
    // Allow up to 120 days so far-future rebookings (e.g. a 6–8 week follow-up) are captured.
    // Square's List Bookings endpoint only allows ~31 days per query, so we page across
    // consecutive <=31-day windows below rather than asking for the whole span at once.
    const days = Math.min(Math.max(parseInt(req.query.days || '14', 10) || 14, 1), 120);
    // Look back a full day from now (not just "now") so appointments earlier today
    // stay in the list even after their start time passes — the provider may still
    // need to open them later to finish session notes.
    const startMin = new Date(now.getTime() - 24 * 3600000);
    const end = new Date(startMin.getTime() + days * 86400000);

    // Build consecutive query windows no longer than Square's per-request limit.
    const WINDOW_MS = 30 * 86400000; // 30 days per window, safely under Square's ~31-day cap
    const windows = [];
    for (let ws = startMin.getTime(); ws < end.getTime(); ws += WINDOW_MS) {
      const we = Math.min(ws + WINDOW_MS, end.getTime());
      windows.push([new Date(ws).toISOString(), new Date(we).toISOString()]);
    }

    // Every location on the account.
    let locIds = [];
    try {
      const loc = await sf('/v2/locations');
      locIds = (loc.locations || []).map(l => l.id).filter(Boolean);
    } catch (e) { /* fall back to unfiltered query below */ }

    // Collect bookings from each location across each time window (plus an unfiltered pass).
    let raw = [];
    const seen = new Set();
    const pull = async (qs) => {
      try {
        const d = await sf('/v2/bookings?' + qs.toString());
        for (const b of (d.bookings || [])) { if (b && b.id && !seen.has(b.id)) { seen.add(b.id); raw.push(b); } }
      } catch (e) { /* skip a location/window/pass that errors */ }
    };
    for (const [wMin, wMax] of windows) {
      for (const lid of locIds) {
        await pull(new URLSearchParams({ location_id: lid, start_at_min: wMin, start_at_max: wMax, limit: '100' }));
      }
      // Unfiltered safety net (covers any location we didn't enumerate) for this window.
      await pull(new URLSearchParams({ start_at_min: wMin, start_at_max: wMax, limit: '100' }));
    }

    const bookings = raw.filter(isLive);

    // Resolve customer names (one lookup per unique customer, in parallel).
    const ids = [...new Set(bookings.map(b => b.customer_id).filter(Boolean))];
    const names = {};
    await Promise.all(ids.map(async (id) => {
      try {
        const cd = await sf('/v2/customers/' + id);
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
          locationId: b.location_id || '',
          customerId: b.customer_id || '',
          customerName: names[b.customer_id] || 'Client',
          durationMinutes: seg.duration_minutes || null,
          serviceVariationId: seg.service_variation_id || '',
          teamMemberId: seg.team_member_id || ''
        };
      })
      .sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));

    res.status(200).json({ count: appointments.length, appointments });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null });
  }
}

function isLive(b) {
  const dead = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SELLER', 'DECLINED', 'NO_SHOW'];
  return !dead.includes(b.status);
}
