// GET /api/admin/kv-health?email=<provider email>  — FOUNDER-ONLY, READ-ONLY, METADATA ONLY.
//
// Answers one question, fast: are this provider's saves actually reaching the server, and when?
//
// A provider reported business hours, branding and forms reverting after every save. Two rounds of
// fixes went out on theories (a full device; a screen with two Save buttons) and neither was it. The
// thing nobody could see is whether her saves landed at all — if the server row is fresh, the write
// works and the bug is on the way back down; if it is stale or missing, the push is failing and
// everything downstream is a distraction. Guessing has cost her three days.
//
// PRIVACY (CLAUDE.md §0): this NEVER returns a stored value. Only the key name, its size in bytes,
// when the row was last written, and — for the three settings blobs that carry one — the `_ts` the
// app stamped inside, which is a timestamp and nothing else. A provider's business details, client
// list and form contents are hers; diagnosing a sync bug does not require reading any of it, so it
// doesn't. Anything added here later must keep that line.
//
// Owner-only, resolved from the VERIFIED token's email — never from anything in the request.
import { dbEnabled, sql, ensureTable, ensureProvidersTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }

// The keys this bug is about, plus the ones whose behaviour explains it.
const WATCH = ['sc_bizinfo', 'sc_wsname', 'sc_availability', 'sc_brand_colors', 'sc_forms'];
// Keys whose app-written payload carries a `_ts` stamp (see _stampNow / _mergeStamped).
const STAMPED = { sc_bizinfo: 1, sc_availability: 1, sc_brand_colors: 1 };

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  if (!payload || !payload.u) { res.status(401).json({ error: 'Not logged in.' }); return; }
  const q = sql();
  try { if (payload.sid && !(await isSessionValid(q, payload.sid))) { res.status(401).json({ error: 'Session expired.' }); return; } } catch (e) {}
  const me = norm(payload.e);
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!me || !founders.includes(me)) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }

  const email = norm((req.query && req.query.email) || '');
  if (!email) { res.status(400).json({ error: 'Pass ?email=<provider email>' }); return; }

  try {
    await ensureProvidersTable();
    await ensureTable();
    const pr = await q`SELECT id, email, created_at FROM providers WHERE lower(email) = ${email}`;
    if (!pr.length) { res.status(404).json({ error: 'No provider with that email.' }); return; }
    const owner = pr[0].id;

    // Sizes and write times for everything this account holds, values left where they are.
    const rows = await q`SELECT k, length(coalesce(v,'')) AS bytes, updated_at
                           FROM kv WHERE owner = ${owner} ORDER BY updated_at DESC`;
    // The `_ts` the app stamped inside the three settings blobs. Read one at a time and pulled out
    // with a JSON path so no value text is ever selected into this function.
    const stamps = {};
    for (const k of Object.keys(STAMPED)) {
      try {
        const s = await q`SELECT (v::jsonb ->> '_ts') AS ts FROM kv WHERE owner = ${owner} AND k = ${k}`;
        if (s.length) stamps[k] = s[0].ts ? Number(s[0].ts) : null;
      } catch (e) { stamps[k] = 'unreadable'; }
    }

    const now = Date.now();
    const ago = t => (t ? Math.round((now - new Date(t).getTime()) / 1000) : null);
    const byKey = {};
    (rows || []).forEach(r => { byKey[r.k] = { bytes: Number(r.bytes || 0), writtenSecondsAgo: ago(r.updated_at), at: r.updated_at }; });

    const watched = WATCH.map(k => {
      const r = byKey[k];
      const out = { key: k, onServer: !!r };
      if (r) { out.bytes = r.bytes; out.writtenSecondsAgo = r.writtenSecondsAgo; out.writtenAt = r.at; }
      if (k in STAMPED) {
        out.appStamp = (k in stamps) ? stamps[k] : null;
        // A stamped blob whose `_ts` is far older than the row's own write time means the last thing
        // written was NOT a fresh edit from the app — it was an older copy pushed back over it.
        if (r && typeof out.appStamp === 'number') out.appStampSecondsAgo = Math.round((now - out.appStamp) / 1000);
      }
      return out;
    });

    // Sessions tell us whether this account can even authenticate a push right now.
    let sessions = null;
    try {
      const ss = await q`SELECT count(*) FILTER (WHERE NOT revoked AND created_at > now() - interval '30 days') AS live,
                                count(*) AS total, max(last_seen_at) AS seen
                           FROM sessions WHERE provider_id = ${owner}`;
      sessions = { live: Number(ss[0].live || 0), total: Number(ss[0].total || 0), lastSeenSecondsAgo: ago(ss[0].seen) };
    } catch (e) { /* sessions table may not exist on older deployments */ }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      provider: { email: pr[0].email, signedUpAt: pr[0].created_at },
      note: 'Metadata only — no stored values are read or returned.',
      totalKeys: rows.length,
      totalBytes: (rows || []).reduce((n, r) => n + Number(r.bytes || 0), 0),
      watched,
      sessions,
      allKeys: (rows || []).slice(0, 80).map(r => ({ key: r.k, bytes: Number(r.bytes || 0), writtenSecondsAgo: ago(r.updated_at) }))
    });
  } catch (e) {
    console.error('[kv-health] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
