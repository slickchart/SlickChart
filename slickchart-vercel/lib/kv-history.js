// VERSION HISTORY for a provider's own work. The safety net under every merge.
//
// Why this exists, in Ashley's words: "this has happened several times where something happens and
// it loses all my clients summaries, notes, things we have made as providers and you can't get
// them back." Every fix before this one was the same shape — a field turned out not to be
// protected, and we only learned which field after a provider lost it. Diana's summaries, Riquelle's
// forms, Heather's horse links, then Heather's notes. Each fix was correct and each arrived too
// late for the person who paid for it.
//
// So this does not try to be another correct merge. It assumes the next merge bug exists and has
// not been found, and makes it RECOVERABLE: before a write shrinks one of her libraries, the old
// value is kept. "We can't get it back" stops being true.
//
// WHAT IS KEPT, and why it does not grow without bound:
//   shrink — the incoming value holds FEWER entries than the stored one, or is much smaller. That
//            is the exact signature of every incident above, so these are the valuable ones.
//            Newest 8 per key.
//   daily  — the first write of each UTC day, so there is always a "yesterday" to go back to even
//            when the loss happened gradually. Newest 14 per key.
// Nothing is kept for a write that grows or leaves a library the same size, which is almost all of
// them. A quiet day costs one row per key.
import { sql } from './db.js';

