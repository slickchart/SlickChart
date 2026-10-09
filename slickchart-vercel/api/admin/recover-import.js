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

  // WHERE THE BACKUP CONNECTION STRING COMES FROM.
  //
  // `sourceUrl` in the body is the normal way, and it exists to spare the owner an environment
  // variable and two redeploys in the middle of an incident. Her reaction to the env-var version
  // was "this feels very confusing and like a lot of work", and she was right: make the branch,
  // paste the string, done. RECOVERY_DATABASE_URL still works for an unattended run.
  //
  // It is a CREDENTIAL. It arrives over TLS on a founder-gated route, is used and discarded, is
  // never stored, and is NEVER written to a log or echoed in a response — which is also why the
  // preview is a POST: a query string lands in access logs. Nothing below may log `src`.
  const bodySrc = String((req.body && req.body.sourceUrl) || '').trim();
  const srcList = (bodySrc || String(process.env.RECOVERY_DATABASE_URL || ''))
    .split(',').map(x => x.trim()).filter(Boolean);
  if (!srcList.length) {
    res.status(200).json({ ok: true, configured: false, needsUrl: true,
      hint: 'Paste the connection string of a Neon branch taken from before the loss.' });
    return;
  }
  // A connection string is a credential. Only ever label a branch by something safe to show.
  const labelOf = (cs, i) => {
    try {
      const host = String(cs).split('@')[1] || '';
      const first = host.split('.')[0] || '';
      return first ? first.slice(0, 40) : ('backup ' + (i + 1));
    } catch (e) { return 'backup ' + (i + 1); }
  };

  const email = norm((req.query && req.query.email) || (req.body && req.body.email) || '');
  if (!email) { res.status(400).json({ error: 'Pass the provider email.' }); return; }

  const q = sql();

  try {
    await ensureProvidersTable(); await ensureTable(); await ensureHistoryTable();

    // The provider id is resolved on the LIVE database, then used to read the branch. Doing it the
    // other way round would let a stale branch decide which account we write history into.
    const pr = await q`SELECT id, email, name FROM providers WHERE lower(email) = ${email}`;
    if (!pr.length) { res.status(404).json({ error: 'No provider with that email.' }); return; }
    const owner = String(pr[0].id);

    const liveRows = await q`SELECT k, v FROM kv WHERE owner = ${owner}`;
    const live = {}; liveRows.forEach(r => { live[r.k] = r.v; });

    // Read every branch. One unreachable branch reports itself and does not stop the others —
    // during an incident, a partial answer now beats a complete answer after another redeploy.
    const branches = [];
    for (let i = 0; i < srcList.length; i++) {
      const label = labelOf(srcList[i], i);
      let rows = null, err = '';
      try { rows = await neon(srcList[i])`SELECT k, v FROM kv WHERE owner = ${owner}`; }
      // Scrubbed: a driver error can quote the DSN it was handed, password and all.
      catch (e) { err = String((e && e.message) || 'could not be read').replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]').slice(0, 120); }
      if (!rows) { branches.push({ label, error: err, keys: [] }); continue; }
      const byKey = {}; rows.forEach(r => { byKey[r.k] = r.v; });
      const keys = rows.filter(r => TRACKED[r.k]).map(r => ({
        key: r.k,
        backupItems: itemCount(r.v), backupWeight: contentWeight(r.v), backupBytes: String(r.v || '').length,
        liveItems: itemCount(live[r.k]), liveWeight: contentWeight(live[r.k]), liveBytes: String(live[r.k] || '').length
      })).map(x => Object.assign(x, { worthIt: x.backupWeight > x.liveWeight || x.backupItems > x.liveItems
        // Same shape, materially more text in it: notes that were emptied rather than removed.
        || (x.backupWeight === x.liveWeight && x.backupBytes > x.liveBytes * 1.1 && x.backupBytes > 512) }))
        .sort((a, b) => (b.backupWeight - b.liveWeight) - (a.backupWeight - a.liveWeight));
      branches.push({ label, keys, worth: keys.filter(x => x.worthIt).length,
        totalWeight: keys.reduce((n, x) => n + x.backupWeight, 0),
        totalBytes: keys.reduce((n, x) => n + x.backupBytes, 0), _byKey: byKey });
    }
    // Richest first, because that is the branch to look at. Weight decides it, and BYTES break the
    // tie — weight counts entries, and the damage here was notes emptied INSIDE records that all
    // still existed, so two branches can weigh exactly the same while one of them has her writing
    // in it and the other does not. Ranking on weight alone put the emptier branch first.
    branches.sort((a, b) =>
      ((b.totalWeight || 0) - (a.totalWeight || 0)) || ((b.totalBytes || 0) - (a.totalBytes || 0)));

    if (req.method === 'GET' || (req.body && req.body.preview)) {
      res.status(200).json({ ok: true, configured: true, provider: { id: owner, email: pr[0].email },
        branches: branches.map(b => ({ label: b.label, error: b.error, worth: b.worth,
          totalWeight: b.totalWeight, totalBytes: b.totalBytes, keys: b.keys })),
        // The best branch's keys, so a caller that only understands one backup still works.
        keys: (branches[0] && branches[0].keys) || [], worth: (branches[0] && branches[0].worth) || 0 });
      return;
    }

    if (req.method === 'POST') {
      // Import from the named branch, or from the richest one when none is named.
      const wantLabel = String((req.body && req.body.branch) || '').trim();
      const chosen = wantLabel ? branches.find(b => b.label === wantLabel) : branches.find(b => !b.error);
      if (!chosen || chosen.error) { res.status(400).json({ error: 'That backup could not be read.' }); return; }
      const want = Array.isArray(req.body && req.body.importKeys) ? req.body.importKeys.map(String) : null;
      const pick = (chosen.keys || []).filter(x => (want ? want.indexOf(x.key) >= 0 : x.worthIt));
      if (!pick.length) { res.status(400).json({ error: 'Nothing worth importing was selected.' }); return; }
      const byKey = chosen._byKey || {};
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
      res.status(200).json({ ok: true, imported: done.length, keys: done, branch: chosen.label,
        note: 'Imported as restorable versions. Nothing live was changed — review them under Earlier copies and put back what you want.' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    // Only the message, never the stack or anything carrying the connection string. A Neon driver
    // error can quote the DSN it was handed, password included, straight into the log.
    console.error('[recover-import] failed:', (e && e.message) ? String(e.message).slice(0, 120) : 'error');
    res.status(500).json({ error: 'Import failed.' });
  }
}
