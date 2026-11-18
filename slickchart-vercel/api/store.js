// /api/store  — the app's saved data, per logged-in owner.
//   GET  -> { data: { key: value, ... } }            (everything, for hydration)
//   GET ?since=<asOf> -> only rows changed since then in `data`, the rest as `keep: {key: md5}`
//   PUT  -> body { items: { key: value, ... } }       (upsert many)
//        -> body { key, value }                        (upsert one)
// Most keys are last-writer-wins. A few append-only ones are MERGED server-side instead — see
// UNION_SET_KEYS / OLDEST_WINS_KEYS below.
import { sql, ensureTable, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken, signToken, isSessionValid } from '../lib/auth.js';
import { snapshotBeforeWrite, rescueDeviceCopy } from '../lib/kv-history.js';
import { reconcileDeletedClients } from '../lib/clients.js';

// A whole-account read is ONE response, and Vercel refuses a buffered response over 4.5 MB
// (FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE); a streamed one is exempt. So a busy account (2026-11-18
// capacity review: the largest client list alone is 2.9 MB) would one day be unable to open on a new
// phone. Past STREAM_OVER the same JSON goes out in pieces. Same bytes, same shape, so every build
// reads it unchanged; under it nothing is different from res.json().
export const STREAM_OVER = 3500000;
export function sendJson(res, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');   // bytes, so an emoji is never cut in half
  if (body.length <= STREAM_OVER || typeof res.write !== 'function') { res.status(200).json(obj); return; }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (let i = 0; i < body.length; i += 262144) res.write(body.subarray(i, i + 262144));
  res.end();
}