let _ready = false;
export async function ensureHistoryTable() {
  if (_ready) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS kv_history (
    id bigserial PRIMARY KEY,
    owner text NOT NULL,
    k text NOT NULL,
    v text,
    bytes integer,
    items integer,
    reason text,
    saved_at timestamptz DEFAULT now()
  )`;
  await q`CREATE INDEX IF NOT EXISTS kv_history_owner_k_at ON kv_history (owner, k, saved_at DESC)`;
  _ready = true;
}

// The keys worth keeping history for: the libraries a provider BUILDS. Settings are excluded — they
// are one record, cheap to retype, and keeping versions of them would be most of the storage for
// none of the value. sc_clients is the important one: chart notes live there and nowhere else.
export const TRACKED = {
  sc_clients: 1, sc_session_summaries: 1, sc_client_recs: 1, sc_client_homecare: 1,
  sc_body_maps: 1, sc_note_drafts: 1, sc_summary_drafts: 1, sc_rec_reasons: 1,
  sc_pro_vc_invites: 1, sc_summary_guides: 1, sc_workspace: 1, sc_forms: 1,
  sc_courses: 1, sc_resources: 1, sc_protocols: 1, sc_docs: 1, sc_msgstore: 1,
  sc_affiliate_links: 1, sc_service_menu: 1, sc_reminders: 1, sc_msg_templates: 1,
  sc_routines: 1, sc_sent_routines: 1, sc_photo_index: 1, sc_inventory: 1
};

// device-snapshot is kept deepest on purpose: it is the only copy that came off a device rather
// than out of the account, so it is the one that can still hold work the account never received.
const KEEP_SHRINK = 8, KEEP_DAILY = 14, KEEP_DEVICE = 10, KEEP_BACKUP = 20;

// How much is IN a value. Top-level entries is the headline number — "47 clients became 9" is
// unambiguous where bytes are not, because a loader normalising keys moves bytes around.
export function itemCount(str) {
  if (str == null) return 0;
  try {
    const v = JSON.parse(String(str));
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === 'object') return Object.keys(v).length;
    return 0;
  } catch (e) { return 0; }
}
// ...but the count alone misses the worst case. These libraries are mostly {clientId: [things]},
// and the damage that actually happened to Diana was SIX CLIENTS STILL THERE with every summary
// list emptied — identical top-level count, everything gone. So weight counts one level in as
// well: top-level entries, plus the length of any array inside them. 6 clients holding 12
// summaries weighs 18; the same 6 clients holding none weighs 6.
export function contentWeight(str) {
  if (str == null) return 0;
  try {
    const v = JSON.parse(String(str));
    if (Array.isArray(v)) return v.length;
    if (!v || typeof v !== 'object') return 0;
    let n = 0;
    for (const k of Object.keys(v)) {
      n++;
      const inner = v[k];
      if (Array.isArray(inner)) n += inner.length;
      else if (inner && typeof inner === 'object') n += Object.keys(inner).length;
    }
    return n;
  } catch (e) { return 0; }
}

// Is this write worth keeping the old value for? Returns the reason, or ''.
// `lastDaily` is the saved_at of the newest daily row for this key, or null.
export function snapshotReason(oldVal, newVal, lastDaily, now) {
  if (oldVal == null || oldVal === '') return '';
  const oldItems = itemCount(oldVal);
  // Nothing in it to lose. A settings blob or a scalar lands here and is never kept.
  if (oldItems < 1) return '';
  if (String(oldVal) === String(newVal)) return '';
  const newItems = itemCount(newVal);
  const oldBytes = String(oldVal).length, newBytes = newVal == null ? 0 : String(newVal).length;
  // THE SIGNATURE, in order of how clearly it says "something was lost":
  if (newItems < oldItems) return 'shrink';                                    // entries removed
  if (contentWeight(newVal) < contentWeight(oldVal)) return 'shrink';          // emptied in place
  if (oldBytes > 2048 && newBytes < oldBytes * 0.75) return 'shrink';          // text gutted
  // Otherwise keep one a day, so there is always a yesterday.
  const t = now || Date.now();
  if (!lastDaily || (t - new Date(lastDaily).getTime()) > 20 * 3600 * 1000) return 'daily';
  return '';
}

// Snapshot the CURRENT stored values for these keys, before they are overwritten. One round trip to
// read, one to write, whatever the batch size — the store endpoint PUTs up to a few dozen keys at
// once and a query per key would make every save slower for everyone.
export async function snapshotBeforeWrite(owner, items) {
  const keys = Object.keys(items || {}).filter(k => TRACKED[k]);
  if (!keys.length) return { saved: 0 };
  const q = sql();
  await ensureHistoryTable();
  let rows = [];
  try { rows = await q`SELECT k, v FROM kv WHERE owner=${owner} AND k = ANY(${keys})`; }
  catch (e) { return { saved: 0, error: 'read' }; }
  if (!rows.length) return { saved: 0 };
  let lastDaily = {};
  try {
    const d = await q`SELECT k, max(saved_at) AS at FROM kv_history
      WHERE owner=${owner} AND k = ANY(${keys}) AND reason='daily' GROUP BY k`;
    (d || []).forEach(r => { lastDaily[r.k] = r.at; });
  } catch (e) {}
  const now = Date.now();
  let saved = 0;
  for (const r of rows) {
    const reason = snapshotReason(r.v, items[r.k], lastDaily[r.k], now);
    if (!reason) continue;
    try {
      await q`INSERT INTO kv_history (owner, k, v, bytes, items, reason)
        VALUES (${owner}, ${r.k}, ${r.v}, ${String(r.v || '').length}, ${itemCount(r.v)}, ${reason})`;
      saved++;
      await pruneKey(owner, r.k);
    } catch (e) { /* history must never break a save */ }
  }
  return { saved };
}

// A DEVICE'S OWN COPY, captured before sync can touch it.
//
// The case this exists for: a provider loses work on one device, and another device — a computer
// that has been closed for a week — still has the real thing sitting on its disk. The moment she
// opens it, it syncs, and whatever the merge decides is final. If the merge gets it wrong, the
// last good copy in existence is gone and nobody ever knew it was there.
//
// So before a pull applies anything, a device that holds MORE than the account does sends its copy
// here. This writes ONLY to history, never to kv: it is not an opinion about who should win, it is
// a photograph taken before the argument starts. The merge then runs exactly as it would have.
export async function rescueDeviceCopy(owner, items) {
  const keys = Object.keys(items || {}).filter(k => TRACKED[k]);
  if (!keys.length) return { saved: 0 };
  const q = sql();
  await ensureHistoryTable();
  let saved = 0;
  for (const k of keys) {
    const v = items[k];
    if (v == null || String(v).length < 2) continue;
    const n = itemCount(v);
    if (n < 1) continue;
    try {
      // Don't stack identical photographs: if the newest device-snapshot for this key is already
      // byte-identical, one is enough.
      const prev = await q`SELECT v FROM kv_history WHERE owner=${owner} AND k=${k}
        AND reason='device-snapshot' ORDER BY saved_at DESC LIMIT 1`;
      if (prev.length && String(prev[0].v) === String(v)) continue;
      await q`INSERT INTO kv_history (owner, k, v, bytes, items, reason)
        VALUES (${owner}, ${k}, ${String(v)}, ${String(v).length}, ${n}, 'device-snapshot')`;
      saved++;
      await pruneKey(owner, k);
    } catch (e) { /* a rescue must never break the boot it runs in */ }
  }
  return { saved };
}

// Keep the newest few of each reason and drop the rest. Done per key as it grows rather than as a
// sweep, so there is no cron to forget and no unbounded table.
export async function pruneKey(owner, k) {
  const q = sql();
  try {
    await q`DELETE FROM kv_history WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY reason ORDER BY saved_at DESC) AS rn
          FROM kv_history WHERE owner=${owner} AND k=${k}
      ) ranked
      WHERE (rn > ${KEEP_SHRINK}) )
      AND reason='shrink' AND owner=${owner} AND k=${k}`;
    await q`DELETE FROM kv_history WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY reason ORDER BY saved_at DESC) AS rn
          FROM kv_history WHERE owner=${owner} AND k=${k}
      ) ranked
      WHERE (rn > ${KEEP_DAILY}) )
      AND reason='daily' AND owner=${owner} AND k=${k}`;
    await q`DELETE FROM kv_history WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY reason ORDER BY saved_at DESC) AS rn
          FROM kv_history WHERE owner=${owner} AND k=${k}
      ) ranked
      WHERE (rn > ${KEEP_DEVICE}) )
      AND reason='device-snapshot' AND owner=${owner} AND k=${k}`;
    // from-backup rows came out of a point-in-time branch during a real incident. They are the
    // deepest-kept of all, because there is no way to make another one once the branch is gone.
    await q`DELETE FROM kv_history WHERE id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY reason ORDER BY saved_at DESC) AS rn
          FROM kv_history WHERE owner=${owner} AND k=${k}
      ) ranked
      WHERE (rn > ${KEEP_BACKUP}) )
      AND reason='from-backup' AND owner=${owner} AND k=${k}`;
  } catch (e) {}
}

// What is available to go back to. Metadata only — never the stored value.
export async function listHistory(owner, k) {
  const q = sql();
  await ensureHistoryTable();
  if (k) {
    return await q`SELECT id, k, bytes, items, reason, saved_at FROM kv_history
      WHERE owner=${owner} AND k=${k} ORDER BY saved_at DESC LIMIT 40`;
  }
  return await q`SELECT id, k, bytes, items, reason, saved_at FROM kv_history
    WHERE owner=${owner} ORDER BY saved_at DESC LIMIT 200`;
}

// Put one version back. The CURRENT value is snapshotted first, so a restore is itself undoable —
// the one thing worse than losing data is a recovery tool that loses the only remaining copy.
export async function restoreVersion(owner, id) {
  const q = sql();
  await ensureHistoryTable();
  const rows = await q`SELECT k, v, items FROM kv_history WHERE id=${Number(id)} AND owner=${owner}`;
  if (!rows.length) return { ok: false, error: 'That version is not there any more.' };
  const { k, v } = rows[0];
  const cur = await q`SELECT v FROM kv WHERE owner=${owner} AND k=${k}`;
  if (cur.length) {
    try {
      await q`INSERT INTO kv_history (owner, k, v, bytes, items, reason)
        VALUES (${owner}, ${k}, ${cur[0].v}, ${String(cur[0].v || '').length}, ${itemCount(cur[0].v)}, 'before-restore')`;
    } catch (e) { return { ok: false, error: 'Could not keep a copy of the current version, so nothing was changed.' }; }
  }
  await q`INSERT INTO kv (owner, k, v, updated_at) VALUES (${owner}, ${k}, ${v}, now())
    ON CONFLICT (owner, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
  return { ok: true, key: k, items: itemCount(v) };
}
