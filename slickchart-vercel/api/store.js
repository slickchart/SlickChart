// /api/store  — the app's saved data, per logged-in owner.
//   GET  -> { data: { key: value, ... } }            (everything, for hydration)
//   PUT  -> body { items: { key: value, ... } }       (upsert many)
//        -> body { key, value }                        (upsert one)
// Most keys are last-writer-wins. A few append-only ones are MERGED server-side instead — see
// UNION_SET_KEYS / OLDEST_WINS_KEYS below.
import { sql, ensureTable, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken, signToken, isSessionValid } from '../lib/auth.js';
import { snapshotBeforeWrite, rescueDeviceCopy } from '../lib/kv-history.js';

async function requireLogin(req, res, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret ? verifyToken(token, secret) : null;
  if (!payload) { res.status(401).json({ error: 'Not logged in.', reason: 'expired' }); return null; }
  try {
    if (!(await isSessionValid(q, payload.sid))) {
      res.status(401).json({ error: 'This session has been signed out. Please log in again.', reason: 'revoked' });
      return null;
    }
  } catch (e) { /* if the check itself fails, don't lock people out over it */ }
  // Require an explicit tenant claim. Every legitimately-minted token carries `u` (a provider id, or
  // the literal 'owner' for the single-tenant owner login). Defaulting a u-less token to the shared
  // 'owner' tenant would be a latent cross-account footgun — a future token-mint path that forgot `u`
  // would hand its holder the owner's entire dataset. Fail closed instead.
  if (!payload.u) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  req._scPayload = payload;
  return payload.u;
}

// A sign-in pass lasts 30 days and nothing used to renew it, so every provider was sent back to the
// login screen on day 30, mid-use (2026-10-27: an Android provider's app signed her out during a sync
// with token-dropped < Cloud.pull). A full pull now hands back a fresh 30-day pass for the SAME session
// once the current one is a week old, so a provider who keeps using the app stays signed in.
// Only a real session token is renewed: it must carry `sid` (so sign-out and "sign out other devices"
// still kill it, isSessionValid ran above) and no scope (`k`) or purpose (`p`) claim. The new pass has
// exactly the old claims, so it can never name a different account.
const RENEW_WHEN_LEFT_S = 60 * 60 * 24 * 23;
function renewedToken(payload) {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret || !payload || !payload.u || !payload.sid || payload.k || payload.p || !payload.exp) return null;
  if (payload.exp - Math.floor(Date.now() / 1000) > RENEW_WHEN_LEFT_S) return null;
  const { exp, ...claims } = payload;
  return signToken(claims, secret);
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
// The client delete / put-back / merge records. A device that had not pulled yet used to push its
// smaller map and erase another device's removal for the whole account, so a merged-away duplicate
// came back on the next fresh sign-in. id -> ms, the NEWER stamp wins (the app compares delete vs
// put-back times, so both must keep their newest). Removing an entry from these is never needed:
// a put-back is a newer sc_undeleted_clients stamp, and the founder tool edits them with direct SQL.
const NEWEST_WINS_KEYS = { sc_deleted_clients: 1, sc_undeleted_clients: 1, sc_merged_ids: 1,
  // Every library's delete record (id -> when deleted; a negative stamp is an un-delete, e.g. a course
  // restored from Earlier copies). A stale device used to push its smaller record and bring back an
  // appointment she had cancelled on her phone. The larger magnitude is the more recent decision.
  sc_deleted_appts: 1, sc_hidden_forms: 1, sc_hidden_courses: 1, sc_hidden_guides: 1, sc_hidden_square: 1,
  sc_deleted_vc_types: 1, sc_deleted_products: 1, sc_deleted_docs: 1, sc_deleted_protocols: 1, sc_deleted_note_tmpls: 1,
  sc_deleted_note_drafts: 1, sc_deleted_needle_presets: 1, sc_deleted_autos: 1, sc_deleted_inv: 1, sc_deleted_vendors: 1, sc_deleted_shop_bundles: 1,
  sc_deleted_bundles: 1, sc_deleted_partners: 1, sc_deleted_payments: 1, sc_deleted_routines: 1,
  sc_deleted_svc: 1, sc_deleted_msg_tmpls: 1, sc_deleted_starters: 1, sc_deleted_reminders: 1 };
