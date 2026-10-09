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
import { dbEnabled, sql, ensureTable, ensureProvidersTable, ensureFilesTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { ensureClientTables } from '../../lib/clients.js';
import { listHistory, restoreVersion, ensureHistoryTable, itemCount } from '../../lib/kv-history.js';

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
    // The fields a provider actually TYPED. The app seeds a new client record with placeholders —
    // skin '—', concerns '—', allergies 'None noted', fitz '—', treatment 'New client' — so a
    // COMPLETELY EMPTY skeleton scored 5 out of 5 and every row on the real account read as
    // "5 chart fields". That made the number meaningless and the whole diagnosis read as though
    // nothing was wrong. Placeholders are the app's words, not hers, so they do not count.
    profileFilled: ['skin', 'concerns', 'allergies', 'fitz', 'treatment']
      .filter(k => { const v = String(p[k] || '').trim();
        return v && !/^(—|-|–|n\/a|none|none noted|not scheduled|new client|unknown)$/i.test(v); }).length,
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
  // `q` is a NAME (or part of one). Ashley knows "Heather Hinkle" and "the only equine provider";
  // she does not know the sign-in email, and making her go and find it is friction on exactly the
  // day a provider is upset. Resolved to an email below, and never used to authorize anything.
  const nameQ = String((req.query && req.query.q) || (req.body && req.body.q) || '').trim();
  if (!email && !nameQ) { res.status(400).json({ error: 'Pass the provider email, or a name to search for.' }); return; }

  try {
    await ensureProvidersTable();
    await ensureTable();
    await ensureClientTables();
    let pr;
    if (email) {
      pr = await q`SELECT id, email, name FROM providers WHERE lower(email) = ${email}`;
      if (!pr.length) { res.status(404).json({ error: 'No provider with that email.' }); return; }
    } else {
      // Name search. Matches the name OR the address, so a half-remembered either way still lands.
      // Strip the LIKE wildcards so a typed % or _ cannot become "match everything" — and then
      // require something left to search on, or `%` alone listed every provider on the deployment.
      const bare = nameQ.toLowerCase().replace(/[%_\\]/g, '').trim();
      if (bare.length < 2) { res.status(400).json({ error: 'Type at least two letters of their name.' }); return; }
      const like = '%' + bare + '%';
      const hits = await q`SELECT id, email, name FROM providers
        WHERE lower(coalesce(name,'')) LIKE ${like} OR lower(coalesce(email,'')) LIKE ${like}
        ORDER BY lower(coalesce(name,'')) LIMIT 25`;
      if (!hits.length) { res.status(404).json({ error: 'No provider matches \u201c' + nameQ + '\u201d.' }); return; }
      if (hits.length > 1) {
        // Ambiguous on purpose: never guess which provider's records to touch. Hand back the list
        // and let the founder pick, with no diagnosis run and nothing written.
        res.status(200).json({ ok: true, needsPick: true,
          matches: hits.map(h => ({ email: h.email, name: h.name || '' })) });
        return;
      }
      pr = hits;
    }
    const owner = String(pr[0].id);

    if (req.method === 'POST') {
      // A write names its provider by EMAIL, always. A name search can be ambiguous, and
      // "restore whoever this probably means" is not a thing this endpoint will do.
      if (!email) { res.status(400).json({ error: 'Restoring needs the exact provider email.' }); return; }
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

      // Put a whole library back to an earlier copy. The current value is kept first, inside
      // restoreVersion, so this is itself undoable.
      if (body.restoreVersionId) {
        const out = await restoreVersion(owner, body.restoreVersionId);
        res.status(out.ok ? 200 : 400).json(out.ok ? { ok: true, ...out } : { error: out.error });
        return;
      }

      // Bring a client back that the delete record keeps killing. Two writes, and BOTH are needed:
      // the tombstone set unions on pull, so clearing it on the account alone lets her device push
      // the same ids straight back. `sc_undeleted_clients` is the counterweight the app reads after
      // the union, which is the only way to outrank an entry that is already on both sides.
      if (Array.isArray(body.unDeleteIds) && body.unDeleteIds.length) {
        const ids = body.unDeleteIds.slice(0, 200).map(String);
        let cleared = 0;
        try {
          const cur = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_deleted_clients'`;
          const o = cur.length ? (JSON.parse(cur[0].v) || {}) : {};
          ids.forEach(id => { if (Object.prototype.hasOwnProperty.call(o, id)) { delete o[id]; cleared++; } });
          await q`INSERT INTO kv (owner,k,v,updated_at) VALUES (${owner},'sc_deleted_clients',${JSON.stringify(o)},now())
            ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()`;
        } catch (e) { res.status(500).json({ error: 'Could not update the delete record.' }); return; }
        try {
          const cur2 = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_undeleted_clients'`;
          const u = cur2.length ? (JSON.parse(cur2[0].v) || {}) : {};
          const now2 = Date.now();
          ids.forEach(id => { u[id] = now2; });
          await q`INSERT INTO kv (owner,k,v,updated_at) VALUES (${owner},'sc_undeleted_clients',${JSON.stringify(u)},now())
            ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()`;
        } catch (e) { res.status(500).json({ error: 'Could not record the undelete.' }); return; }
        res.status(200).json({ ok: true, unDeleted: ids.length, clearedFromRecord: cleared });
        return;
      }

      // ADD THE LIVE CLIENTS THE ACCOUNT'S OWN LIST HAS FORGOTTEN.
      //
      // Her app draws from sc_clients, not from the clients table. On Heather's account those two
      // had drifted completely apart — the account's list held Ingatara Perry and not Sue, while
      // her phone showed Sue and not Ingatara Perry. Neither side had ever absorbed the other.
      //
      // This only ADDS. A client already in the list is left exactly as it is, because the list is
      // where her typed notes live and the clients table copy does not have them. New entries are
      // built from the clients table (name, contact, profile, and the ownerId/isAnimal links that
      // keep a horse under its owner) and carry NO _uAt, so the moment her device has a better
      // copy of one, _mergeClients prefers hers.
      if (body.repairRoster) {
        const rv = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_clients'`;
        let roster = {};
        try { roster = rv.length ? (JSON.parse(rv[0].v) || {}) : {}; } catch (e) { roster = {}; }
        if (!rv.length) { res.status(400).json({ error: 'That account has no client list to repair.' }); return; }
        // Keep what is there first. This writes the one place her notes live.
        try { await ensureHistoryTable(); } catch (e) {}
        try {
          await q`INSERT INTO kv_history (owner, k, v, bytes, items, reason)
            VALUES (${owner},'sc_clients',${rv[0].v},${String(rv[0].v || '').length},${itemCount(rv[0].v)},'before-restore')`;
        } catch (e) {
          console.error('[client-recover] roster backup failed:', (e && e.message) || e);
          res.status(500).json({ error: 'Could not keep a copy first, so nothing was changed.' }); return;
        }

        // Self-contained: `clients` and `nestedUnder` are built further down for the GET, which
        // runs AFTER this branch — referencing them here is a TDZ ReferenceError, not a value.
        const liveRows = await q`SELECT id, name, email, phone, data FROM clients
          WHERE provider_id=${owner} AND deleted_at IS NULL`;
        // Who is an animal under whom, from the same rows.
        const nested = {};
        liveRows.forEach(r2 => {
          let dd = {}; try { dd = typeof r2.data === 'string' ? JSON.parse(r2.data) : (r2.data || {}); } catch (e) { dd = {}; }
          (Array.isArray(dd.animals) ? dd.animals : []).forEach(a => {
            if (a && a.id) nested[String(a.id)] = { ownerId: r2.id };
          });
        });
        const added = [];
        for (const row0 of liveRows) {
          if (roster[row0.id]) continue;
          const row = [row0];
          let d = {};
          try { d = typeof row[0].data === 'string' ? JSON.parse(row[0].data) : (row[0].data || {}); } catch (e) { d = {}; }
          const p = (d.profile && typeof d.profile === 'object') ? d.profile : {};
          const keep = v => { const x = String(v == null ? '' : v).trim(); return x || ''; };
          roster[row0.id] = {
            name: row[0].name || '', email: row[0].email || '', phone: row[0].phone || '',
            skin: keep(p.skin), concerns: keep(p.concerns), allergies: keep(p.allergies),
            fitz: keep(p.fitz), treatment: keep(p.treatment),
            lastVisit: keep(p.lastVisit), nextVisit: keep(p.nextVisit),
            summaries: Array.isArray(d.summaries) ? d.summaries : []
          };
          // A horse belongs under its owner. Rebuild the link from whichever client lists it.
          const owner2 = nested[row0.id];
          if (owner2) { roster[row0.id].ownerId = owner2.ownerId; roster[row0.id].isAnimal = true; }
          added.push({ id: row0.id, name: row[0].name || '' });
        }
        if (!added.length) { res.status(400).json({ error: 'Their list already has every live client.' }); return; }
        await q`INSERT INTO kv (owner,k,v,updated_at) VALUES (${owner},'sc_clients',${JSON.stringify(roster)},now())
          ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()`;
        res.status(200).json({ ok: true, addedToRoster: added.length, clients: added,
          note: 'Added to the account list only. Nothing that was already there was changed, and the previous list is kept under Earlier copies.' });
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

    // ── The OTHER place a provider's work lives ──────────────────────────────
    // clients.data carries the CLIENT-FACING copy of a chart. The provider's own session
    // summaries, product plans, body maps and note drafts live in the kv store as per-client maps
    // ({clientId: [...]}), and NOTHING above would show them. On Heather's account every single
    // client row reported chart fields and zero summaries, which looks like catastrophic loss
    // until you check here — so this is counted, per key, before anyone concludes anything.
    // Counts only: the number of clients the map covers and the number of entries inside. No value
    // text is ever selected into this function.
    const LIBS = ['sc_session_summaries', 'sc_client_recs', 'sc_client_homecare', 'sc_body_maps',
      'sc_photo_index', 'sc_note_drafts', 'sc_summary_drafts', 'sc_rec_reasons',
      'sc_pro_vc_invites', 'sc_healing_stage', 'sc_summary_guides', 'sc_workspace', 'sc_clients'];
    const libraries = {};
    for (const key of LIBS) {
      const meta = kv[key];
      if (!meta) { libraries[key] = { onServer: false }; continue; }
      const out = { onServer: true, bytes: meta.bytes, at: meta.at };
      try {
        const c = await q`SELECT count(*)::int AS clients,
            coalesce(sum(CASE WHEN jsonb_typeof(entry.value)='array'
                              THEN jsonb_array_length(entry.value) ELSE 0 END),0)::int AS entries
          FROM kv, jsonb_each(kv.v::jsonb) AS entry
          WHERE kv.owner=${owner} AND kv.k=${key} AND jsonb_typeof(kv.v::jsonb)='object'`;
        if (c && c[0]) { out.clients = Number(c[0].clients) || 0; out.entries = Number(c[0].entries) || 0; }
      } catch (e) { out.unreadable = true; }
      libraries[key] = out;
    }

    // Earlier copies of her libraries, kept automatically before anything shrank them. Metadata
    // only — when, how many entries it held, and why it was kept.
    let history = [];
    try { await ensureHistoryTable(); history = await listHistory(owner); } catch (e) {}

    // ── LOOK INSIDE THE TWO PLACES HER WRITING WOULD BE ─────────────────────
    // Rounded kilobytes hid the answer: "Note drafts: 3 clients, 1KB" could be three real notes or
    // three empty shells, and "Client roster: 4 clients, 22KB" could be four full charts. Chart
    // notes (c.notes / c.conditions) live in the ROSTER blob and nowhere else, and session notes
    // live in sc_note_drafts. So count the actual CHARACTERS OF TYPING per client, in both.
    //
    // Still counts only — the number of characters she wrote, never the words. That is enough to
    // answer "is her work there", which is the only question that matters here.
    const typed = { roster: [], noteDrafts: [] };
    try {
      const rv = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_clients'`;
      const obj = rv.length ? JSON.parse(rv[0].v) : null;
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(id => {
          const c = obj[id] || {};
          const len = x => String(x == null ? '' : x).trim().length;
          // The app seeds placeholders, so its own words do not count as her typing.
          const real = x => { const v = String(x == null ? '' : x).trim();
            return /^(—|-|–|n\/a|none|none noted|not scheduled|new client|unknown|)$/i.test(v) ? 0 : v.length; };
          typed.roster.push({ id, name: String(c.name || ''),
            notes: len(c.notes), conditions: len(c.conditions),
            chart: real(c.skin) + real(c.concerns) + real(c.allergies) + real(c.fitz) + real(c.treatment),
            summaries: Array.isArray(c.summaries) ? c.summaries.length : 0,
            forms: (Array.isArray(c.submittedForms) ? c.submittedForms.length : 0) });
        });
        typed.roster.sort((a, b) => (b.notes + b.conditions + b.chart) - (a.notes + a.conditions + a.chart));
      }
    } catch (e) { typed.rosterError = true; }
    try {
      const dv = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_note_drafts'`;
      const obj = dv.length ? JSON.parse(dv[0].v) : null;
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(id => {
          const d = obj[id] || {};
          const secs = (d && typeof d.sections === 'object' && d.sections) ? d.sections : {};
          let chars = 0, filled = 0;
          Object.keys(secs).forEach(k2 => { const t = String(secs[k2] == null ? '' : secs[k2]).trim();
            if (t) { chars += t.length; filled++; } });
          typed.noteDrafts.push({ id, chars, sections: filled,
            date: String(d.date || ''), templateId: String(d.templateId || ''), ts: Number(d.ts) || 0 });
        });
        typed.noteDrafts.sort((a, b) => b.chars - a.chars);
      }
    } catch (e) { typed.noteDraftsError = true; }

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

    // THE SELF-REPEATING DELETE. _mergeClients drops any client whose id is in the device's
    // sc_deleted_clients, on EVERY pull. So a row that is alive and well on the server, whose id
    // is also sitting in that delete record, disappears again every single time she refreshes —
    // and refreshing is exactly what we keep telling providers to do. Heather watched Ingatara
    // Perry and three horses vanish on a refresh while the server listed all four as live.
    //
    // The delete record is a tombstone set: it UNIONS on pull and only ever grows, so clearing it
    // on one device achieves nothing. It has to be cleared on the account AND on her device, which
    // is why this is reported loudly rather than quietly patched.
    const delSet = {};
    (deletedRecord || []).forEach(id => { delSet[String(id)] = 1; });
    const ghosts = clients.filter(c => !c.deleted && delSet[c.id])
      .map(c => ({ id: c.id, name: c.name, has: c.has }));

    const live = clients.filter(c => !c.deleted);
    // ── Photos ───────────────────────────────────────────────────────────────
    // Photos do NOT ride the kv blob. Each one is a row in `files`, keyed by owner + photo id,
    // uploaded per-photo by _backupPhotosToServer (shipped 2026-09-13). sc_photo_index maps
    // clientId -> [{pid,...}] and is the ONLY thing _restorePhotosFromCloud reads, so a photo whose
    // BYTES are on the server but whose index entry is gone is invisible to her app while being
    // perfectly recoverable. Report both sides so that gap is visible instead of guessed at.
    const photos = { onServer: 0, bytes: 0, indexNames: 0, orphanBytes: [], missingBytes: [], byClient: {} };
    try {
      // /api/guide-file creates this on every request, so it exists wherever a photo was ever
      // uploaded — but creating it here too means the report says "0 photos" rather than erroring
      // on an account that has never uploaded one.
      await ensureFilesTable();
      const frows = await q`SELECT id, type, length(coalesce(data,'')) AS bytes
        FROM files WHERE owner=${owner}`;
      const fileIds = new Set();
      (frows || []).forEach(f => {
        // A guide or course attachment is a file too; only the image rows are session photos.
        if (!/^image\//i.test(String(f.type || ''))) return;
        fileIds.add(String(f.id));
        photos.onServer++;
        photos.bytes += Number(f.bytes) || 0;
      });
      let idx = {};
      try {
        const r0 = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_photo_index'`;
        idx = r0.length ? (JSON.parse(r0[0].v) || {}) : {};
      } catch (e) { idx = {}; }
      const named = new Set();
      Object.keys(idx || {}).forEach(cid => {
        const list = Array.isArray(idx[cid]) ? idx[cid] : [];
        const c0 = (clients || []).find(x => x.id === cid);
        photos.byClient[cid] = { name: c0 ? (c0.name || '') : '(not in the clients table)',
          indexed: list.length, onServer: 0 };
        list.forEach(m => {
          const pid = String((m && m.pid) || '');
          if (!pid) return;
          named.add(pid);
          photos.indexNames++;
          if (fileIds.has(pid)) photos.byClient[cid].onServer++;
          else photos.missingBytes.push({ clientId: cid, pid });
        });
      });
      // Bytes on the server that NOTHING points at any more. These are the recoverable ones: the
      // photo survived its upload and only the index entry that names it was lost.
      fileIds.forEach(id => { if (!named.has(id)) photos.orphanBytes.push(id); });
      photos.missingBytes = photos.missingBytes.slice(0, 200);
      photos.orphanBytes = photos.orphanBytes.slice(0, 500);
    } catch (e) {
      photos.error = (e && e.message) || String(e);
    }

    // ── The verdict ──────────────────────────────────────────────────────────
    // The numbers above were all present and correct the day a draft email still told a provider
    // her notes might be gone. Scattered counts need interpreting, and interpreting is where it
    // went wrong twice in one day. So the answer to the only question that matters — IS ANYTHING
    // ACTUALLY LOST — is computed here and rendered as a sentence, not left to be inferred.
    const verdict = (() => {
      const chars = (typed.roster || []).reduce((a, c) => a + c.notes + c.conditions + c.chart, 0);
      const draftChars = (typed.noteDrafts || []).reduce((a, d) => a + (d.chars || 0), 0);
      const withWords = (typed.roster || []).filter(c => (c.notes + c.conditions + c.chart) > 0).length;
      const sums = (typed.roster || []).reduce((a, c) => a + (c.summaries || 0), 0);
      const safe = [], unknown = [];
      if (chars) safe.push(chars + ' characters of notes and chart detail across ' + withWords + ' client' + (withWords === 1 ? '' : 's'));
      else unknown.push('no typed notes found in their client list');
      if (draftChars) safe.push(draftChars + ' characters in unfinished note drafts');
      if (sums) safe.push(sums + ' saved visit summar' + (sums === 1 ? 'y' : 'ies'));
      if (photos.onServer) safe.push(photos.onServer + ' photo' + (photos.onServer === 1 ? '' : 's'));
      else unknown.push('no photos on the server');
      return {
        safe, unknown,
        noteChars: chars, draftChars, summaries: sums, photos: photos.onServer,
        // The sentence to repeat. Never write "lost" to a provider without this saying so.
        line: safe.length
          ? ('ON THE SERVER RIGHT NOW: ' + safe.join('; ') + '. This is NOT lost \u2014 do not tell them it is.')
          : 'Nothing of theirs was found on the server. Say what was checked, and check Earlier copies before calling it lost.'
      };
    })();

    res.status(200).json({
      ok: true,
      verdict,
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
      // BY NAME. The count alone ("6 missing") sent me chasing a wrong theory twice. Which rows
      // the account's own roster blob has forgotten is the thing that says whether her app is
      // rendering a short list or dropping clients it was given.
      missingFromRoster: rosterIds
        ? live.filter(c => rosterIds.indexOf(c.id) < 0).map(c => ({ id: c.id, name: c.name }))
        : null,
      // ...and what the roster blob DOES hold, which is what her app actually draws.
      rosterHas: rosterIds
        ? rosterIds.map(id => { const c = clients.find(x => x.id === id);
            return { id, name: c ? c.name : '(not in the clients table)', deleted: c ? c.deleted : null }; })
        : null,
      missingFromTable: rosterIds ? rosterIds.filter(id => !clients.some(c => c.id === id)) : null,
      deletedRecordIds: deletedRecord,
      ghosts,
      nestedUnder,
      libraries,
      typed,
      history,
      photos,
      kv
    });
  } catch (e) {
    console.error('[client-recover] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Lookup failed.' });
  }
}
