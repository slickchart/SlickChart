// Exact-repeat clean-up for account values (2026-11-18).
//
// Until build 2026-11-18a two merges on the device put the account's copy and the device's copy of a
// list side by side on every sync, so sc_autos and sc_imported_products grew by megabytes a day
// (85 MB on one iPhone) and their saves were refused as too large. A device on the new build shrinks
// its own copy when it opens; this does the same for the ACCOUNT copy, for every provider, at once.
//
// It only ever removes a row that is byte-for-byte the same as an earlier row in the same list (id
// included), so nothing a provider made can be lost: two automations that differ in one letter both
// stay. The value before the change is saved to kv_history (reason 'dedupe') first, and the write only
// happens if the value has not changed since it was read.
import { ensureHistoryTable, itemCount } from './kv-history.js';

// The value with exact repeat rows removed, or null when nothing repeats. Top-level LISTS only: a
// per-client map (messages, summaries) can legitimately hold two identical entries, and none of those
// were what grew, so the account copy of a map is never touched here. Shared with api/store.js.
import { dedupeExact } from './exact-repeats.js';
export { dedupeExact };

// minBytes: only look at values at least this big (the repeats that matter are the big ones).
// apply: false = report only.
export async function dedupeAccounts(q, { minBytes = 100000, apply = false, limit = 400 } = {}) {
  const rows = await q`SELECT owner, k, octet_length(v)::bigint AS bytes FROM kv
    WHERE octet_length(v) >= ${minBytes} AND left(ltrim(v), 1) = '[' ORDER BY octet_length(v) DESC LIMIT ${limit}`;
  if (apply) await ensureHistoryTable();
  const found = [];
  for (const r of rows) {
    try {
      const cur = await q`SELECT v, md5(v) AS h FROM kv WHERE owner = ${r.owner} AND k = ${r.k}`;
      if (!cur[0] || cur[0].v == null) continue;
      const old = cur[0].v, nv = dedupeExact(old);
      if (nv == null || nv.length >= old.length) continue;
      const row = { owner: r.owner, k: r.k, before: old.length, after: nv.length, itemsBefore: itemCount(old), itemsAfter: itemCount(nv), applied: false };
      if (apply) {
        await q`INSERT INTO kv_history (owner, k, v, bytes, items, reason) VALUES (${r.owner}, ${r.k}, ${old}, ${old.length}, ${row.itemsBefore}, 'dedupe')`;
        const u = await q`UPDATE kv SET v = ${nv}, updated_at = now() WHERE owner = ${r.owner} AND k = ${r.k} AND md5(v) = ${cur[0].h} RETURNING k`;
        row.applied = u.length === 1;
      }
      found.push(row);
    } catch (e) { found.push({ owner: r.owner, k: r.k, error: String((e && e.message) || e).slice(0, 120) }); }
  }
  return { scanned: rows.length, found };
}
