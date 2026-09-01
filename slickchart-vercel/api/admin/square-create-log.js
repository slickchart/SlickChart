// GET /api/admin/square-create-log — FOUNDER-ONLY, READ-ONLY.
//
// Names WHAT is creating customers in the founder's Square. Every SlickChart customer-create is recorded
// two ways: at the endpoint level (with the acting provider id + merchant) and at the universal squareFetch
// backstop (with a fingerprint of the token used — never the token). This resolves those fingerprints
// against the known per-provider OAuth tokens, so it can say, for each creation in the FOUNDER's merchant,
// whether it was made by the founder's own login, ANOTHER provider's login, or a RAW token that belongs to
// no login at all (e.g. the app's static Production Access Token) — the cross-account smoking gun.
import { dbEnabled, sql, ensureSquareCreateLog } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { tokenFingerprint } from '../../lib/square.js';
import { decrypt } from '../../lib/crypto.js';

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

    // Build a fingerprint → login map from every connected provider's OWN token, plus provider emails and
    // each provider's merchant. A create whose token fingerprint isn't in here was made by a RAW token.
    const fpToProvider = {};      // fp -> providerId
    const provMerchant = {};      // providerId -> merchant_id
    try {
      const conns = await q`SELECT provider_id, access_token, merchant_id FROM square_connections`;
      for (const c of (conns || [])) {
        provMerchant[String(c.provider_id)] = c.merchant_id || null;
        try { const at = decrypt(c.access_token); if (at) fpToProvider[tokenFingerprint(at)] = String(c.provider_id); } catch (e) {}
      }
    } catch (e) {}
    const provEmail = {};
    try { const pr = await q`SELECT id, email FROM providers`; for (const r of (pr || [])) provEmail[String(r.id)] = r.email || ''; } catch (e) {}

    // Last 24h of creates (both endpoint rows and squarefetch fingerprint rows).
    const rows = await q`SELECT provider_id, merchant_id, endpoint, existing, created_at
      FROM square_create_log WHERE created_at >= now() - interval '24 hours' ORDER BY id DESC LIMIT 3000`;

    // Resolve each create to: creator (a login email, or "RAW TOKEN"), and the merchant it landed in.
    const creators = {};          // key: creatorLabel -> { count, merchants:Set }
    let intoMyMerchant = 0; const intoMyMerchantBy = {};
    for (const r of (rows || [])) {
      if (r.existing) continue;                    // "matched an existing customer" is not a creation
      let creatorId = null, creatorLabel = 'unknown';
      const pid = String(r.provider_id || '');
      if (pid.startsWith('fp:')) {
        const fp = pid.slice(3);
        creatorId = fpToProvider[fp] || null;
        creatorLabel = creatorId ? (provEmail[creatorId] || ('provider ' + creatorId)) : 'RAW TOKEN (no login — e.g. a static access token)';
      } else if (pid) {
        creatorId = pid;
        creatorLabel = provEmail[pid] || ('provider ' + pid);
      }
      // Which merchant did this create land in? Prefer the merchant recorded on the row; else the creator's.
      const landed = r.merchant_id || (creatorId ? provMerchant[creatorId] : null) || null;
      const c = creators[creatorLabel] || (creators[creatorLabel] = { count: 0, merchants: {} });
      c.count++; if (landed) c.merchants[landed] = (c.merchants[landed] || 0) + 1;
      if (mid && landed && String(landed) === String(mid)) { intoMyMerchant++; intoMyMerchantBy[creatorLabel] = (intoMyMerchantBy[creatorLabel] || 0) + 1; }
    }

    const byCreator = Object.keys(creators).map(k => ({
      creator: k,
      isYou: !!(provEmail[me] && k === provEmail[me]),
      created: creators[k].count,
      merchants: Object.keys(creators[k].merchants).map(m => ({ merchant: m, count: creators[k].merchants[m], isYourMerchant: !!(mid && String(m) === String(mid)) }))
    })).sort((a, b) => b.created - a.created);

    res.status(200).json({
      ok: true,
      merchantId: mid || null,
      myProviderId: me,
      intoMyMerchant24h: intoMyMerchant,                 // customers created IN YOUR Square in 24h (any token)
      intoMyMerchantBy,                                  // ...broken down by who did it
      byCreator                                          // every creator in 24h, what they created + where it landed
    });
  } catch (e) {
    console.error('[admin/square-create-log] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
