// GET /api/spots  → public: { cap, taken, left } for the founding-provider counter.
// Safe to expose — returns only counts, no provider data. Cached 60s.
import { sql, dbEnabled, ensureProvidersTable } from '../lib/db.js';

export default async function handler(req, res) {
  const cap = parseInt(process.env.FOUNDING_CAP || '250', 10);
  // Marketing floor: never show fewer than this many claimed (reflects existing founding testers).
  // Defaults to 50; override anytime with the SPOTS_TAKEN_BASE env var in Vercel.
  const base = parseInt(process.env.SPOTS_TAKEN_BASE || '50', 10);
  let taken = base;
  try {
    if (dbEnabled()) {
      await ensureProvidersTable();
      const q = sql();
      const r = await q`SELECT count(*)::int AS n FROM providers`;
      taken = Math.max(base, (r[0] && r[0].n) || 0);
    }
  } catch (e) { /* fall back to base */ }
  taken = Math.min(taken, cap);
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.status(200).json({ cap, taken, left: Math.max(0, cap - taken) });
}