const UNION_OBJ_KEYS = { sc_merged_into: 1 };      // dropped id -> surviving id; the incoming write wins a collision
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
      // ?key=sc_forms reads ONE key. The app uses it to confirm a save actually reached the account
      // without pulling the provider's whole workspace (~1.5MB) every time she taps Save. Same owner
      // scoping as the full read: the owner comes from the verified token, never from the request.
      const one = String((req.query && req.query.key) || '');
      if (one) {
        const rows = await q`SELECT k, v FROM kv WHERE owner = ${owner} AND k = ${one}`;
        const data = {};
        rows.forEach(r => { data[r.k] = r.v; });
        res.status(200).json({ data, count: rows.length });
        return;
      }
      const rows = await q`SELECT k, v FROM kv WHERE owner = ${owner}`;
      const data = {};
      rows.forEach(r => { data[r.k] = r.v; });
      const out = { data, count: rows.length };
      const renew = renewedToken(req._scPayload);
      if (renew) out.renew = renew;   // additive: a build that does not read it is unaffected
      res.status(200).json(out);
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body || {};

      // A device photographing its own copy before the merge runs. Writes ONLY to history, never
      // to kv — see rescueDeviceCopy. Handled before `items` so a rescue is never mistaken for a
      // save, and so a device holding the last good copy of someone's work can hand it over
      // without that copy having to win an argument first.
      if (body.rescue && typeof body.rescue === 'object') {
        let out = { saved: 0 };
        try { out = await rescueDeviceCopy(owner, body.rescue); }
        catch (e) { console.error('[store] rescue failed:', e && e.message); }
        res.status(200).json({ ok: true, rescued: out.saved });
        return;
      }

      let items = body.items;
      if (!items && body.key !== undefined) items = { [body.key]: body.value };
      if (!items || typeof items !== 'object') { res.status(400).json({ error: 'Nothing to save.' }); return; }

      const entries = Object.entries(items);

      // SAFETY NET. Before anything is overwritten, keep the old value of any library this write
      // SHRINKS. Four separate incidents have now ended with a provider's work gone and no way
      // back; each had a different cause and each was only understood afterwards. This assumes the
      // next cause exists and has not been found yet, and makes it undoable regardless.
      // Deliberately wrapped: history is a seatbelt, and a seatbelt that can stop the car is worse
      // than none. A save must still succeed if this fails.
      try { await snapshotBeforeWrite(owner, items); }
      catch (e) { console.error('[store] history snapshot failed (save continues):', e && e.message); }

      // A device that had not heard about a delete or a merge still carries that client in its list,
      // and its next upload put the copy back into the account's list (hidden by the delete record on
      // every device, but there). Strip ids whose delete is newer than any put-back, using the
      // account's delete records merged with any arriving in this same request. Same rule the app
      // applies on load (_purgeRemovedClients / _unDeletedClientIds), so nothing the app would show
      // is removed. kv_history already holds the copy from before this write.
      const _ids = async (key) => {
        const out = {};
        try { const r = await q`SELECT v FROM kv WHERE owner=${owner} AND k=${key}`; const o = r[0] ? JSON.parse(r[0].v) : null; if (o && typeof o === 'object' && !Array.isArray(o)) Object.assign(out, o); } catch (e) {}
        try { const inc = items && items[key] != null ? JSON.parse(String(items[key])) : null; if (inc && typeof inc === 'object' && !Array.isArray(inc)) for (const i of Object.keys(inc)) { const a = typeof out[i] === 'number' ? out[i] : (i in out ? 1 : 0), b = typeof inc[i] === 'number' ? inc[i] : 1; out[i] = Math.max(a, b); } } catch (e) {}
        return out;
      };
      const stripRemoved = async (val) => {
        try {
          const roster = JSON.parse(val);
          if (!roster || typeof roster !== 'object' || Array.isArray(roster)) return val;
          const del = await _ids('sc_deleted_clients'), und = await _ids('sc_undeleted_clients');
          let n = 0;
          for (const id of Object.keys(roster)) {
            if (!(id in del)) continue;
            const d = typeof del[id] === 'number' ? del[id] : 1, u = typeof und[id] === 'number' ? und[id] : (id in und ? 1 : 0);
            if (d > u) { delete roster[id]; n++; }
          }
          return n ? JSON.stringify(roster) : val;
        } catch (e) { return val; }
      };

      for (const [k, v] of entries) {
        let val = v == null ? null : String(v);
        if (k === 'sc_clients' && val) val = await stripRemoved(val);
        // A library is never legitimately the empty string. One code path pushed '' for the consults
        // (their bytes live in IndexedDB, not localStorage) and wiped every consult on the account.
        if ((k === 'sc_pro_vc_subs' || k === 'sc_clients' || k === 'sc_session_summaries') && val === '') continue;
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
        if (NEWEST_WINS_KEYS[k] && isJsonObject(val)) {
          // Keep the NEWEST stamp per id; a non-number marker (legacy `true`) counts as 1. See above.
          await q`INSERT INTO kv (owner, k, v, updated_at)
                  VALUES (${owner}, ${k}, ${val}, now())
                  ON CONFLICT (owner, k) DO UPDATE SET v = (
                    SELECT COALESCE(jsonb_object_agg(s.key, to_jsonb(s.val)), '{}'::jsonb)::text FROM (
                      SELECT e.key, (array_agg(e.num ORDER BY abs(e.num) DESC))[1] AS val FROM (
                        SELECT key, (CASE WHEN jsonb_typeof(value) = 'number' THEN value::text::numeric ELSE 1 END) AS num
                          FROM jsonb_each(CASE WHEN jsonb_typeof(kv.v::jsonb)       = 'object' THEN kv.v::jsonb       ELSE '{}'::jsonb END)
                        UNION ALL
                        SELECT key, (CASE WHEN jsonb_typeof(value) = 'number' THEN value::text::numeric ELSE 1 END) AS num
                          FROM jsonb_each(CASE WHEN jsonb_typeof(EXCLUDED.v::jsonb) = 'object' THEN EXCLUDED.v::jsonb ELSE '{}'::jsonb END)
                      ) e GROUP BY e.key
                    ) s
                  ), updated_at = now()`;
          continue;
        }
        if (UNION_OBJ_KEYS[k] && isJsonObject(val)) {
          await q`INSERT INTO kv (owner, k, v, updated_at)
                  VALUES (${owner}, ${k}, ${val}, now())
                  ON CONFLICT (owner, k) DO UPDATE SET v = (
                    (CASE WHEN jsonb_typeof(kv.v::jsonb)       = 'object' THEN kv.v::jsonb       ELSE '{}'::jsonb END) ||
                    (CASE WHEN jsonb_typeof(EXCLUDED.v::jsonb) = 'object' THEN EXCLUDED.v::jsonb ELSE '{}'::jsonb END)
                  )::text, updated_at = now()`;
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
