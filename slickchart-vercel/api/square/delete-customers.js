// POST /api/square/delete-customers  { ids: ["<squareCustomerId>", ...] }
// Permanently deletes the given customers from the CALLER'S OWN connected Square account.
//
// Safety: routes through sqContext, which (after the cross-account hardening) resolves ONLY the
// logged-in provider's own OAuth Square connection — never a shared/deployment token. So this can never
// delete from another merchant's account: an account with no own Square connection just gets 401.
// Capped per request; the client batches. Each id is deleted independently and reported, so one bad id
// (already gone, wrong type) doesn't abort the rest.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;   // 401 written already if no own Square

  let body = {};
  try { body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}'); } catch (e) {}
  const ids = Array.isArray(body.ids) ? body.ids.map(x => String(x || '').trim()).filter(Boolean).slice(0, 200) : [];
  if (!ids.length) { res.status(400).json({ error: 'No customer ids provided.' }); return; }

  const deleted = [];
  const failed = [];
  for (const id of ids) {
    try {
      await _sqf('/v2/customers/' + encodeURIComponent(id), { method: 'DELETE' }, ctx.token);
      deleted.push(id);
    } catch (e) {
      // A 404 means it's already gone — treat as done, not a failure, so re-runs are clean.
      if (e && e.status === 404) deleted.push(id);
      else failed.push({ id, error: (e && e.message) || 'delete failed' });
    }
  }
  res.status(200).json({ ok: true, deleted, deletedCount: deleted.length, failed });
}
