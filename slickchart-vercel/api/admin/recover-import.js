// /api/admin/recover-import — FOUNDER-ONLY. Pull a provider's work out of a Neon point-in-time
// branch and offer it back as restorable versions.
//
// Ashley: "if her notes were once in the server we should be able to figure out how to get them
// back." Then: "they were never gone before today." That second sentence is what makes this
// possible — the loss is inside Neon's history retention window, so the database itself still
// holds the state from before it.
//
// HOW IT IS MEANT TO BE USED
//   1. In the Neon console, create a BRANCH from a timestamp before the loss. A branch freezes
//      that state permanently, so it survives the retention window expiring. Do this FIRST; the
//      window is a clock and it is the only part of this that cannot be undone by waiting.
//   2. Put that branch's connection string in Vercel as RECOVERY_DATABASE_URL, and redeploy.
//   3. GET here to see what the branch holds for that provider. POST to import it.
//   4. Remove RECOVERY_DATABASE_URL afterwards.
//
// WHAT IT WILL NOT DO: it never writes to the live `kv` table. Everything it finds goes into
// `kv_history` as a `from-backup` version, which then appears under "Earlier copies" on the
// recovery screen for a human to look at and put back deliberately. An import that silently
// overwrote live data would be the same class of mistake that caused all of this.
import { dbEnabled, sql, ensureTable, ensureProvidersTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { ensureHistoryTable, itemCount, contentWeight, TRACKED, pruneKey } from '../../lib/kv-history.js';
import { neon } from '@neondatabase/serverless';

function norm(s) { return String(s || '').trim().toLowerCase(); }

async function requireFounder(req, res) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  if (!payload || !payload.u) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  try { if (payload.sid && !(await isSessionValid(sql(), payload.sid))) { res.status(401).json({ error: 'Session expired.' }); return null; } } catch (e) {}
  const me = norm(payload.e);
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!me || !founders.includes(me)) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return null; }
  return me;
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const founder = await requireFounder(req, res);
  if (!founder) return;

  const src = String(process.env.RECOVERY_DATABASE_URL || '').trim();
  if (!src) {
    res.status(200).json({ ok: true, configured: false,
      hint: 'Set RECOVERY_DATABASE_URL in Vercel to a Neon branch created from before the loss, then redeploy.' });
    return;
  }

  const email = norm((req.query && req.query.email) || (req.body && req.body.email) || '');
  if (!email) { res.status(400).json({ error: 'Pass the provider email.' }); return; }

  const q = sql();
  let from;
  try { from = neon(src); }
  catch (e) { res.status(400).json({ error: 'That recovery connection string could not be used.' }); return; }

  try {
    await ensureProvidersTable(); await ensureTable(); await ensureHistoryTable();

    // The provider id is resolved on the LIVE database, then used to read the branch. Doing it the
    // other way round would let a stale branch decide which account we write history into.
    const pr = await q`SELECT id, email, name FROM providers WHERE lower(email) = ${email}`;
    if (!pr.length) { res.status(404).json({ error: 'No provider with that email.' }); return; }
    const owner = String(pr[0].id);

    // What the branch holds, and what is live now, side by side. Counts only.
    let oldRows = [];
    try { oldRows = await from`SELECT k, v FROM kv WHERE owner = ${owner}`; }
    catch (e) { res.status(502).json({ error: 'Could not read the recovery branch: ' + (e && e.message || 'failed') }); return; }
    const liveRows = await q`SELECT k, v FROM kv WHERE owner = ${owner}`;
    const live = {}; liveRows.forEach(r => { live[r.k] = r.v; });

    const compare = oldRows
      .filter(r => TRACKED[r.k])
      .map(r => ({
        key: r.k,
        backupItems: itemCount(r.v), backupWeight: contentWeight(r.v), backupBytes: String(r.v || '').length,
        liveItems: itemCount(live[r.k]), liveWeight: contentWeight(live[r.k]), liveBytes: String(live[r.k] || '').length
      }))
      // Only the ones where the backup is actually BETTER are worth importing. A key that is the
      // same or richer live is noise, and offering it would bury the rows that matter.
      .map(x => Object.assign(x, { worthIt: x.backupWeight > x.liveWeight || x.backupItems > x.liveItems }))
      .sort((a, b) => (b.backupWeight - b.liveWeight) - (a.backupWeight - a.liveWeight));

    if (req.method === 'GET') {
      res.status(200).json({ ok: true, configured: true, provider: { id: owner, email: pr[0].email },
        keys: compare, worth: compare.filter(x => x.worthIt).length });
      return;
    }

    if (req.method === 'POST') {
      const want = Array.isArray(req.body && req.body.importKeys) ? req.body.importKeys.map(String) : null;
      const pick = compare.filter(x => (want ? want.indexOf(x.key) >= 0 : x.worthIt));
      if (!pick.length) { res.status(400).json({ error: 'Nothing worth importing was selected.' }); return; }
      const byKey = {}; oldRows.forEach(r => { byKey[r.k] = r.v; });
      const done = [];
      for (const x of pick) {
        const v = byKey[x.key];
        if (v == null) continue;
        try {
          await q`INSERT INTO kv_history (owner, k, v, bytes, items, reason)
            VALUES (${owner}, ${x.key}, ${String(v)}, ${String(v).length}, ${itemCount(v)}, 'from-backup')`;
          await pruneKey(owner, x.key);
          done.push({ key: x.key, items: itemCount(v) });
        } catch (e) { /* one bad key must not lose the rest */ }
      }
      res.status(200).json({ ok: true, imported: done.length, keys: done,
        note: 'Imported as restorable versions. Nothing live was changed — review them under Earlier copies and put back what you want.' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[recover-import] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Import failed.' });
  }
}
