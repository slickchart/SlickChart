// GET /api/square/customer-map — READ-ONLY. Maps the caller's OWN Square customers to the location(s)
// and team member(s) their bookings belong to, so a cross-account leak (another provider's clients that
// landed in this merchant) can be separated by WHERE/ WITH-WHOM they booked — the one signal that can't
// be faked by area code, email, or creation date. Aggregate counts only; no customer PII beyond what's
// needed to identify a group. Uses only the provider's own OAuth token (sqContext). Deletes NOTHING.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const out = { locations: [], teamMembers: [], byLocation: {}, byTeam: {}, customersWithBookings: 0, bookingsScanned: 0, totalCustomers: null };

  try {
    // Location + team member names, so the breakdown is human-readable.
    try { const loc = await sf('/v2/locations'); out.locations = (loc.locations || []).map(l => ({ id: l.id, name: l.name || l.id })); } catch (e) { out.locationsError = e.message; }
    const teamName = {};
    try {
      const tm = await sf('/v2/team-members/search', { method: 'POST', body: { query: {}, limit: 200 } });
      (tm.team_members || []).forEach(t => { const nm = [t.given_name, t.family_name].filter(Boolean).join(' ').trim() || t.id; teamName[t.id] = nm; out.teamMembers.push({ id: t.id, name: nm }); });
    } catch (e) { out.teamError = e.message; }
    const locName = {}; out.locations.forEach(l => { locName[l.id] = l.name; });

    out.locationCount = out.locations.length;
    const custLoc = {}, custTeam = {};
    const now = Date.now();

    // 1) BOOKINGS (Square Appointments) — ties a customer to a location + team member. Often only returns
    //    upcoming, so it can be empty for old leaked records; that's fine, orders below cover the past.
    {
      const startMin = new Date(now - 730 * 86400000).toISOString();
      const startMax = new Date(now + 180 * 86400000).toISOString();
      let cursor = '', guard = 0;
      do {
        const qs = new URLSearchParams({ start_at_min: startMin, start_at_max: startMax, limit: '200' });
        if (cursor) qs.set('cursor', cursor);
        let d;
        try { d = await sf('/v2/bookings?' + qs.toString()); } catch (e) { out.bookingsError = e.message; break; }
        const bs = d.bookings || [];
        out.bookingsScanned += bs.length;
        for (const b of bs) {
          const cid = b.customer_id; if (!cid) continue;
          if (b.location_id) { (custLoc[cid] = custLoc[cid] || new Set()).add(b.location_id); }
          for (const s of (b.appointment_segments || [])) { if (s && s.team_member_id) (custTeam[cid] = custTeam[cid] || new Set()).add(s.team_member_id); }
        }
        cursor = d.cursor || '';
      } while (cursor && ++guard < 120);
    }

    // 2) ORDERS (payments/transactions) — this is what "couldn't delete: has orders attached" refers to,
    //    and it covers PAST activity that bookings miss. Each order carries customer_id + location_id, so
    //    a customer who only ever transacted at a location that isn't yours is the other provider's.
    out.ordersScanned = 0;
    if (out.locations.length) {
      const locIds = out.locations.map(l => l.id);
      let cursor = '', guard = 0;
      const createdAtMin = new Date(now - 3 * 365 * 86400000).toISOString();
      do {
        const body = { location_ids: locIds, limit: 500, query: { filter: { date_time_filter: { created_at: { start_at: createdAtMin } } } }, return_entries: false };
        if (cursor) body.cursor = cursor;
        let d;
        try { d = await sf('/v2/orders/search', { method: 'POST', body }); } catch (e) { out.ordersError = e.message; break; }
        const orders = d.orders || [];
        out.ordersScanned += orders.length;
        for (const o of orders) { const cid = o.customer_id; if (cid && o.location_id) (custLoc[cid] = custLoc[cid] || new Set()).add(o.location_id); }
        cursor = d.cursor || '';
      } while (cursor && ++guard < 60);
    }

    // Distinct customers per location / per team.
    const locCounts = {}, teamCounts = {};
    const custIds = new Set(Object.keys(custLoc).concat(Object.keys(custTeam)));
    out.customersWithActivity = custIds.size;
    out.customersWithBookings = custIds.size; // back-compat
    // The RELIABLE "this is really my client" set: every customer who has a booking or a payment with you.
    // A real client transacts; the leaked/junk records don't. The cleanup tool protects exactly these.
    out.activeCustomerIds = Array.from(custIds);
    for (const cid of custIds) {
      (custLoc[cid] ? Array.from(custLoc[cid]) : []).forEach(l => { locCounts[l] = (locCounts[l] || 0) + 1; });
      (custTeam[cid] ? Array.from(custTeam[cid]) : []).forEach(t => { teamCounts[t] = (teamCounts[t] || 0) + 1; });
    }
    out.byLocation = Object.keys(locCounts).map(id => ({ id, name: locName[id] || id, customers: locCounts[id] })).sort((a, b) => b.customers - a.customers);
    out.byTeam = Object.keys(teamCounts).map(id => ({ id, name: teamName[id] || id, customers: teamCounts[id] })).sort((a, b) => b.customers - a.customers);

    // Total customers in the directory, for context (how many have NO bookings at all).
    try {
      let total = 0, cur = '', g = 0;
      do { const qs = new URLSearchParams({ limit: '100' }); if (cur) qs.set('cursor', cur); const d = await sf('/v2/customers?' + qs.toString()); total += (d.customers || []).length; cur = d.cursor || ''; } while (cur && ++g < 80);
      out.totalCustomers = total;
      out.customersWithNoActivity = Math.max(0, total - out.customersWithActivity);
      out.customersWithNoBookings = out.customersWithNoActivity; // back-compat
    } catch (e) {}

    res.status(200).json(out);
  } catch (e) { res.status(e.status || 500).json({ error: e.message, out }); }
}
