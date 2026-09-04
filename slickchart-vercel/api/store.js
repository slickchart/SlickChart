// /api/store  — the app's saved data, per logged-in owner.
//   GET  -> { data: { key: value, ... } }            (everything, for hydration)
//   PUT  -> body { items: { key: value, ... } }       (upsert many)
//        -> body { key, value }                        (upsert one)
// Most keys are last-writer-wins. A few append-only ones are MERGED server-side instead — see
// UNION_SET_KEYS / OLDEST_WINS_KEYS below.
import { sql, ensureTable, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken, isSessionValid } from '../lib/auth.js';

async function requireLogin(req, res, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret ? verifyToken(token, secret) : null;
  if (!payload) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  try {
    if (!(await isSessionValid(q, payload.sid))) {
      res.status(401).json({ error: 'This session has been signed out. Please log in again.' });
      return null;
    }
  } catch (e) { /* if the check itself fails, don't lock people out over it */ }
  // Require an explicit tenant claim. Every legitimately-minted token carries `u` (a provider id, or
  // the literal 'owner' for the single-tenant owner login). Defaulting a u-less token to the shared
  // 'owner' tenant would be a latent cross-account footgun — a future token-mint path that forgot `u`
  // would hand its holder the owner's entire dataset. Fail closed instead.
  if (!payload.u) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  return payload.u;
}

// ── Keys the server must MERGE instead of overwrite ────────────────────────────
// A whole-blob PUT is last-writer-wins, which is fine for settings but wrong for a set that only ever
// grows. A device that has been open since before a dismissal was made on another device holds a
// smaller set in memory; the moment it writes, it erases the newer dismissals for the whole account —
// which is exactly why cleared "Needs your attention" cards kept coming back. The client merges on
// pull, but a client can only merge what it has locally, so the authoritative merge has to happen
// here where every device's writes land.
//
// Only strictly append-only keys belong in these lists. Deliberately EXCLUDED: sc_ci_cleared and
// sc_ci_dismissed (an Undo removes entries) and sc_notif_cleared / sc_notif_read (capped to the most
// recent 800/1200, so they are meant to shrink). Unioning those would break Undo and grow forever.
const UNION_SET_KEYS = { sc_home_dismissed: 1 };   // array of dismissed card keys — add-only
const OLDEST_WINS_KEYS = { sc_attn_seen: 1 };      // card key -> first-seen ms; earliest stamp wins,
                                                   // so the 24h retirement clock can never be reset
function isJsonArray(v) { try { return Array.isArray(JSON.parse(v)); } catch (e) { return false; } }
function isJsonObject(v) { try { const o = JSON.parse(v); return !!o && typeof o === 'object' && !Array.isArray(o); } catch (e) { return false; } }

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  await ensureProvidersTable(); // makes sure the sessions table exists before we check it
  const q0 = sql();
  const owner = await requireLogin(req, res, q0);
  if (!owner) return;

  try {
    await ensureTable();
    const q = sql();

    if (req.method === 'GET') {
      const rows = await q`SELECT k, v FROM kv WHERE owner = ${owner}`;
      const data = {};
      rows.forEach(r => { data[r.k] = r.v; });
      res.status(200).json({ data, count: rows.length });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body || {};
      let items = body.items;
      if (!items && body.key !== undefined) items = { [body.key]: body.value };
      if (!items || typeof items !== 'object') { res.status(400).json({ error: 'Nothing to save.' }); return; }

      const entries = Object.entries(items);
      for (const [k, v] of entries) {
        const val = v == null ? null : String(v);
        if (UNION_SET_KEYS[k] && isJsonArray(val)) {
          // Union, never replace. See UNION_SET_KEYS above.
          await q`INSERT INTO kv (owner, k, v, updated_at)
                  VALUES (${owner}, ${k}, ${val}, now())
                  ON CONFLICT (owner, k) DO UPDATE SET v = (
                    SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)::text
                    FROM jsonb_array_elements(
                      (CASE WHEN jsonb_typeof(kv.v::jsonb)       = 'array' THEN kv.v::jsonb        ELSE '[]'::jsonb END) ||
                      (CASE WHEN jsonb_typeof(EXCLUDED.v::jsonb) = 'array' THEN EXCLUDED.v::jsonb  ELSE '[]'::jsonb END)
                    ) e
                  ), updated_at = now()`;
          continue;
        }
        if (OLDEST_WINS_KEYS[k] && isJsonObject(val)) {
          // Keep the EARLIEST timestamp per key. See OLDEST_WINS_KEYS above.
          await q`INSERT INTO kv (owner, k, v, updated_at)
                  VALUES (${owner}, ${k}, ${val}, now())
                  ON CONFLICT (owner, k) DO UPDATE SET v = (
                    SELECT COALESCE(jsonb_object_agg(s.key, to_jsonb(s.val)), '{}'::jsonb)::text FROM (
                      SELECT e.key, min(e.num) AS val FROM (
                        SELECT key, (CASE WHEN jsonb_typeof(value) = 'number' THEN value::text::numeric ELSE 0 END) AS num
                          FROM jsonb_each(CASE WHEN jsonb_typeof(kv.v::jsonb)       = 'object' THEN kv.v::jsonb       ELSE '{}'::jsonb END)
                        UNION ALL
                        SELECT key, (CASE WHEN jsonb_typeof(value) = 'number' THEN value::text::numeric ELSE 0 END) AS num
                          FROM jsonb_each(CASE WHEN jsonb_typeof(EXCLUDED.v::jsonb) = 'object' THEN EXCLUDED.v::jsonb ELSE '{}'::jsonb END)
                      ) e WHERE e.num > 0 GROUP BY e.key
                    ) s
                  ), updated_at = now()`;
          continue;
        }
        await q`INSERT INTO kv (owner, k, v, updated_at)
                VALUES (${owner}, ${k}, ${val}, now())
                ON CONFLICT (owner, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
      }
      res.status(200).json({ ok: true, saved: entries.length });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[store] failed:', e && e.stack || e); res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
