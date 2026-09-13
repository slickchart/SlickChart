// GET /api/admin/build-buyers[?format=csv]  → owner-only: the Build Your Own App buyer list.
//
// This is the list Ashley is building for later. It is kept entirely separate from the SlickChart
// provider list and the SlickChart Resend audience — two products, two audiences.
//
// The CSV carries a Marketing column with three states, not two: yes, no, and "not asked". Purchases
// made before the checkout tickbox existed are "not asked", which is NOT consent. Only the "yes" rows
// are safe to market to; the export says so in the file itself so that distinction can't get lost
// between here and a mail tool months from now.
//
// Owner gate copies the waitlist export's: FOUNDER/OWNER identity comes from the VERIFIED session
// token, never from anything in the request (CLAUDE.md §0.5).
import { sql, ensureProvidersTable, ensureBuildPurchasesTable, dbEnabled } from '../../lib/db.js';
import { verifyToken } from '../../lib/auth.js';
import { excludedBuyerEmails } from '../../lib/build-sales.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: true, count: 0, items: [], note: 'Database not configured.' }); return; }
  try {
    await ensureProvidersTable();
    const q = sql();

    const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
    const p = claims(req);
    let you = p.e ? String(p.e).toLowerCase() : null;
    if (!you && p.u) {
      try { const r = await q`SELECT email FROM providers WHERE id = ${p.u}`; you = (r[0] && r[0].email) ? String(r[0].email).toLowerCase() : null; } catch (e) {}
    }
    if (!owner || you !== owner) { res.status(403).json({ error: 'Owner only' }); return; }

    await ensureBuildPurchasesTable();
    // One row per buyer, not per purchase: a repeat buyer is still one person on a mailing list.
    const rows = await q`SELECT
        lower(email) AS email,
        bool_or(marketing_opt_in) FILTER (WHERE marketing_opt_in IS NOT NULL) AS opt_in,
        count(*)::int AS purchases,
        COALESCE(sum(amount_cents), 0)::bigint AS cents,
        extract(epoch from min(created_at)) * 1000 AS first_ts
      FROM build_purchases
      WHERE email IS NOT NULL AND email <> ''
        AND lower(email) <> ALL(${excludedBuyerEmails()}::text[])
      GROUP BY lower(email)
      ORDER BY min(created_at) DESC
      LIMIT 5000`;

    const marketingLabel = v => (v === true ? 'yes' : v === false ? 'no' : 'not asked');

    const fmt = (req.query && req.query.format) || (/format=csv/.test(req.url || '') ? 'csv' : '');
    if (fmt === 'csv') {
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const head = 'Email,Marketing,Purchases,Paid,First purchase\n';
      const body = rows.map(r => [
        r.email,
        marketingLabel(r.opt_in),
        r.purchases,
        '$' + (Number(r.cents || 0) / 100).toFixed(2),
        new Date(Number(r.first_ts)).toISOString().slice(0, 10)
      ].map(esc).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="build-your-own-app-buyers.csv"');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(head + body);
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      count: rows.length,
      optedIn: rows.filter(r => r.opt_in === true).length,
      items: rows.map(r => ({
        email: r.email,
        marketing: marketingLabel(r.opt_in),
        purchases: r.purchases,
        cents: Number(r.cents || 0),
        ts: Math.round(Number(r.first_ts))
      }))
    });
  } catch (e) {
    console.error('[admin/build-buyers] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
