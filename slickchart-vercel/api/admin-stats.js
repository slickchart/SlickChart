// GET /api/admin-stats  → owner-only: privacy-safe aggregate adoption metrics.
// Returns COUNTS only — no tokens, no emails, no per-provider data. Built to answer
// "how many providers connected Square, and how many actively use it" for planning a
// Square App Marketplace listing, plus beta-launch health (charting, pulse, subscriptions).
import { sql, ensureProvidersTable, ensureBetaTable, dbEnabled } from '../lib/db.js';
import { verifyToken } from '../lib/auth.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}
async function resolveEmail(req, q) {
  const p = claims(req);
  if (!p.u) return null;
  if (p.e) return String(p.e).toLowerCase();
  try { const r = await q`SELECT email FROM providers WHERE id = ${p.u}`; return (r[0] && r[0].email) ? String(r[0].email).toLowerCase() : null; }
  catch (e) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: true, providers: {}, square: {}, note: 'Database not configured.' }); return; }
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  try {
    await ensureProvidersTable();
    const q = sql();
    const you = await resolveEmail(req, q);
    if (!owner || you !== owner) { res.status(403).json({ error: 'Owner only' }); return; }

    const pv = (await q`SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE created_at > now() - interval '7 days')::int  AS new7,
        count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new30
      FROM providers`)[0] || {};

    const sq = (await q`SELECT
        count(*)::int AS connected,
        count(DISTINCT merchant_id)::int AS merchants,
        count(*) FILTER (WHERE connected_at  > now() - interval '7 days')::int  AS new7,
        count(*) FILTER (WHERE connected_at  > now() - interval '30 days')::int AS new30,
        count(*) FILTER (WHERE last_used_at  > now() - interval '7 days')::int  AS active7,
        count(*) FILTER (WHERE last_used_at  > now() - interval '30 days')::int AS active30
      FROM square_connections`)[0] || {};

    let waitlistCount = 0;
    try { const w = await q`SELECT count(*)::int AS n FROM waitlist`; waitlistCount = (w[0] && w[0].n) || 0; } catch (e) {}

    // ── Beta metric #2: charting activity, and #3/#4: pulse survey ──
    // Wrapped so that if the beta tables aren't populated yet, the rest of the
    // stats still return normally (the dashboard shows a "waiting" note).
    let charting = {}, pulse = {};
    try {
      await ensureBetaTable();
      const ch = (await q`SELECT
          count(DISTINCT provider_id) FILTER (WHERE type='chart_saved' AND created_at > now() - interval '7 days')::int  AS active7,
          count(*) FILTER (WHERE type='chart_saved' AND created_at > now() - interval '7 days')::int  AS charts7,
          count(*) FILTER (WHERE type='chart_saved' AND created_at > now() - interval '30 days')::int AS charts30,
          count(*) FILTER (WHERE type='pulse_shown' AND created_at > now() - interval '30 days')::int AS shown30
        FROM beta_events`)[0] || {};
      const fb = (await q`SELECT
          count(*) FILTER (WHERE kind='pulse')::int AS answered,
          avg(rating) FILTER (WHERE kind='pulse' AND rating IS NOT NULL)::float AS avg_rating,
          count(*) FILTER (WHERE kind='pulse' AND time_saved IN ('much_less','less'))::int AS faster
        FROM feedback
        WHERE ts > now() - interval '30 days'`)[0] || {};
      charting = {
        activeProviders7: ch.active7 || 0,
        charts7: ch.charts7 || 0,
        charts30: ch.charts30 || 0
      };
      const answered = fb.answered || 0;
      pulse = {
        shown: ch.shown30 || 0,
        answered,
        avgRating: fb.avg_rating != null ? Math.round(fb.avg_rating * 10) / 10 : null,
        fasterPct: answered ? Math.round((100 * (fb.faster || 0)) / answered) : null
      };
    } catch (e) { /* beta tables not ready — leave charting/pulse empty */ }

    // ── Beta metric #6 + subscriber count: subscriptions (from the Stripe webhook table) ──
    let subs = {};
    try {
      const su = (await q`SELECT
          count(*) FILTER (WHERE status='active')::int   AS active,
          count(*) FILTER (WHERE status='past_due')::int AS past_due,
          count(*) FILTER (WHERE status='canceled')::int AS canceled,
          count(*) FILTER (WHERE status='canceled' AND updated_at > now() - interval '30 days')::int AS canceled30
        FROM subscriptions`)[0] || {};
      subs = {
        active: su.active || 0,
        pastDue: su.past_due || 0,
        canceled: su.canceled || 0,
        canceled30: su.canceled30 || 0
      };
    } catch (e) { /* subscriptions table not ready — leave subs empty */ }

    const total = pv.total || 0, connected = sq.connected || 0;
    res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      providers: { total, new7: pv.new7 || 0, new30: pv.new30 || 0 },
      waitlist: { count: waitlistCount },
      square: {
        connected,
        merchants: sq.merchants || 0,
        connectRate: total ? Math.round((connected / total) * 100) : 0,
        connectedNew7: sq.new7 || 0,
        connectedNew30: sq.new30 || 0,
        active7: sq.active7 || 0,
        active30: sq.active30 || 0
      },
      charting,
      pulse,
      subs
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
