// GET /api/admin/square-foreign — FOUNDER-ONLY, READ-ONLY.
//
// Finds which of the founder's Square customers actually belong to a DIFFERENT provider's SlickChart
// account — the reliable "this isn't my client, it's someone else's that leaked in" signal. From inside
// Square these look identical to the founder's own clients (same contact info), but the SlickChart
// database knows who created/owns each person: if a customer's email or phone matches a client row under
// another provider_id, that customer is that other provider's, not the founder's.
//
// Deletes nothing. Returns the count + the Square customer IDs that match another provider, so the
// cleanup tool can flag exactly those for review. Cross-provider matching is founder-gated and returns
// only the founder's OWN customer IDs — never another provider's data.
import { dbEnabled, sql } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }
function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  if (!payload || !payload.u) { res.status(401).json({ error: 'Not logged in.' }); return; }
  try { if (payload.sid && !(await isSessionValid(sql(), payload.sid))) { res.status(401).json({ error: 'Session expired.' }); return; } } catch (e) {}
  const email = norm(payload.e);
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!email || !founders.includes(email)) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }

  // The founder's own Square connection (never a shared token).
  const ctx = await sqContext(req, res); if (!ctx) return;
  const me = String(ctx.providerId);
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    // 1) Pull the founder's Square customers (id, email, phone).
    const custs = [];
    let cursor = '', guard = 0;
    do {
      const qs = new URLSearchParams({ limit: '100' }); if (cursor) qs.set('cursor', cursor);
      const d = await sf('/v2/customers?' + qs.toString());
      for (const c of (d.customers || [])) custs.push({ id: c.id, email: norm(c.email_address), phone: digits(c.phone_number) });
      cursor = d.cursor || '';
    } while (cursor && ++guard < 80);

    const emails = Array.from(new Set(custs.map(c => c.email).filter(e => e && /.+@.+\..+/.test(e))));
    const phones = Array.from(new Set(custs.map(c => c.phone).filter(p => p && p.length >= 10)));

    // 2) Which of those contacts exist as a client under ANOTHER provider? One query, arrays bound.
    const q = sql();
    const foreignEmails = new Set(), foreignPhones = new Set();
    const otherProviders = new Set();
    if (emails.length || phones.length) {
      const rows = await q`
        SELECT provider_id,
               lower(email) AS e,
               regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') AS p
        FROM clients
        WHERE provider_id <> ${me}
          AND deleted_at IS NULL
          AND ( lower(email) = ANY(${emails}::text[])
             OR regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ANY(${phones}::text[]) )`;
      for (const r of (rows || [])) {
        if (r.e && /.+@.+\..+/.test(r.e)) foreignEmails.add(r.e);
        if (r.p && r.p.length >= 10) foreignPhones.add(r.p);
        if (r.provider_id) otherProviders.add(r.provider_id);
      }
    }

    // 3) Flag the founder's customers whose email or phone belongs to another provider.
    const foreignIds = [];
    for (const c of custs) {
      if ((c.email && foreignEmails.has(c.email)) || (c.phone && foreignPhones.has(c.phone))) foreignIds.push(c.id);
    }

    res.status(200).json({
      ok: true,
      totalCustomers: custs.length,
      foreignCount: foreignIds.length,
      otherProviderCount: otherProviders.size,
      foreignIds
    });
  } catch (e) {
    console.error('[admin/square-foreign] failed:', e && e.message || e);
    res.status(e.status || 500).json({ error: e.message || 'Something went wrong.' });
  }
}
