// /api/admin/client-recover — FOUNDER-ONLY. Get a provider's clients back.
//
// Heather (the equestrian provider) reported 4 clients down to 2, with session summaries, notes and
// photos gone. Nobody could see WHERE her data actually was, and on this bug class guessing has
// already cost days (§1b). So this answers it from the database, in order:
//
//   1. Are her client ROWS still there? The server NEVER hard-deletes a provider's client —
//      markClientDeleted only sets deleted_at, and listClients filters on it. A "missing" client is
//      almost always a row that is still sitting there with all its data.
//   2. Is her DATA still in those rows? clients.data holds the whole assembled blob per client:
//      summaries, forms, profile, progress-photo refs — and `animals`, which is each HORSE with its
//      own name, treatment, summaries and photo refs. Nothing in the app has ever READ that column
//      back (GET /api/clients returns only the roster columns), so it is an untouched backup.
//   3. Is the roster blob (kv sc_clients) and the per-client kv maps still there, and how big?
//
// Then it offers exactly two actions, both narrow and both reversible:
//   POST {email, restoreIds:[...]}  — clear deleted_at on those rows. Undone by deleting again.
//   POST {email, exportIds:[...]}   — return the FULL data blob for those clients, so the records can
//                                     be rebuilt by hand if the roster itself is beyond repair.
//
// PRIVACY (CLAUDE.md §0). The diagnosis returns client NAMES and COUNTS but no record content —
// a name is how the founder tells one client from another, which is the whole task; the notes are
// not needed to decide what to restore. The export DOES return content, because recovering it is
// the point, and it is therefore an explicit, per-id action and never part of the diagnosis.
// Owner-only, resolved from the VERIFIED token's email — never from anything in the request (§0.5).
import { dbEnabled, sql, ensureTable, ensureProvidersTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { ensureClientTables } from '../../lib/clients.js';

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

// How much is in one client's stored blob. Counts only — see the privacy note above.
function describe(dataRaw) {
  let d = null;
  try { d = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw; } catch (e) { return { unreadable: true }; }
  if (!d || typeof d !== 'object') return { empty: true };
  const arr = x => (Array.isArray(x) ? x.length : 0);
  const animals = Array.isArray(d.animals) ? d.animals : [];
  const p = (d.profile && typeof d.profile === 'object') ? d.profile : {};
  return {
    summaries: arr(d.summaries),
    forms: arr(d.forms),
    pendingForms: arr(d.pendingForms),
    progressPhotos: arr(d.progressPhotos),
    products: arr(d.products),
    // The fields a provider actually types into a chart. "Has a chart" is more useful than a
    // field list when deciding whether a row is worth restoring.
    profileFilled: ['skin', 'concerns', 'allergies', 'fitz', 'treatment'].filter(k => String(p[k] || '').trim()).length,
    // `id` here is the HORSE'S OWN CLIENT ID — _animalsOf() finds CL records whose ownerId is this
    // client, so an animal entry is a client record. That is what makes "did this client vanish, or
    // did it become a horse under an owner?" answerable rather than guessable (see nestedUnder).
    animals: animals.map(a => ({
      id: String((a && a.id) || ''),
      name: String((a && a.name) || ''),
      species: String((a && a.species) || ''),
      summaries: arr(a && a.summaries),
      progressPhotos: arr(a && a.progressPhotos),
      treatment: String((a && a.treatment) || '') ? 1 : 0
    }))
  };
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const founder = await requireFounder(req, res);
  if (!founder) return;
  const q = sql();

  const email = norm((req.query && req.query.email) || (req.body && req.body.email) || '');
  if (!email) { res.status(400).json({ error: 'Pass the provider email.' }); return; }

  try {
    await ensureProvidersTable();
    await ensureTable();
    await ensureClientTables();
    const pr = await q`SELECT id, email, name FROM providers WHERE lower(email) = ${email}`;
    if (!pr.length) { res.status(404).json({ error: 'No provider with that email.' }); return; }
    const owner = String(pr[0].id);

    if (req.method === 'POST') {
      const body = req.body || {};
      const restoreIds = Array.isArray(body.restoreIds) ? body.restoreIds.slice(0, 500).map(String) : [];
      const exportIds = Array.isArray(body.exportIds) ? body.exportIds.slice(0, 50).map(String) : [];

      if (restoreIds.length) {
        // Scoped to THIS provider, and only rows that are actually tombstoned. A client who erased
        // their OWN data (deleteClientData) has had their PII scrubbed and their token revoked —
        // un-deleting that row would resurrect an account they asked to be rid of, so those are
        // excluded by requiring the row to still carry a name.
        const done = [];
        for (const id of restoreIds) {
          const r = await q`UPDATE clients SET deleted_at=NULL, updated_at=${Date.now()}
            WHERE id=${id} AND provider_id=${owner} AND deleted_at IS NOT NULL
              AND coalesce(name,'') <> ''
            RETURNING id, name`;
          if (r && r.length) done.push({ id: r[0].id, name: r[0].name });
        }
        res.status(200).json({ ok: true, restored: done.length, clients: done });
        return;
      }

      if (exportIds.length) {
        const out = [];
        for (const id of exportIds) {
          const r = await q`SELECT id, name, email, phone, deleted_at, updated_at, data
            FROM clients WHERE id=${id} AND provider_id=${owner}`;
          if (r && r.length) out.push(r[0]);
        }
        res.status(200).json({ ok: true, clients: out });
        return;
      }

      res.status(400).json({ error: 'Pass restoreIds or exportIds.' });
      return;
    }

    // ── GET: the diagnosis ───────────────────────────────────────────────────
    // data is a jsonb column, so it has to be cast before coalesce/length — `coalesce(data,'')`
    // fails with "invalid input syntax for type json" and 500s the whole lookup. Caught by
    // scripts/test-client-recover.mjs against a real PostgreSQL; it would have been invisible here.
    const rows = await q`SELECT id, name, deleted_at, updated_at, invited_at,
      length(coalesce(data::text,'')) AS bytes, data
      FROM clients WHERE provider_id=${owner} ORDER BY lower(coalesce(name,''))`;

    const clients = (rows || []).map(r => ({
      id: r.id,
      name: r.name || '',
      deleted: !!r.deleted_at,
      deletedAt: r.deleted_at ? Number(r.deleted_at) : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
      bytes: Number(r.bytes || 0),
      has: describe(r.data)
    }));

    // The roster blob the app actually RENDERS, plus the per-client libraries. Sizes and the ids
    // inside sc_clients only — enough to say whether the account's roster agrees with the table.
    const kvRows = await q`SELECT k, length(coalesce(v,'')) AS bytes, updated_at FROM kv
      WHERE owner=${owner} ORDER BY updated_at DESC`;
    const kv = {};
    (kvRows || []).forEach(r => { kv[r.k] = { bytes: Number(r.bytes || 0), at: r.updated_at }; });

    // Which client ids the account's ROSTER blob knows about. Pulled out with a JSON path so no
    // record text is selected into this function.
    let rosterIds = null, rosterShape = null;
    try {
      const rk = await q`SELECT jsonb_typeof(v::jsonb) AS kind FROM kv WHERE owner=${owner} AND k='sc_clients'`;
      if (rk.length) {
        rosterShape = rk[0].kind;
        if (rosterShape === 'object') {
          const ks = await q`SELECT jsonb_object_keys(v::jsonb) AS id FROM kv WHERE owner=${owner} AND k='sc_clients'`;
          rosterIds = (ks || []).map(x => String(x.id));
        } else if (rosterShape === 'array') {
          const ks = await q`SELECT e->>'id' AS id FROM kv, jsonb_array_elements(v::jsonb) e
            WHERE owner=${owner} AND k='sc_clients'`;
          rosterIds = (ks || []).map(x => String(x.id)).filter(Boolean);
        }
      }
    } catch (e) { rosterShape = 'unreadable'; console.error('[client-recover] roster read:', e && e.message); }

    // The delete record the DEVICE pushed up. If a client is tombstoned on the server, this says
    // whether a device asked for it — which is the difference between "she deleted them" and
    // "something deleted them for her".
    let deletedRecord = null;
    try {
      const dr = await q`SELECT jsonb_object_keys(v::jsonb) AS id FROM kv
        WHERE owner=${owner} AND k='sc_deleted_clients'`;
      deletedRecord = (dr || []).map(x => String(x.id));
    } catch (e) { deletedRecord = null; }

    let events = 0;
    try { const ev = await q`SELECT count(*)::int AS n FROM client_events WHERE provider_id=${owner}`; events = (ev[0] && ev[0].n) || 0; } catch (e) {}

    // Which clients are now listed as a HORSE under another client. On the equestrian account this
    // is the whole question: "4 clients became 2" reads as catastrophic loss, but if the 2 that
    // stopped showing are now horses nested under their owners, nothing was lost and restoring rows
    // would achieve nothing — the charts just moved a level down. Only the database can settle it.
    const nestedUnder = {};
    clients.forEach(c => {
      ((c.has && c.has.animals) || []).forEach(a => {
        if (a.id) nestedUnder[a.id] = { ownerId: c.id, ownerName: c.name, animalName: a.name };
      });
    });

    const live = clients.filter(c => !c.deleted);
    res.status(200).json({
      ok: true,
      provider: { id: owner, email: pr[0].email, name: pr[0].name || '' },
      counts: {
        rowsTotal: clients.length,
        rowsLive: live.length,
        rowsDeleted: clients.length - live.length,
        rosterIds: rosterIds ? rosterIds.length : null,
        events
      },
      clients,
      roster: { shape: rosterShape, ids: rosterIds },
      // Rows the table has (not deleted) that the account's roster blob has forgotten, and the
      // reverse. Either direction explains a client vanishing from her screen.
      missingFromRoster: rosterIds ? live.filter(c => rosterIds.indexOf(c.id) < 0).map(c => c.id) : null,
      missingFromTable: rosterIds ? rosterIds.filter(id => !clients.some(c => c.id === id)) : null,
      deletedRecordIds: deletedRecord,
      nestedUnder,
      kv
    });
  } catch (e) {
    console.error('[client-recover] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Lookup failed.' });
  }
}
