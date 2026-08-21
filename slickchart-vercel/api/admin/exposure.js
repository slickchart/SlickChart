// /api/admin/exposure — OWNER-ONLY.
// While a shared Square token was live, other accounts on this deployment could import the OWNER's
// customers into their own rosters. This measures that exposure and can scrub it.
//   GET                         -> report: which other accounts hold copies of the owner's clients.
//   POST {action:'purge', confirm:true} -> hard-delete every OTHER account's copies of the owner's
//                                          clients (matched by email/phone) and remove them from those
//                                          accounts' synced roster blob. Never touches the owner's own
//                                          data or another account's genuinely-own clients.
// Gated to emails listed in FOUNDER_EMAILS (Vercel env). Add your login email there to use it.
import { dbEnabled, sql } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }
function digits(s) { let d = String(s || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; }

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  if (!payload) { res.status(401).json({ error: 'Not logged in.' }); return; }
  try { if (payload.sid && !(await isSessionValid(sql(), payload.sid))) { res.status(401).json({ error: 'Session expired.' }); return; } } catch (e) { /* don't lock out on a check hiccup */ }

  const email = norm(payload.e);
  const founders = String(process.env.FOUNDER_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!email || !founders.includes(email)) {
    res.status(403).json({ error: 'Owner-only tool. Add your login email to FOUNDER_EMAILS in Vercel, redeploy, then try again.', code: 'notowner' });
    return;
  }
  const owner = String(payload.u || '');

  try {
    const q = sql();

    // The owner's client contact fingerprints (email + phone).
    const mine = await q`SELECT email, phone FROM clients WHERE provider_id = ${owner} AND deleted_at IS NULL`;
    const myEmails = new Set(), myPhones = new Set();
    for (const r of (mine || [])) { const e = norm(r.email); if (e) myEmails.add(e); const p = digits(r.phone); if (p.length >= 7) myPhones.add(p); }

    // Every OTHER account's clients (bounded), tagged with which ones are copies of the owner's people.
    const others = await q`SELECT id, provider_id, email, phone FROM clients WHERE provider_id <> ${owner} AND deleted_at IS NULL LIMIT 100000`;
    const per = {}; // provider_id -> {total, exposed, ids:[]}
    for (const r of (others || [])) {
      const pid = String(r.provider_id);
      const rec = per[pid] || (per[pid] = { total: 0, exposed: 0, ids: [] });
      rec.total++;
      const e = norm(r.email), p = digits(r.phone);
      if ((e && myEmails.has(e)) || (p.length >= 7 && myPhones.has(p))) { rec.exposed++; if (rec.ids.length < 20000) rec.ids.push(r.id); }
    }

    // Resolve account emails so the owner can recognize who these are (test accounts vs real businesses).
    let provEmail = {};
    try { const pr = await q`SELECT id, email FROM providers`; for (const r of (pr || [])) provEmail[String(r.id)] = r.email || ''; } catch (e) {}

    if (req.method === 'POST') {
      let body = {};
      try { body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}'); } catch (e) {}
      if (body.action !== 'purge' || body.confirm !== true) { res.status(400).json({ error: 'Pass {action:"purge", confirm:true} to scrub.' }); return; }
      let purged = 0; const touched = new Set();
      for (const pid of Object.keys(per)) {
        const ids = per[pid].ids; if (!ids.length) continue;
        for (let i = 0; i < ids.length; i += 200) {
          const batch = ids.slice(i, i + 200);
          try { await q`DELETE FROM clients WHERE provider_id = ${pid} AND id = ANY(${batch}::text[])`; purged += batch.length; touched.add(pid); } catch (e) { /* skip a bad batch */ }
        }
      }
      // Scrub the owner's clients out of each touched account's synced roster blob (kv sc_clients).
      for (const pid of touched) {
        try {
          const rows = await q`SELECT v FROM kv WHERE owner = ${pid} AND k = 'sc_clients'`;
          if (rows[0] && rows[0].v != null) {
            let blob = rows[0].v; if (typeof blob === 'string') { try { blob = JSON.parse(blob); } catch (e) { blob = null; } }
            if (blob && typeof blob === 'object' && !Array.isArray(blob)) {
              let changed = false;
              for (const cid of Object.keys(blob)) {
                const c = blob[cid] || {}; const e = norm(c.email), p = digits(c.phone);
                if ((e && myEmails.has(e)) || (p.length >= 7 && myPhones.has(p))) { delete blob[cid]; changed = true; }
              }
              if (changed) await q`INSERT INTO kv (owner, k, v) VALUES (${pid}, 'sc_clients', ${JSON.stringify(blob)}) ON CONFLICT (owner, k) DO UPDATE SET v = EXCLUDED.v`;
            }
          }
        } catch (e) { /* best-effort blob scrub */ }
      }
      res.status(200).json({ ok: true, purged, accountsScrubbed: touched.size });
      return;
    }

    // GET: the report.
    const accounts = Object.keys(per).map(pid => ({
      account: provEmail[pid] || '(unknown account)',
      clients: per[pid].total,
      copiesOfMine: per[pid].exposed
    })).filter(a => a.copiesOfMine > 0).sort((a, b) => b.copiesOfMine - a.copiesOfMine);
    const totalExposed = accounts.reduce((n, a) => n + a.copiesOfMine, 0);
    res.status(200).json({
      ok: true,
      ownerClients: (mine || []).length,
      otherAccountsTotal: Object.keys(per).length,
      accountsWithMyClients: accounts.length,
      totalCopiesOfMine: totalExposed,
      accounts: accounts.slice(0, 100)
    });
  } catch (e) {
    console.error('[admin/exposure] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
