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

    // Page bookings across a WIDE window (2 years back → 6 months forward). Each booking ties a customer
    // to a location and (via its segments) a team member. Map each customer to the set of locations/teams
    // they've ever booked with — real clients cluster on YOUR location/staff; the other provider's on theirs.
    const custLoc = {}, custTeam = {};
    const now = Date.now();
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
        const segs = b.appointment_segments || [];
        for (const s of segs) { if (s && s.team_member_id) (custTeam[cid] = custTeam[cid] || new Set()).add(s.team_member_id); }
      }
      cursor = d.cursor || '';
    } while (cursor && ++guard < 120);

    // Distinct customers per location / per team.
    const locCounts = {}, teamCounts = {};
    const custIds = new Set(Object.keys(custLoc).concat(Object.keys(custTeam)));
    out.customersWithBookings = custIds.size;
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
      out.customersWithNoBookings = Math.max(0, total - out.customersWithBookings);
    } catch (e) {}

    res.status(200).json(out);
  } catch (e) { res.status(e.status || 500).json({ error: e.message, out }); }
}
