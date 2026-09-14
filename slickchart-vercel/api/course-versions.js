// /api/course-versions — the safety net under the course builder.
//
// Why this exists: a course used to live in exactly one place, the synced `sc_courses` blob. If that
// blob went wrong — a bad merge, a mis-aimed delete, a device whose localStorage was full so the write
// never landed — hours of work were simply gone, with nothing underneath to fall back on. Ashley lost
// the same course close to ten times. That is an architecture problem, not a bug to patch again.
//
// So every save (and every autosave while the builder is open) also writes an immutable snapshot here.
// Snapshots are append-only and DELETING A COURSE DOES NOT DELETE THEM — that is the whole point, since
// a wrong delete is one of the ways work disappeared. Recovery stops depending on luck.
//
// The payload is the course record only. Lesson file BYTES live in their own store and are referenced
// by id, so even a course with hundreds of attachments snapshots to a few KB.
//
//   GET  /api/course-versions            -> { versions: [ {id,courseId,title,kind,ts,lessons,bytes} ] }
//   GET  /api/course-versions?id=123     -> { version: { ..., payload } }
//   POST /api/course-versions            body { courseId, title, payload, kind? } -> { ok, id }
//
// Every query is filtered by the owner taken from the VERIFIED session token and nothing else
// (CLAUDE.md §0.1) — courseId comes from the request, so it can only ever address rows this owner
// already owns.
import { sql, ensureProvidersTable, ensureCourseVersionsTable, dbEnabled } from '../lib/db.js';
import { verifyToken, isSessionValid } from '../lib/auth.js';

// Same gate as /api/store, including the fail-closed check on `u`: a token without an explicit tenant
// claim is rejected rather than defaulted to the shared owner tenant.
async function requireLogin(req, res, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret ? verifyToken(token, secret) : null;
  if (!payload) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  try {
    if (!(await isSessionValid(q, payload.sid))) {
      res.status(401).json({ error: 'This session has been signed out. Please log in again.' });
      return null;
    }
  } catch (e) { /* if the check itself fails, don't lock people out over it */ }
  if (!payload.u) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  return payload.u;
}

const MAX_PAYLOAD = 1500000;   // ~1.5MB of JSON. A real course is a few KB; this is an abuse stop.
const KEEP_SAVES = 20;         // per course
const KEEP_DRAFTS = 3;         // per course — autosaves are a crash net, not a history

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ ok: true, versions: [], note: 'Database not configured.' }); return; }
  await ensureProvidersTable();
  const q0 = sql();
  const owner = await requireLogin(req, res, q0);
  if (!owner) return;

  try {
    await ensureCourseVersionsTable();
    const q = sql();

    if (req.method === 'GET') {
      const idRaw = (req.query && req.query.id) || '';
      const id = Number(String(idRaw).replace(/[^0-9]/g, ''));
      if (id > 0) {
        const rows = await q`SELECT id, course_id, title, kind, payload,
                                    extract(epoch from created_at) * 1000 AS ts
                               FROM course_versions
                              WHERE owner = ${owner} AND id = ${id}`;
        if (!rows.length) { res.status(404).json({ error: 'Not found.' }); return; }
        const r = rows[0];
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ ok: true, version: {
          id: Number(r.id), courseId: r.course_id, title: r.title || '', kind: r.kind || 'save',
          ts: Math.round(Number(r.ts)), payload: r.payload
        } });
        return;
      }
      // The list deliberately does not ship payloads — a provider with a dozen courses would pull
      // megabytes just to render a list of dates.
      const rows = await q`SELECT id, course_id, title, kind,
                                  length(payload) AS bytes,
                                  extract(epoch from created_at) * 1000 AS ts
                             FROM course_versions
                            WHERE owner = ${owner}
                            ORDER BY created_at DESC
                            LIMIT 400`;
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, versions: rows.map(r => ({
        id: Number(r.id), courseId: r.course_id, title: r.title || '', kind: r.kind || 'save',
        bytes: Number(r.bytes || 0), ts: Math.round(Number(r.ts))
      })) });
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
      const courseId = String(body.courseId || '').trim().slice(0, 200);
      const title = String(body.title || '').trim().slice(0, 300);
      const kind = String(body.kind || 'save') === 'draft' ? 'draft' : 'save';
      let payload = body.payload;
      if (payload && typeof payload === 'object') { try { payload = JSON.stringify(payload); } catch (e) { payload = ''; } }
      payload = String(payload || '');
      if (!courseId || !payload) { res.status(400).json({ error: 'Nothing to snapshot.' }); return; }
      if (payload.length > MAX_PAYLOAD) { res.status(413).json({ error: 'Snapshot too large.' }); return; }

      // Don't stack identical snapshots — an autosave timer on an untouched builder would otherwise
      // push the real history out of the keep-window.
      const last = await q`SELECT payload FROM course_versions
                            WHERE owner = ${owner} AND course_id = ${courseId} AND kind = ${kind}
                            ORDER BY created_at DESC LIMIT 1`;
      if (last.length && last[0].payload === payload) { res.status(200).json({ ok: true, unchanged: true }); return; }

      const ins = await q`INSERT INTO course_versions (owner, course_id, title, kind, payload)
                          VALUES (${owner}, ${courseId}, ${title}, ${kind}, ${payload})
                          RETURNING id`;

      // Prune this course's own history only. Saves and autosaves are kept separately so a burst of
      // autosaves can never evict the real saved versions.
      const keep = kind === 'draft' ? KEEP_DRAFTS : KEEP_SAVES;
      try {
        await q`DELETE FROM course_versions
                 WHERE owner = ${owner} AND course_id = ${courseId} AND kind = ${kind}
                   AND id NOT IN (
                     SELECT id FROM course_versions
                      WHERE owner = ${owner} AND course_id = ${courseId} AND kind = ${kind}
                      ORDER BY created_at DESC LIMIT ${keep}
                   )`;
      } catch (e) { /* pruning is housekeeping; never fail a snapshot over it */ }

      res.status(200).json({ ok: true, id: Number(ins[0] && ins[0].id) || 0 });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[course-versions] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
