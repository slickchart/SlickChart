// /api/guide-file — storage for provider-uploaded guide files (PDFs, images, docs).
//   PUT    (provider, Bearer)              body { id, name, type, data }  -> upsert
//   DELETE (provider, Bearer)              ?id=...                        -> remove
//   GET    (provider, Bearer) or (client)  ?id=...  [&t=<clientToken>]    -> fetch one file
//
// Files are kept OUT of the synced kv blob because base64 files are too large to ride it
// (they blow the browser storage quota and the request-body limit). A client fetches just
// the one file it needs, authenticated by its own link token, which resolves to the owner.
import { dbEnabled, sql, ensureFilesTable, getFileRow, ensureProvidersTable } from '../lib/db.js';
import { verifyToken, isSessionValid } from '../lib/auth.js';
import { ensureClientTables, getClientByToken } from '../lib/clients.js';

async function providerOwner(req) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret ? verifyToken(token, secret) : null;
  if (!payload) return null;
  try { if (!(await isSessionValid(sql(), payload.sid))) return null; } catch (e) { /* don't lock out on a check failure */ }
  // No tenant claim → treat as unauthenticated rather than defaulting to the shared 'owner' tenant.
  return payload.u || null;
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  try {
    await ensureFilesTable();

    if (req.method === 'PUT' || req.method === 'POST') {
      await ensureProvidersTable();
      const owner = await providerOwner(req);
      if (!owner) { res.status(401).json({ error: 'Not logged in.' }); return; }
      const b = req.body || {};
      const id = String(b.id || '').slice(0, 160);
      if (!id) { res.status(400).json({ error: 'Missing file id.' }); return; }
      const name = b.name ? String(b.name).slice(0, 400) : '';
      const type = b.type ? String(b.type).slice(0, 160) : '';
      const q = sql();

      // ── Chunked upload ────────────────────────────────────────────────────────────────────
      // A 3MB PDF is ~4.2MB once base64'd, which sits right on the platform's request-body limit
      // and on the edge of what one database write finishes inside the function timeout. That is
      // why a handful of a course's attachments failed every time while the rest went through, and
      // why retrying the whole 4MB body never helped. Pieces are small, fast, and cheap to retry.
      //
      // Piece 0 REPLACES the row's data and marks it incomplete; later pieces append in order; the
      // last one marks it complete. Nothing serves the file until then (see getFileRow).
      const part = (b.part && typeof b.part === 'object') ? b.part : null;
      if (part) {
        const index = Math.max(0, Number(part.index) || 0);
        const total = Math.max(1, Number(part.total) || 1);
        const chunk = String(part.data == null ? '' : part.data);
        if (chunk.length > 1200000) { res.status(413).json({ error: 'Chunk too large.' }); return; }
        if (index >= total) { res.status(400).json({ error: 'Bad chunk index.' }); return; }
        const last = (index === total - 1);
        if (index === 0) {
          await q`INSERT INTO files (owner, id, name, type, data, complete, updated_at)
                  VALUES (${owner}, ${id}, ${name}, ${type}, ${chunk}, ${last}, now())
                  ON CONFLICT (owner, id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type,
                    data = EXCLUDED.data, complete = EXCLUDED.complete, updated_at = now()`;
        } else {
          // Append only onto a row that is mid-upload. If piece 0 never landed, or the row was
          // already completed by another attempt, this writes nothing and the client restarts —
          // far better than silently building a corrupt file out of two interleaved attempts.
          const r = await q`UPDATE files SET data = COALESCE(data, '') || ${chunk},
                                   complete = ${last}, updated_at = now()
                             WHERE owner = ${owner} AND id = ${id} AND complete = false
                             RETURNING id`;
          if (!r.length) { res.status(409).json({ error: 'Upload out of sync. Start this file again.' }); return; }
        }
        res.status(200).json({ ok: true, part: index, complete: last });
        return;
      }

      const data = b.data == null ? null : String(b.data);
      // ~7M chars of base64 ≈ 5 MB binary; the client caps uploads well below this.
      if (data && data.length > 7000000) { res.status(413).json({ error: 'File too large.' }); return; }
      await q`INSERT INTO files (owner, id, name, type, data, complete, updated_at)
              VALUES (${owner}, ${id}, ${name}, ${type}, ${data}, true, now())
              ON CONFLICT (owner, id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, data = EXCLUDED.data, complete = true, updated_at = now()`;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      await ensureProvidersTable();
      const owner = await providerOwner(req);
      if (!owner) { res.status(401).json({ error: 'Not logged in.' }); return; }
      const id = String((req.query && req.query.id) || '').slice(0, 160);
      if (id) { const q = sql(); await q`DELETE FROM files WHERE owner = ${owner} AND id = ${id}`; }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'GET') {
      // Recovery list (provider only): metadata for every backed-up PROGRESS PHOTO (ids are 'ph_...').
      // Used by Settings → Recover lost photos to find photo bytes still on the server whose local index
      // reference was lost (e.g. the index got rebuilt from an empty in-memory set after a refresh), so
      // they can be pulled back even though nothing local points at them anymore. Bytes are NOT included
      // here — the client fetches just the ids it's missing, one by one.
      if (req.query && String(req.query.list) === 'photos') {
        await ensureProvidersTable();
        const owner = await providerOwner(req);
        if (!owner) { res.status(401).json({ error: 'Not logged in.' }); return; }
        const q = sql();
        const rows = await q`SELECT id, type, updated_at, length(coalesce(data, '')) AS size
          FROM files WHERE owner = ${owner} AND left(id, 3) = 'ph_' AND data IS NOT NULL
          ORDER BY updated_at DESC LIMIT 5000`;
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ ok: true, photos: (rows || []).map(r => ({ id: r.id, type: r.type || '', size: Number(r.size) || 0, updated_at: r.updated_at })) });
        return;
      }
      // Which file ids this provider has ON THE SERVER, with sizes and no bytes. The device keeps a
      // local cache of these bytes so lesson files open instantly offline; on a phone that has filled
      // up, that cache is the first thing that should go, and the only safe way to drop a copy is to
      // know the server still has it. Settings → Free up space uses exactly this list.
      if (req.query && String(req.query.list) === 'files') {
        await ensureProvidersTable();
        const owner = await providerOwner(req);
        if (!owner) { res.status(401).json({ error: 'Not logged in.' }); return; }
        const q = sql();
        const rows = await q`SELECT id, length(coalesce(data, '')) AS size
          FROM files WHERE owner = ${owner} AND data IS NOT NULL AND complete IS NOT FALSE AND left(id, 3) <> 'ph_'
          ORDER BY updated_at DESC LIMIT 20000`;
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ ok: true, files: (rows || []).map(r => ({ id: r.id, size: Number(r.size) || 0 })) });
        return;
      }
      const id = String((req.query && req.query.id) || '').slice(0, 160);
      if (!id) { res.status(400).json({ error: 'Missing file id.' }); return; }
      let owner = null;
      const t = (req.query && req.query.t) || '';
      if (t) {
        // Client path: the link token identifies which provider's file to serve.
        await ensureClientTables();
        const c = await getClientByToken(String(t));
        if (!c) { res.status(404).json({ error: 'This link is not valid.' }); return; }
        owner = c.provider_id;
        // Authorize: a client may only fetch files actually shared WITH them. The set of file ids a
        // client can legitimately request equals the fileId/guideId values in their own synced data
        // blob (that's the only place they learn an id). Without this, any of a provider's clients
        // could read any of that provider's files by id (intra-tenant access).
        let cdata = c.data; if (typeof cdata === 'string') { try { cdata = JSON.parse(cdata); } catch (e) { cdata = {}; } }
        const allowed = new Set();
        (function walk(o) {
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o)) { for (const v of o) walk(v); return; }
          for (const k in o) {
            const v = o[k];
            // 'pid' is how a shared before/after photo is referenced (progressPhotos, and each animal's
            // own set for an owner with several). It was missing here, so a client asking for a photo
            // that IS in their own blob got a 404 and the grid stayed empty. Same rule as the others:
            // only ids that appear in THIS client's data are fetchable, so nothing widens across clients.
            if ((k === 'fileId' || k === 'guideId' || k === 'pid') && typeof v === 'string' && v) allowed.add(v);
            else if (v && typeof v === 'object') walk(v);
          }
        })(cdata || {});
        if (!allowed.has(id)) { res.status(404).json({ error: 'File not found.' }); return; }
      } else {
        await ensureProvidersTable();
        owner = await providerOwner(req);
        if (!owner) { res.status(401).json({ error: 'Not logged in.' }); return; }
      }
      const row = await getFileRow(owner, id);
      if (!row || !row.data) { res.status(404).json({ error: 'File not found.' }); return; }
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.status(200).json({ ok: true, file: { id: row.id, name: row.name || '', type: row.type || '', data: row.data } });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[guide-file] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