// Pieces of one big value (see the PUT handler). Kept per owner + upload id; a piece is at most
// ~1.2M characters so its request stays well under 4.5 MB even when every character needs escaping.
export const PART_MAX_CHARS = 1200000, PART_MAX_COUNT = 60;
let _partsReady = false;
async function ensurePartsTable(q) {
  if (_partsReady) return;
  await q`CREATE TABLE IF NOT EXISTS kv_parts (
    owner text NOT NULL, upload_id text NOT NULL, k text NOT NULL, i int NOT NULL, n int NOT NULL,
    total int NOT NULL, data text NOT NULL, created_at timestamptz DEFAULT now(),
    PRIMARY KEY (owner, upload_id, i)
  )`;
  _partsReady = true;
}
// Returns { have, of } while pieces are still missing, { k, value } once the value is whole, or
// { error, status }. Owner always comes from the verified session (never the request).
export async function takePart(q, owner, part) {
  const k = String(part.k || ''), id = String(part.id || '');
  const i = Number(part.i), n = Number(part.n), total = Number(part.total), data = part.data;
  if (!/^[A-Za-z0-9_:.\-]{1,120}$/.test(k) || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return { error: 'Bad piece.', status: 400 };
  if (!Number.isInteger(n) || n < 1 || n > PART_MAX_COUNT || !Number.isInteger(i) || i < 0 || i >= n) return { error: 'Bad piece.', status: 400 };
  if (typeof data !== 'string' || data.length > PART_MAX_CHARS || !Number.isInteger(total) || total < 1 || total > PART_MAX_CHARS * PART_MAX_COUNT) return { error: 'Bad piece.', status: 400 };
  // A piece may not end half way through an emoji (a lone surrogate cannot be stored as text and
  // would come back as a broken character). The app cuts on a whole character; refuse one that did not.
  if (data.length) { const last = data.charCodeAt(data.length - 1), first = data.charCodeAt(0);
    if ((last >= 0xD800 && last <= 0xDBFF) || (first >= 0xDC00 && first <= 0xDFFF)) return { error: 'Bad piece.', status: 400 }; }
  await ensurePartsTable(q);
  if (Math.random() < 0.05) { try { await q`DELETE FROM kv_parts WHERE created_at < now() - interval '1 day'`; } catch (e) {} }
  await q`INSERT INTO kv_parts (owner, upload_id, k, i, n, total, data) VALUES (${owner}, ${id}, ${k}, ${i}, ${n}, ${total}, ${data})
    ON CONFLICT (owner, upload_id, i) DO UPDATE SET data = EXCLUDED.data, k = EXCLUDED.k, n = EXCLUDED.n, total = EXCLUDED.total, created_at = now()`;
  const have = await q`SELECT count(*)::int AS c FROM kv_parts WHERE owner = ${owner} AND upload_id = ${id} AND k = ${k} AND n = ${n} AND total = ${total}`;
  const c = have[0] ? have[0].c : 0;
  if (c < n) return { have: c, of: n };
  const rows = await q`SELECT i, data FROM kv_parts WHERE owner = ${owner} AND upload_id = ${id} AND k = ${k} AND n = ${n} AND total = ${total} ORDER BY i`;
  const value = rows.map(r => r.data).join('');
  await q`DELETE FROM kv_parts WHERE owner = ${owner} AND upload_id = ${id}`;
  // Every piece present but not adding up (a piece from a different attempt): save nothing, the app sends it again.
  if (rows.length !== n || value.length !== total) return { error: 'The pieces did not add up. Nothing was changed.', status: 409, reason: 'parts-mismatch' };
  return { k, value };
}

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
        sendJson(res, { data, count: rows.length });
        return;
      }
      // ?since=<ms> (2026-11-13): send only what CHANGED. Opening the app read her whole workspace every
      // time, 3-4 s on her phone before anything current could be shown. The app keeps the last answer
      // it was sent (device-only) and says when that was (`asOf`, this server's clock, never the phone's).
      // Rows written since then, plus a 10-minute margin for a write that was still committing during
      // that read, come back in full. Every other row comes back as `keep: {key: md5}`, and the app reuses
      // its saved value ONLY when the fingerprint matches; any mismatch and it asks for everything. So a
      // writer that forgets to stamp updated_at costs a full read, never a stale value.
      // Same owner scoping as always: the owner is from the verified token, never the request.
      // Additive: a build that never sends `since` gets `data` exactly as before, plus `h`/`asOf` it ignores.
      let since = Math.floor(Number((req.query && req.query.since) || 0));
      if (!Number.isFinite(since) || since < 0) since = 0;
      const rows = await q`SELECT k, md5(v) AS h, (extract(epoch from now()) * 1000)::bigint AS now_ms,
          (${since}::bigint <= 0 OR updated_at IS NULL
            OR ${since}::bigint > (extract(epoch from now()) * 1000)::bigint
            OR updated_at > to_timestamp(${since}::bigint / 1000.0) - interval '10 minutes') AS fresh,
          CASE WHEN (${since}::bigint <= 0 OR updated_at IS NULL
            OR ${since}::bigint > (extract(epoch from now()) * 1000)::bigint
            OR updated_at > to_timestamp(${since}::bigint / 1000.0) - interval '10 minutes') THEN v END AS v
        FROM kv WHERE owner = ${owner}`;
      const data = {}, h = {}, keep = {};
      let asOf = 0;
      rows.forEach(r => {
        if (!asOf && r.now_ms != null) asOf = Number(r.now_ms) || 0;
        if (r.fresh || !since) { data[r.k] = r.v; h[r.k] = r.h; }
        else keep[r.k] = r.h;
      });
      const out = { data, count: rows.length, h };
      if (asOf) out.asOf = asOf;
      if (since) out.keep = keep;   // only ever sent to a build that asked for it
      const renew = renewedToken(req._scPayload);
      if (renew) out.renew = renew;   // additive: a build that does not read it is unaffected
      sendJson(res, out);
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

      // ONE VALUE SENT IN PIECES (2026-11-18, "ready for 600 providers"). A request may be at most
      // 4.5 MB, so a busy practice's client list (2.9 MB already) would one day be impossible to save
      // at all. The app now sends any value that big as numbered pieces; each piece is kept here,
      // owner-scoped, until the last one arrives, and only then is the whole value put together and
      // saved through EXACTLY the same path as an ordinary save below (history copy, removed-client
      // strip, merges). Nothing is written to the account until every piece is here and the total
      // length matches, so a half-sent value can never replace a whole one. The stored value is the
      // same text as before, so every build, job and screen reads it unchanged.
      if (body.part && typeof body.part === 'object') {
        const pr = await takePart(q, owner, body.part);
        if (pr.error) { res.status(pr.status || 400).json({ error: pr.error, reason: pr.reason || 'part' }); return; }
        if (!pr.value) { res.status(200).json({ ok: true, partial: true, have: pr.have, of: pr.of }); return; }
        items = { [pr.k]: pr.value };
      }
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
      // The delete record just changed: make this account's clients rows agree with it, so a delete
      // whose own request was lost still closes that client's link (lib/clients.js). Owner is the
      // verified session's. Best-effort: the save has already succeeded.
      if (items.sc_deleted_clients != null || items.sc_undeleted_clients != null) {
        try { await reconcileDeletedClients(owner); }
        catch (e) { console.error('[store] client delete reconcile failed (save kept):', e && e.message); }
      }
      res.status(200).json({ ok: true, saved: entries.length });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[store] failed:', e && e.stack || e); res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
