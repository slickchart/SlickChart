// GET /api/admin/square-create-log — FOUNDER-ONLY, READ-ONLY.
//
// Answers the one question left about the recurring imports: WHAT is creating customers in the founder's
// Square? Every SlickChart customer-create is recorded (provider_id, merchant_id, endpoint) with no PII.
// This returns only the rows that landed in the FOUNDER's OWN merchant, so it can't expose another
// provider's activity. Each row says which login (provider_id) made it and through which endpoint —
// and flags any whose provider_id is NOT the founder (a create on the founder's merchant driven by a
// DIFFERENT account's login, which would be the cross-account bug caught red-handed).
import { dbEnabled, sql, ensureSquareCreateLog } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }

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
  const me = String(payload.u);

  try {
    await ensureSquareCreateLog();
    const q = sql();
    const meRows = await q`SELECT merchant_id FROM square_connections WHERE provider_id=${me}`;
    const mid = meRows[0] && meRows[0].merchant_id;
    if (!mid) { res.status(200).json({ ok: true, merchantId: null, note: 'No Square merchant connected to your account.', recent: [], last24h: {}, foreignCreators: [] }); return; }

    // Only creates that landed in MY merchant. No customer PII is stored, so this is who/where/how only.
    const rows = await q`SELECT provider_id, endpoint, existing, created_at
      FROM square_create_log WHERE merchant_id=${mid} ORDER BY id DESC LIMIT 200`;

    const now = Date.now();
    const within24 = (r) => r.created_at && (now - new Date(r.created_at).getTime()) <= 86400000;
    const recent = (rows || []).map(r => ({
      providerId: r.provider_id,
      endpoint: r.endpoint || '',
      existing: !!r.existing,
      at: r.created_at ? new Date(r.created_at).getTime() : 0,
      isSelf: String(r.provider_id) === me
    }));

    // 24h summary by endpoint (new creates only, not "matched existing"), and the SMOKING GUN:
    // any create on my merchant whose login was NOT me.
    const last24 = recent.filter(r => within24({ created_at: r.at }));
    const byEndpoint = {};
    for (const r of last24) { if (r.existing) continue; const k = r.endpoint || 'unknown'; byEndpoint[k] = (byEndpoint[k] || 0) + 1; }
    const foreignCreators = Array.from(new Set(last24.filter(r => !r.isSelf).map(r => r.providerId).filter(Boolean)));

    res.status(200).json({
      ok: true,
      merchantId: mid,
      myProviderId: me,
      created24hByEndpoint: byEndpoint,
      created24hTotal: last24.filter(r => !r.existing).length,
      foreignCreators,               // provider ids (not you) that created in YOUR merchant in 24h — should be empty
      recent: recent.slice(0, 60)
    });
  } catch (e) {
    console.error('[admin/square-create-log] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
