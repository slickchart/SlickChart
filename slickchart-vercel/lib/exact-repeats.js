// Drop rows that are byte-for-byte repeats of an earlier row in a top-level list (2026-11-18,
// moved here 2026-11-22 so api/store.js can use it with no other dependency).
//
// Until build 2026-11-18a two merges on the device put the account's copy and the device's copy of a
// list side by side on every sync, so sc_autos and sc_imported_products doubled each time. Only a row
// identical to an earlier one (id included) is removed, so two rows that differ in one letter both
// stay. Returns the new JSON text, or null when nothing repeats (or the value is not a list).
export function dedupeExact(str) {
  let v; try { v = JSON.parse(str); } catch (e) { return null; }
  if (!Array.isArray(v)) return null;
  let hit = false;
  const seen = new Set(), out = [];
  for (const r of v) { const k = JSON.stringify(r); if (seen.has(k)) { hit = true; continue; } seen.add(k); out.push(r); }
  return hit ? JSON.stringify(out) : null;
}
