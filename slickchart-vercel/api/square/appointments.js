// GET /api/square/appointments?days=14   (or ?from=YYYY-MM-DD&days=33 for a past stretch)
// Lists UPCOMING bookings from Square Appointments for the next N days (default
// 14, max 31). Queries EVERY location on the account (a seller may have their
// Appointments set up under a location other than the resolved default, including
// an inactive one), then resolves each booking's customer name.
import { squareFetch as _sqf, sqContext, listBookableServices } from '../../lib/square.js';

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
    // ?from=YYYY-MM-DD reads an EARLIER stretch instead, so the calendar can show the visits a
    // provider has already had (2026-10-22: "I still can't go back to previous dates"). Capped at
    // 3 years back and 45 days long; anything else falls back to the upcoming window above.
    let startMin = new Date(now.getTime() - 24 * 3600000);
    let spanDays = days;
    const fromQ = String(req.query.from || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromQ)) {
      const f = new Date(fromQ + 'T00:00:00Z');
      if (!isNaN(f.getTime()) && f.getTime() > now.getTime() - 3 * 366 * 86400000 && f.getTime() < now.getTime()) {
        startMin = new Date(f.getTime() - 14 * 3600000);   // the provider's midnight is up to 14h off UTC
        spanDays = Math.min(days, 45);
      }
    }
    const end = new Date(startMin.getTime() + spanDays * 86400000);

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
        // Follow Square's pages: a busy month has more than 100 bookings, and the missing ones also
        // cleared those clients' next-visit dates.
        let d = await sf('/v2/bookings?' + qs.toString()), pages = 0;
        for (;;) {
          for (const b of (d.bookings || [])) { if (b && b.id && !seen.has(b.id)) { seen.add(b.id); raw.push(b); } }
          if (!d.cursor || ++pages >= 10) break;
          const q2 = new URLSearchParams(qs); q2.set('cursor', d.cursor);
          d = await sf('/v2/bookings?' + q2.toString());
        }
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
    const cust = {};
    await Promise.all(ids.map(async (id) => {
      try {
        const cd = await sf('/v2/customers/' + id);
        if (cd.customer) {
          const c = cd.customer;
          // Capture email + phone (not just the name) so a new online booker can be added to the
          // provider's client list with the contact info needed to send them forms / their app link.
          cust[id] = {
            name: [c.given_name, c.family_name].filter(Boolean).join(' ').trim() || c.email_address || 'Client',
            email: c.email_address || '',
            phone: c.phone_number || ''
          };
        }
      } catch { /* ignore a single failed lookup */ }
    }));

    // What each booking is FOR. Square puts only a service_variation_id on the segment, so every
    // appointment arrived in the app with no idea of its service and the calendar labelled them all
    // the same. Ashley, 2026-10-12: "I would like for my appointments in slickchart to match the
    // service name from square". One catalog walk per request, and only when there is something to
    // resolve; a failure just leaves the names blank and the app falls back to its generic label.
    const svcName = {};
    try {
      const varIds = [...new Set(bookings
        .map((b) => ((b.appointment_segments || [])[0] || {}).service_variation_id)
        .filter(Boolean))];
      if (varIds.length) {
        const svcs = await listBookableServices(ctx.token);
        svcs.forEach((sv) => { if (sv && sv.variationId) svcName[sv.variationId] = sv.name; });
      }
    } catch (e) { /* names unavailable — the app shows its generic label rather than nothing */ }

    const appointments = bookings
      .map((b) => {
        const seg = (b.appointment_segments || [])[0] || {};
        return {
          id: b.id,
          version: b.version != null ? b.version : null, // needed to cancel/reschedule this booking
          startAt: b.start_at || '',
          status: b.status || '',
          locationId: b.location_id || '',
          customerId: b.customer_id || '',
          customerName: (cust[b.customer_id] && cust[b.customer_id].name) || 'Client',
          customerEmail: (cust[b.customer_id] && cust[b.customer_id].email) || '',
          customerPhone: (cust[b.customer_id] && cust[b.customer_id].phone) || '',
          durationMinutes: seg.duration_minutes || null,
          serviceVariationId: seg.service_variation_id || '',
          serviceName: svcName[seg.service_variation_id] || '',
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
