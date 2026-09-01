// GET /api/square/diag  → self-diagnostic for the logged-in provider.
// Shows which Square location the app is using, all locations on the account,
// and how many bookings/invoices Square returns — so we can see WHY a list is empty.
// Aggregate/technical info only; no client PII beyond counts.
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';
import { sql } from '../../lib/db.js';

export default async function handler(req, res) {
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const out = { usingLocationId: null, storedLocationId: ctx.locationId || null, locations: [], bookings: {}, invoices: {}, customers: {}, merchant: {} };

  // ── WHY ARE STRANGERS IMPORTING? ─────────────────────────────────────────────────────────────
  // The customer IMPORT reads this account's WHOLE Square customer directory. If foreign customers show
  // up in the app, this account's Square directory itself contains them. Report the total and the newest
  // few (with creation source) so ongoing pollution — a rising count / a burst of very recent creations —
  // is visible, plus the merchant id and (founder only) whether ANY OTHER provider is connected to the
  // SAME merchant, which is the cross-account signature.
  try {
    let count = 0, cursor = '', guard = 0, all = [];
    do {
      const qs = new URLSearchParams({ limit: '100' });
      if (cursor) qs.set('cursor', cursor);
      const d = await sf('/v2/customers?' + qs.toString());
      const cs = d.customers || [];
      count += cs.length;
      all = all.concat(cs.map(c => ({ created: c.created_at || '', src: c.creation_source || '' })));
      cursor = d.cursor || '';
    } while (cursor && ++guard < 80);
    all.sort((a, b) => String(b.created).localeCompare(String(a.created)));
    // Injection fingerprint: how many customers were created very recently, and by WHAT creation source.
    //   THIRD_PARTY / THIRD_PARTY_IMPORT = created via an app/API (a SlickChart connection, or another
    //     Square app authorized on this merchant).
    //   IMPORT = a CSV imported in the Square Dashboard.  DIRECTORY = typed into the Dashboard by a person.
    //   MERGE = a directory merge.  APPOINTMENTS / ONLINE_STORE / etc. = Square's own booking/store flows.
    // A same-day burst all sharing one source tells us exactly which door is open.
    const now = Date.now();
    const since = (ms) => all.filter(c => c.created && (now - new Date(c.created).getTime()) <= ms).length;
    const srcCounts = {}, recentSrcCounts = {};
    for (const c of all) { const s = c.src || 'UNKNOWN'; srcCounts[s] = (srcCounts[s] || 0) + 1; }
    for (const c of all.filter(c => c.created && (now - new Date(c.created).getTime()) <= 86400000)) {
      const s = c.src || 'UNKNOWN'; recentSrcCounts[s] = (recentSrcCounts[s] || 0) + 1;
    }
    out.customers = {
      total: count,
      newest: all.slice(0, 10),
      createdLast24h: since(86400000),
      createdLast7d: since(7 * 86400000),
      newestCreatedAt: (all[0] && all[0].created) || null,
      sourceCounts: srcCounts,              // whole directory, by source
      recentSourceCounts: recentSrcCounts   // last 24h only, by source — the active-injection fingerprint
    };
  } catch (e) { out.customers = { error: e.message }; }

  try {
    const q = sql();
    const meRows = await q`SELECT merchant_id FROM square_connections WHERE provider_id=${ctx.providerId}`;
    const mid = (meRows[0] && meRows[0].merchant_id) || null;
    out.merchant.id = mid;
    // Founder-gated cross-account check: does another provider share this merchant? (Don't expose other
    // providers to a random caller — only the founder, for support.)
    let email = '';
    try { const p = await q`SELECT email FROM providers WHERE id=${ctx.providerId}`; email = String((p[0] && p[0].email) || '').toLowerCase(); } catch (e) {}
    const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (mid && email && founders.includes(email)) {
      const others = await q`SELECT provider_id FROM square_connections WHERE merchant_id=${mid} AND provider_id <> ${ctx.providerId}`;
      out.merchant.sharedWithOtherProviders = (others || []).map(r => r.provider_id);
      out.merchant.isShared = (others || []).length > 0;
    }
  } catch (e) { out.merchant.error = e.message; }
  try {
    // all locations on the account
    try {
      const loc = await sf('/v2/locations');
      out.locations = (loc.locations || []).map(l => ({ id: l.id, name: l.name, status: l.status }));
    } catch (e) { out.locationsError = e.message; }

    const locationId = await resolveLocationId(ctx.token, ctx.locationId);
    out.usingLocationId = locationId;

    // bookings: next 14 and next 60 days (any location match), to see if it's a window issue
    for (const days of [14, 30]) {
      try {
        const now = new Date(); const end = new Date(now.getTime() + days * 86400000);
        const qs = new URLSearchParams({ location_id: locationId, start_at_min: now.toISOString(), start_at_max: end.toISOString(), limit: '100' });
        const d = await sf('/v2/bookings?' + qs.toString());
        out.bookings['next' + days] = { count: (d.bookings || []).length, statuses: (d.bookings || []).map(b => b.status) };
      } catch (e) { out.bookings['next' + days] = { error: e.message }; }
    }
    // bookings across ALL locations (no location filter) — reveals a location mismatch
    try {
      const now = new Date(); const end = new Date(now.getTime() + 30 * 86400000);
      const qs = new URLSearchParams({ start_at_min: now.toISOString(), start_at_max: end.toISOString(), limit: '100' });
      const d = await sf('/v2/bookings?' + qs.toString());
      out.bookings.anyLocation = { count: (d.bookings || []).length, locationIds: [...new Set((d.bookings || []).map(b => b.location_id))] };
    } catch (e) { out.bookings.anyLocation = { error: e.message }; }

    // Per-location booking counts (14-day window each) — reveals exactly where bookings live.
    out.bookings.perLocation = {};
    try {
      const now2 = new Date(); const end2 = new Date(now2.getTime() + 14 * 86400000);
      for (const l of out.locations) {
        try {
          const qs = new URLSearchParams({ location_id: l.id, start_at_min: now2.toISOString(), start_at_max: end2.toISOString(), limit: '100' });
          const d = await sf('/v2/bookings?' + qs.toString());
          out.bookings.perLocation[(l.name || l.id)] = (d.bookings || []).length;
        } catch (e) { out.bookings.perLocation[(l.name || l.id)] = 'err:' + e.message.slice(0, 40); }
      }
    } catch (e) {}

    // invoices at the resolved location
    try {
      const d = await sf('/v2/invoices/search', { method: 'POST', body: { query: { filter: { location_ids: [locationId] } }, limit: 100 } });
      out.invoices.atLocation = { count: (d.invoices || []).length, statuses: (d.invoices || []).slice(0, 10).map(i => i.status) };
    } catch (e) { out.invoices.atLocation = { error: e.message }; }

    res.status(200).json(out);
  } catch (e) { res.status(e.status || 500).json({ error: e.message, out }); }
}
