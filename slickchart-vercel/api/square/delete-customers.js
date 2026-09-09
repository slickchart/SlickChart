// POST /api/square/delete-customers  { ids: ["<squareCustomerId>", ...] }
// Permanently deletes the given customers from the CALLER'S OWN connected Square account.
//
// Safety: routes through sqContext, which (after the cross-account hardening) resolves ONLY the
// logged-in provider's own OAuth Square connection — never a shared/deployment token. So this can never
// delete from another merchant's account: an account with no own Square connection just gets 401. The ids
// in the body are NOT an authorization input — they're only ever spent against the caller's own token, so
// an id belonging to another merchant simply comes back NOT_FOUND.
//
// Uses Square's BulkDeleteCustomers (POST /v2/customers/bulk-delete), which takes up to 100 ids per call
// and returns a per-id map of results. That's ~100x fewer round trips than deleting one at a time, which
// is what makes clearing a few thousand injected profiles finish inside a serverless request instead of
// timing out part-way through. Each id is still reported individually, so one bad id (already gone, has
// appointments attached) never aborts the rest.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

const BULK_MAX = 100;   // Square's hard limit on customer_ids per bulk-delete call.

// Turn one id's entry in the bulk response map into a verdict.
// A successful delete is an EMPTY object ({}), not a missing key — a missing key means Square didn't
// report on that id at all, which we treat as a failure rather than assuming success.
function verdict(entry) {
  if (!entry) return { ok: false, error: 'Square did not report a result for this id.' };
  const errs = Array.isArray(entry.errors) ? entry.errors : [];
  if (!errs.length) return { ok: true };
  // Already gone — treat as done, not a failure, so re-runs of a partly-finished cleanup are clean.
  if (errs.some(e => e && e.code === 'NOT_FOUND')) return { ok: true };
  const e0 = errs[0] || {};
  return { ok: false, error: e0.detail || e0.code || 'delete failed' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;   // 401 written already if no own Square

  let body = {};
  try { body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}'); } catch (e) {}
  // De-dupe: a repeated id in one batch would otherwise be counted twice in the totals shown to the owner.
  const ids = Array.isArray(body.ids)
    ? Array.from(new Set(body.ids.map(x => String(x || '').trim()).filter(Boolean))).slice(0, 500)
    : [];
  if (!ids.length) { res.status(400).json({ error: 'No customer ids provided.' }); return; }

  const deleted = [];
  const failed = [];

  for (let i = 0; i < ids.length; i += BULK_MAX) {
    const chunk = ids.slice(i, i + BULK_MAX);
    try {
      const out = await _sqf('/v2/customers/bulk-delete', { method: 'POST', body: { customer_ids: chunk } }, ctx.token);
      const map = (out && out.responses) || {};
      for (const id of chunk) {
        const v = verdict(map[id]);
        if (v.ok) deleted.push(id); else failed.push({ id, error: v.error });
      }
    } catch (e) {
      // The whole bulk call failed (transient Square error, rate limit, an API version without the bulk
      // endpoint). Don't drop the chunk on the floor — fall back to the one-at-a-time deletes this
      // endpoint used to do, so the cleanup still makes progress and each id gets its own verdict.
      for (const id of chunk) {
        try {
          await _sqf('/v2/customers/' + encodeURIComponent(id), { method: 'DELETE' }, ctx.token);
          deleted.push(id);
        } catch (e2) {
          if (e2 && e2.status === 404) deleted.push(id);
          else failed.push({ id, error: (e2 && e2.message) || 'delete failed' });
        }
      }
    }
  }

  res.status(200).json({ ok: true, deleted, deletedCount: deleted.length, failed });
}
