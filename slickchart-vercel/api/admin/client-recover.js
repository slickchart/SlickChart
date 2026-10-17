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
import { listDeviceReports } from '../../lib/device-report.js';
import { dbEnabled, sql, ensureTable, ensureProvidersTable, ensureFilesTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { ensureClientTables, tombstoneClients, clearClientTombstones } from '../../lib/clients.js';
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

// ── WHAT A CLIENT ROW ACTUALLY HOLDS ───────────────────────────────────────────────────────────
// describe() above counts what the recovery screen DISPLAYS. This counts what would be LOST if the
// row were deleted, which is a different and strictly larger question: _assembleClientData also
// puts aftercare, a routine, pending guides and courses, a consult invite, a routine review, a
// suggested booking, a check-in request and loyalty into the blob, and describe() reads none of
// them. A purge that asked describe() alone would call a row carrying a homecare list "empty".
//
// SIZE IS NO GUIDE HERE. Every blob is stamped with the studio name, address, phone, website,
// provider name, booking config and availability — provider-wide fields that are identical on a
// never-touched skeleton — so a blank row is still several hundred bytes. The test is per-field and
// counts only the fields that belong to THIS client.
//
// UNREADABLE COUNTS AS FULL. If this cannot parse the blob it does not know what is in it, and the
// only safe answer to "may I delete this" is no.
const CLIENT_FIELDS = ['summaries', 'aftercare', 'products', 'routine', 'forms', 'pendingForms',
  'pendingGuides', 'pendingCourses', 'progressPhotos', 'animals'];
export function clientContent(dataRaw) {
  let d = null;
  try { d = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw; }
  catch (e) { return { unreadable: true, holds: ['could not be read'] }; }
  if (d == null) return { holds: [] };
  if (typeof d !== 'object' || Array.isArray(d)) return { unreadable: true, holds: ['could not be read'] };
  const holds = [];
  for (const k of CLIENT_FIELDS) {
    const v = d[k];
    const n = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0);
    if (n) holds.push(n + ' ' + k);
  }
  // The same placeholder rule the app uses (_isPlaceholderChart): the app seeds a new client with
  // skin '—', concerns '—', allergies 'None noted', fitz '—', treatment 'New client', so an empty
  // skeleton scored five filled fields and every row read as real. Placeholders are the app's
  // words, not hers.
  const p = (d.profile && typeof d.profile === 'object') ? d.profile : {};
  const typed = ['skin', 'concerns', 'allergies', 'fitz', 'treatment', 'lastVisit', 'nextVisit']
    .filter(k => { const v = String(p[k] || '').trim();
      return v && !/^(—|-|–|n\/a|none|none noted|not scheduled|new client|unknown)$/i.test(v); });
  if (typed.length) holds.push(typed.length + ' chart field' + (typed.length > 1 ? 's' : ''));
  if (d.vcInvite && typeof d.vcInvite === 'object' && Object.keys(d.vcInvite).length) holds.push('a consult invite');
  if (d.routineReview) holds.push('a routine review');
  if (d.suggestedBooking) holds.push('a suggested booking');
  if (Number(d.checkinReqAt) > 0) holds.push('a check-in request');
  if (d.loyalty && typeof d.loyalty === 'object' && Object.keys(d.loyalty).length) holds.push('loyalty points');
  return { holds };
}

// ── THE JUNK REPORT, and the only thing a purge is allowed to take ────────────────────────────
// Ashley, 2026-10-13, looking at her own account in this screen: "i saw it has all the junk data
// clients on the server still. we can get rid of all of those."
//
// Her account carries thousands of client rows for a one-person practice. They are not inert:
// _syncEvents polls /api/clients every 15 seconds and on every window focus, and for any server
// client her roster has not got it CREATES a record — so the only thing keeping them off her screen
// is her device's delete record, and the loop runs forever. That is what the "DELETED AGAIN EVERY
// REFRESH" lines in this report are. Clearing the rows is the cure; clearing the delete record is
// not, because the tombstone set unions on pull and only ever grows.
//
// A purge is destructive and irreversible, and on this account there are NO earlier copies kept. So
// the rule is that a row is a candidate only where there is POSITIVE EVIDENCE it holds nothing.
// Three classes, each with exactly one reason, and everything else is listed and kept:
//
//   removed   — already tombstoned, so invisible to her app today. Hard-deleting it ends the
//               ability to put it back from the REMOVED list, which is why it is its own class.
//   deleted   — a LIVE row whose id is in her own device delete record. She deleted it; the row
//               outlived the delete because POST /api/clients only tombstones the ids a device
//               actually sends, and historically most were never sent.
//   stranger  — a LIVE row her account roster has never heard of and that was never invited. The
//               blank skeletons.
//
// NEVER a candidate, whatever class it would otherwise land in: a row holding any client field
// (clientContent), a row whose blob could not be read, a row with a client_event, a row whose link
// the client has opened, and any row that is another client's animal.
//
// This is ONE function on purpose. The report she approves and the delete that follows have to be
// computed the same way, or she approves one set and a different set is taken.
// Every name with more than one live row, in one go, for names that already have a record in her
// list (so a junk name with no real client is never promoted into it). One list backup first.
// Take ids off the account's delete record and stamp them un-deleted, so no device strips them again.
// Shared by "Bring back" and by putting a client back in the list: a client put back whose id was
// still on the delete record vanished again on the next refresh (Debbi Miranda, 2026-10-13: "it
// wont put her back on my list").
export async function undeleteIds(q, owner, idsIn) {
  const ids = (idsIn || []).slice(0, 200).map(String);
  let cleared = 0;
  const cur = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_deleted_clients'`;
  const o = cur.length ? (JSON.parse(cur[0].v) || {}) : {};
  ids.forEach(id => { if (Object.prototype.hasOwnProperty.call(o, id)) { delete o[id]; cleared++; } });
  await q`INSERT INTO kv (owner,k,v,updated_at) VALUES (${owner},'sc_deleted_clients',${JSON.stringify(o)},now())
    ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()`;
  const cur2 = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_undeleted_clients'`;
  const u = cur2.length ? (JSON.parse(cur2[0].v) || {}) : {};
  const now2 = Date.now();
  ids.forEach(id => { u[id] = now2; });
  await q`INSERT INTO kv (owner,k,v,updated_at) VALUES (${owner},'sc_undeleted_clients',${JSON.stringify(u)},now())
    ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()`;
  return cleared;
}

export async function consolidateAll(q, owner) {
  const names = await q`SELECT lower(trim(name)) AS n, count(*)::int AS c FROM clients
    WHERE provider_id=${owner} AND deleted_at IS NULL AND trim(coalesce(name,''))<>'' GROUP BY 1 HAVING count(*)>1 ORDER BY 2 DESC LIMIT 400`;
  const done = [], skipped = [], keptBack = {};
  let retired = 0, first = true;
  for (const row of (names || [])) {
    const out = await consolidateName(q, owner, row.n, true, { onlyIfInList: true, skipBackup: !first });
    if (out.status !== 200) continue;
    if (out.body.skipped) { skipped.push({ name: row.n, copies: row.c }); continue; }
    first = false;
    retired += out.body.retired || 0;
    done.push({ name: out.body.kept.name, retired: out.body.retired, left: (out.body.leftAlone || []).length });
    Object.keys(out.body.leftWhy || {}).forEach(k => { keptBack[k] = (keptBack[k] || 0) + out.body.leftWhy[k]; });
  }
  return { status: 200, body: { ok: true, names: done.length, retired, done, skipped, keptBack } };
}
// See the comment at the call site in the handler.
export async function consolidateName(q, owner, name, includeInvited, opts) {
  opts = opts || {};
  const nm = String(name || '').trim();
  if (nm.length < 2) { return { status: 400, body: { error: 'Give a name.' } }; }
  // includeRemoved: also consider records already on the Removed list (soft-deleted), so a client
  // whose every copy was removed (Debbi Miranda, 2026-10-13: 123 records, all Removed) can be brought
  // back as ONE record. Removed copies that are not chosen simply stay removed.
  const rows = opts.includeRemoved
    ? await q`SELECT id, name, email, phone, data, opened_at, invited_at, deleted_at FROM clients
        WHERE provider_id=${owner} AND lower(trim(coalesce(name,'')))=lower(${nm})`
    : await q`SELECT id, name, email, phone, data, opened_at, invited_at FROM clients
        WHERE provider_id=${owner} AND deleted_at IS NULL AND lower(trim(coalesce(name,'')))=lower(${nm})`;
  if (rows.length < (opts.includeRemoved ? 1 : 2)) { return { status: 400, body: { error: 'There is only ' + rows.length + ' record with that name, nothing to tidy.' } }; }
  const rv = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_clients'`;
  let roster = {}; try { roster = rv.length ? (JSON.parse(rv[0].v) || {}) : {}; } catch (e) { roster = {}; }
  if (!rv.length || Array.isArray(roster) || typeof roster !== 'object') { return { status: 400, body: { error: 'Their client list could not be read, so nothing was changed.' } }; }
  const work = {}, workH = {};
  for (const k of ['sc_session_summaries', 'sc_client_recs', 'sc_client_homecare', 'sc_body_maps', 'sc_note_drafts', 'sc_photo_index', 'sc_summary_drafts']) {
    try {
      // Empty entries are not work: the app writes [] / {} for a client the moment a screen opens.
      const wr = await q`SELECT entry.key AS id, md5(entry.value::text) AS h FROM kv, jsonb_each(kv.v::jsonb) AS entry
        WHERE kv.owner=${owner} AND kv.k=${k} AND jsonb_typeof(kv.v::jsonb)='object'
          AND entry.value::text NOT IN ('[]','{}','""','null')`;
      (wr || []).forEach(x => { const id = String(x.id); work[id] = (work[id] || 0) + 1; (workH[id] = workH[id] || []).push(k + ':' + (x.h || '')); });
    } catch (e) {}
  }
  const ev = {};
  try {
    const eg = await q`SELECT client_id, count(*)::int AS n FROM client_events WHERE provider_id=${owner} GROUP BY client_id`;
    (eg || []).forEach(r => { ev[String(r.client_id)] = Number(r.n) || 0; });
  } catch (e) {}
  const born = id => { const m = String(id).match(/(\d{13})/); return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER; };
  const scored = rows.map(r => {
    const id = String(r.id), c = clientContent(r.data);
    const holds = (c.holds || []).length + (c.unreadable ? 1 : 0);
    const score = (roster[id] ? 1000 : 0) + holds * 10 + (work[id] || 0) * 20 + (ev[id] || 0) * 20 + (r.opened_at ? 5 : 0) + (r.invited_at ? 3 : 0) + (r.deleted_at ? 0 : 1);
    // Why a copy is NOT empty, in words, so the reply can say what the 129 held.
    const why = holds ? 'holds ' + (c.unreadable ? 'a record that could not be read' : c.holds.join(', '))
      : work[id] ? 'saved work is filed under it' : ev[id] ? ev[id] + ' submission(s) from the client'
      : r.opened_at ? 'the client opened this link' : roster[id] ? 'in her list'
      : r.invited_at ? 'a link was sent, never opened' : '';
    const invitedOnly = !holds && !work[id] && !ev[id] && !r.opened_at && !roster[id] && !!r.invited_at;
    return { r, id, score, why, empty: (!holds && !work[id] && !ev[id] && !r.opened_at && !r.invited_at && !roster[id]) || (includeInvited && invitedOnly) };
  }).sort((a, b) => (b.score - a.score) || (born(a.id) - born(b.id)));
  const keep = scored[0];
  const keepWasInList = !!roster[keep.id];
  if (opts.onlyIfInList && !keepWasInList) return { status: 200, body: { ok: true, skipped: true, name: nm, total: rows.length } };
  // A copy is a DUPLICATE when everything on it is already on the kept record (or is something the
  // app derives or can re-send). 2026-10-13: the second live run left 127 Cooper Howard copies that
  // each "held 1 form / 1 chart field" — the same intake and the same booked date copied onto every
  // one. Anything the kept record lacks keeps the copy, and the reply names it.
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); } catch (e) { return null; } };
  const kd = parse(keep.r.data) || {};
  const kr = roster[keep.id] || {};
  const kForms = new Set([].concat(Array.isArray(kd.forms) ? kd.forms : [], Array.isArray(kr.submittedForms) ? kr.submittedForms : [])
    .map(f => String((f && (f.formId || f.id || f.title)) || '').toLowerCase()).filter(Boolean));
  const kProf = Object.assign({}, kr, (kd.profile && typeof kd.profile === 'object') ? kd.profile : {});
  const PH = /^(—|-|–|n\/a|none|none noted|none on file|none known|not scheduled|new client|new patient|unknown|)$/i;
  const keepH = workH[keep.id] || [];
  const hashCount = {};
  rows.forEach(r => (workH[String(r.id)] || []).forEach(t => { hashCount[t] = (hashCount[t] || 0) + 1; }));
  const covered = x => {
    if (x.empty) return '';
    const id = x.id, r = x.r;
    if (work[id]) {
      // Same entry as the kept record, or the identical value sitting on 3+ copies of this name (a
      // default the app seeded, e.g. the starter homecare list), is not her work.
      const mine = (workH[id] || []).filter(t => keepH.indexOf(t) < 0 && (hashCount[t] || 0) < 3);
      if (mine.length) return 'saved work is filed under it (' + mine.map(t => t.split(':')[0].replace('sc_', '').replace(/_/g, ' ')).join(', ') + ')';
    }
    if (ev[id]) return ev[id] + ' submission(s) from the client';
    if (r.opened_at) return 'the client opened this link';
    if (roster[id]) return 'in her list';
    const d = parse(r.data);
    if (!d) return 'its record could not be read';
    for (const k of ['summaries', 'aftercare', 'products', 'routine', 'progressPhotos', 'animals']) {
      const v = d[k]; if (Array.isArray(v) ? v.length : (v && typeof v === 'object' && Object.keys(v).length)) return 'holds ' + k + ' the kept one may not have';
    }
    if (d.loyalty && typeof d.loyalty === 'object' && Object.keys(d.loyalty).length) return 'holds loyalty points';
    const missingForm = (Array.isArray(d.forms) ? d.forms : []).find(f => { const k = String((f && (f.formId || f.id || f.title)) || '').toLowerCase(); return k && !kForms.has(k); });
    if (missingForm) return 'has a form the kept one does not (' + String(missingForm.title || 'form') + ')';
    const p = (d.profile && typeof d.profile === 'object') ? d.profile : {};
    for (const f of ['skin', 'concerns', 'allergies', 'fitz', 'treatment']) {   // lastVisit/nextVisit are stamped from bookings
      const v = String(p[f] || '').trim();
      if (v && !PH.test(v) && v !== String(kProf[f] || '').trim()) return 'its ' + f + ' differs from the kept one';
    }
    return '';
  };
  scored.slice(1).forEach(x => { const c = covered(x); if (!x.empty && !c) { x.empty = true; } else if (!x.empty) { x.why = c; } });
  const retire = scored.slice(1).filter(x => x.empty && !x.r.deleted_at).map(x => x.id);
  const leftAlone = scored.slice(1).filter(x => !x.empty && !x.r.deleted_at).map(x => ({ id: x.id, why: x.why || 'holds something' }));
  const leftWhy = {}; leftAlone.forEach(x => { leftWhy[x.why] = (leftWhy[x.why] || 0) + 1; });
  try { await ensureHistoryTable(); } catch (e) {}
  if (!opts.skipBackup) try {
    await q`INSERT INTO kv_history (owner, k, v, bytes, items, reason)
      VALUES (${owner},'sc_clients',${rv[0].v},${String(rv[0].v || '').length},${itemCount(rv[0].v)},'before-restore')`;
  } catch (e) { return { status: 500, body: { error: 'Could not keep a copy of their list first, so nothing was changed.' } }; }
  if (!roster[keep.id]) {
    let d = {}; try { d = typeof keep.r.data === 'string' ? JSON.parse(keep.r.data) : (keep.r.data || {}); } catch (e) { d = {}; }
    const pf = (d.profile && typeof d.profile === 'object') ? d.profile : {};
    const kv2 = v => String(v == null ? '' : v).trim();
    roster[keep.id] = { name: keep.r.name || nm, email: keep.r.email || '', phone: keep.r.phone || '',
      skin: kv2(pf.skin), concerns: kv2(pf.concerns), allergies: kv2(pf.allergies), fitz: kv2(pf.fitz), treatment: kv2(pf.treatment),
      lastVisit: kv2(pf.lastVisit), nextVisit: kv2(pf.nextVisit), summaries: Array.isArray(d.summaries) ? d.summaries : [] };
    await q`INSERT INTO kv (owner,k,v,updated_at) VALUES (${owner},'sc_clients',${JSON.stringify(roster)},now())
      ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()`;
  }
  let broughtBack = false;
  if (keep.r.deleted_at) {
    await q`UPDATE clients SET deleted_at=NULL WHERE provider_id=${owner} AND id=${keep.id}`;
    broughtBack = true;
  }
  // Only stamp "brought back" when there was a delete to undo. Stamping every KEPT record made it
  // immune to any later delete or merge (the app drops a deleted id that also has an undelete
  // stamp), so a copy kept here could never be merged away and kept coming back as a duplicate.
  let wasDeleted = !!keep.r.deleted_at;
  if (!wasDeleted) { try { const dc = await q`SELECT v FROM kv WHERE owner=${owner} AND k='sc_deleted_clients'`; const o = dc.length ? (JSON.parse(dc[0].v) || {}) : {}; wasDeleted = Object.prototype.hasOwnProperty.call(o, keep.id); } catch (e) {} }
  if (wasDeleted) { try { await undeleteIds(q, owner, [keep.id]); } catch (e) {} }
  let retired = 0;
  for (let i = 0; i < retire.length; i += 200) {
    const chunk = retire.slice(i, i + 200);
    const out = await q`UPDATE clients SET deleted_at=${Date.now()} WHERE provider_id=${owner} AND deleted_at IS NULL AND id = ANY(${chunk}) RETURNING id`;
    retired += (out || []).length;
  }
  return { status: 200, body: { ok: true, kept: { id: keep.id, name: keep.r.name || nm, wasInList: keepWasInList },
    retired, leftAlone, leftWhy, broughtBack, total: rows.length,
    note: 'The copies are on the Removed list, so any of them can be put back.' } };
}

export async function classifyJunk(q, owner) {
  const rows = await q`SELECT id, name, deleted_at, opened_at, invited_at, data
    FROM clients WHERE provider_id=${owner} ORDER BY lower(coalesce(name,''))`;

  // Which ids her account roster knows about. null when sc_clients is missing or unreadable.
  let rosterIds = null;
  try {
    const rk = await q`SELECT jsonb_typeof(v::jsonb) AS kind FROM kv WHERE owner=${owner} AND k='sc_clients'`;
    if (rk.length && rk[0].kind === 'object') {
      const ks = await q`SELECT jsonb_object_keys(v::jsonb) AS id FROM kv WHERE owner=${owner} AND k='sc_clients'`;
      rosterIds = (ks || []).map(x => String(x.id));
    } else if (rk.length && rk[0].kind === 'array') {
      const ks = await q`SELECT e->>'id' AS id FROM kv, jsonb_array_elements(v::jsonb) e
        WHERE owner=${owner} AND k='sc_clients'`;
      rosterIds = (ks || []).map(x => String(x.id)).filter(Boolean);
    }
  } catch (e) { rosterIds = null; }
  const rosterReadable = Array.isArray(rosterIds);
  const rosterSet = {};
  (rosterIds || []).forEach(id => { rosterSet[String(id)] = 1; });

  // THE SQUARE CUSTOMER BEHIND A ROW, so clearing junk here can clear it there too.
  //
  // Ashley, 2026-10-13: "make sure they really can delete from my square account as well not just
  // the app." A client's Square id lives in TWO places and neither is the clients table:
  //   • the row id itself, when the client came in from Square — those are `sq_<customerId>`
  //   • `squareId` (or the older `sqId`) on the entry in her sc_clients roster blob
  // The second only covers rows her roster still knows about, which by definition excludes the
  // whole `stranger` class, so both are needed and the id prefix is the one that reaches the junk.
  //
  // Read as TEXT out of the blob, one value per key, rather than pulling the whole roster into
  // this function — the same reason rosterIds is read with a JSON path (no record text in here).
  const sqOf = {};
  try {
    const sr = await q`SELECT key AS id, coalesce(value->>'squareId', value->>'sqId', '') AS sq
      FROM kv, jsonb_each(CASE WHEN jsonb_typeof(v::jsonb)='object' THEN v::jsonb ELSE '{}'::jsonb END)
      WHERE owner=${owner} AND k='sc_clients'`;
    (sr || []).forEach(r2 => { const v = String(r2.sq || '').trim(); if (v) sqOf[String(r2.id)] = v; });
  } catch (e) { /* an array-shaped or unreadable roster just contributes nothing here */ }
  // `sq_<customerId>` as the row id is the other half, and the one that covers rows her roster has
  // never heard of. Square customer ids are long opaque strings; anything shorter is not one.
  function squareIdFor(id) {
    const s2 = String(id || '');
    if (s2.indexOf('sq_') === 0 && s2.length > 11) return s2.slice(3);
    return sqOf[s2] || '';
  }

  // Her own delete record.
  const delSet = {};
  try {
    const dr = await q`SELECT jsonb_object_keys(v::jsonb) AS id FROM kv
      WHERE owner=${owner} AND k='sc_deleted_clients'`;
    (dr || []).forEach(x => { delSet[String(x.id)] = 1; });
  } catch (e) {}

  // Anything the client themselves ever submitted. A row with a submission has been used by a real
  // person, so it is never purgeable even when the blob reads empty because nothing ingested it.
  const eventIds = {};
  try {
    const eg = await q`SELECT client_id, count(*)::int AS n FROM client_events
      WHERE provider_id=${owner} GROUP BY client_id`;
    (eg || []).forEach(r => { eventIds[String(r.client_id)] = Number(r.n) || 0; });
  } catch (e) {}

  // Who is an animal under whom, read off the rows themselves.
  const isAnimalRow = {};
  (rows || []).forEach(r => {
    let d = {}; try { d = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {}); } catch (e) { d = {}; }
    (Array.isArray(d.animals) ? d.animals : []).forEach(a => { if (a && a.id) isAnimalRow[String(a.id)] = 1; });
  });

  // Saved work filed under a client id lives in maps OUTSIDE the clients table (summaries, plans,
  // homecare, body maps, unfinished notes, photos). 2026-10-13: Cooper Howard, a real client with
  // summaries, sat in the "never in their list" class three times over, because the row's own blob
  // was empty while her work, if any, would be under the id in one of these. Any id named in any of
  // them is never a candidate.
  const workBy = {};
  for (const k of ['sc_session_summaries', 'sc_client_recs', 'sc_client_homecare', 'sc_body_maps', 'sc_note_drafts', 'sc_photo_index', 'sc_summary_drafts']) {
    try {
      // Empty entries are not work: the app writes [] / {} for a client the moment a screen opens.
      const wr = await q`SELECT entry.key AS id, md5(entry.value::text) AS h FROM kv, jsonb_each(kv.v::jsonb) AS entry
        WHERE kv.owner=${owner} AND kv.k=${k} AND jsonb_typeof(kv.v::jsonb)='object'
          AND entry.value::text NOT IN ('[]','{}','""','null')`;
      (wr || []).forEach(x => { const id = String(x.id); (workBy[id] = workBy[id] || []).push(k.replace('sc_', '').replace(/_/g, ' ')); });
    } catch (e) {}
  }
  const junk = { removed: [], deleted: [], stranger: [], kept: [] };
  for (const r of (rows || [])) {
    const id = String(r.id);
    const content = clientContent(r.data);
    const row = { id, name: r.name || '', holds: content.holds || [], sq: squareIdFor(id) };
    let blocker = '';
    if (content.unreadable) blocker = 'its saved record could not be read';
    else if ((content.holds || []).length) blocker = 'it holds ' + content.holds.join(', ');
    else if (eventIds[id]) blocker = eventIds[id] + ' submission(s) from the client';
    else if (r.opened_at) blocker = 'the client has opened their own link';
    else if (isAnimalRow[id]) blocker = 'it is an animal under another client';
    else if (workBy[id]) blocker = 'saved work is filed under it (' + workBy[id].join(', ') + ')';

    if (r.deleted_at) {
      // A client who erased their OWN data had name/email/phone/data scrubbed and their token
      // revoked by deleteClientData, so that row reads empty by design and lands here. Taking it is
      // correct: it is the row they asked to be rid of.
      if (blocker) junk.kept.push(Object.assign({ why: blocker, state: 'removed' }, row));
      else junk.removed.push(row);
      continue;
    }
    if (delSet[id]) {
      if (blocker) junk.kept.push(Object.assign({ why: blocker, state: 'she deleted it' }, row));
      else junk.deleted.push(row);
      continue;
    }
    if (!rosterSet[id] && !r.invited_at) {
      // A roster read that FAILED must not make every live row look like a stranger, so the class
      // is withheld entirely rather than offered against an unknown roster.
      if (!rosterReadable) junk.kept.push(Object.assign({ why: 'her account list could not be read, so nothing is assumed about this row', state: 'not in her list' }, row));
      else if (blocker) junk.kept.push(Object.assign({ why: blocker, state: 'not in her list' }, row));
      else junk.stranger.push(row);
      continue;
    }
  }
  return { junk, rosterReadable, counts: { rows: (rows || []).length } };
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
        try { cleared = await undeleteIds(q, owner, ids); }
        catch (e) { res.status(500).json({ error: 'Could not update the delete record.' }); return; }
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
      // ── ONE CLIENT, MANY COPIES: keep the real one, retire the empty copies ──────────
      // Ashley, 2026-10-13: Cooper Howard (a real, newer client, 2–3 visits) had 141 live rows, none
      // in her list. The "N new online bookings added" loop created a fresh row for every booker it
      // could not match on every launch, and each one reached the server. "im not doing this 141
      // times". So: one call per NAME. It keeps the best row (already in her list, else the one
      // holding the most — chart, forms, saved work filed under its id, submissions, opened link —
      // else the oldest), puts that one in her list, and SOFT-deletes only copies that hold nothing
      // at all. Soft delete sets deleted_at, so every copy stays on the Removed list and can be put
      // back. A copy holding anything is kept and named in the reply, never touched.
      if (body.consolidateAll) {
        const out = await consolidateAll(q, owner);
        res.status(out.status).json(out.body);
        return;
      }
      if (body.consolidateName) {
        const out = await consolidateName(q, owner, body.consolidateName, body.includeInvited === true, { includeRemoved: body.includeRemoved === true });
        res.status(out.status).json(out.body);
        return;
      }

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
        // Put back only the named rows when asked (one client found by search), never the thousands
        // of junk rows that are also missing from the list. The ids only NARROW a provider-scoped read.
        const only = Array.isArray(body.onlyIds) ? new Set(body.onlyIds.map(String).slice(0, 50)) : null;
        // Without a named id, a bulk repair must not put back every leftover COPY of a client the
        // list already has (one account had 141). A missing row is skipped only when it is plainly
        // the same person as one already listed: same name, and no email or phone that disagrees.
        // Two different people who share a name differ on contact details, so they still come back.
        const nm = v => String(v == null ? '' : v).trim().toLowerCase();
        const dg = v => String(v == null ? '' : v).replace(/[^0-9]/g, '').slice(-10);
        const byName = {};
        const listName = (id, r) => { const k = nm(r && r.name); if (k) (byName[k] = byName[k] || []).push(r); };
        Object.keys(roster).forEach(id => listName(id, roster[id]));
        const sameAsListed = row => (byName[nm(row.name)] || []).some(r =>
          !(nm(r.email) && nm(row.email) && nm(r.email) !== nm(row.email)) &&
          !(dg(r.phone) && dg(row.phone) && dg(r.phone) !== dg(row.phone)));
        let skippedCopies = 0;
        for (const row0 of liveRows) {
          if (only && !only.has(String(row0.id))) continue;
          if (roster[row0.id]) continue;
          if (!only && !nested[row0.id] && sameAsListed(row0)) { skippedCopies++; continue; }
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
          listName(row0.id, roster[row0.id]);
        }
        if (!added.length && only) {
          // Already in the list on the server, yet not showing: the delete record is what strips them.
          let undeleted = 0; try { undeleted = await undeleteIds(q, owner, Array.from(only)); } catch (e) {}
          res.status(200).json({ ok: true, addedToRoster: 0, clients: [], undeleted, note: 'Already in their list; taken off the delete record so it stops being removed.' }); return;
        }
        if (!added.length) { res.status(400).json({ error: 'Their list already has every live client.' + (skippedCopies ? ' ' + skippedCopies + ' leftover copies of listed clients were left out.' : '') }); return; }
        await q`INSERT INTO kv (owner,k,v,updated_at) VALUES (${owner},'sc_clients',${JSON.stringify(roster)},now())
          ON CONFLICT (owner,k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()`;
        let undeleted = 0;
        if (only) { try { undeleted = await undeleteIds(q, owner, Array.from(only)); } catch (e) {} }
        res.status(200).json({ ok: true, addedToRoster: added.length, clients: added, undeleted, skippedCopies,
          note: (skippedCopies ? skippedCopies + ' leftover copies of clients already in the list were left out. ' : '') + 'Added to the account list only. Nothing that was already there was changed, and the previous list is kept under Earlier copies.' });
        return;
      }

      // ── CLEAR THE JUNK CLIENT ROWS ───────────────────────────────────────
      // Ashley: "i saw it has all the junk data clients on the server still. we can get rid of all
      // of those." This is the only HARD delete of a provider's client rows anywhere in the app, so
      // every guard is here rather than in the caller:
      //
      //   • the classes are recomputed by classifyJunk, NEVER taken from the request. The request
      //     says which classes, so a stale report or a crafted id list cannot widen what is taken.
      //   • a full copy of every row about to go — id, name, email, phone and the whole data blob —
      //     is written to kv_history FIRST, under `sc_purged_clients` with reason 'before-purge'.
      //     pruneKey does not know that reason, so it is never pruned away. If the copy fails,
      //     NOTHING is deleted: a recovery tool that loses the last copy is worse than no tool.
      //   • every statement is scoped to provider_id, and the ids came from a provider-scoped read,
      //     so no other account's row is reachable from here (§0.1).
      //   • the delete record is deliberately NOT touched. It unions on pull and only grows, so
      //     clearing it on the account lets a device push the same ids straight back; and if a row
      //     delete failed, clearing the tombstone would resurrect the row. Leaving it costs a few KB
      //     and keeps the ids suppressed on every device whatever happens here.
      if (body.purgeClasses) {
        const want = Array.isArray(body.purgeClasses) ? body.purgeClasses.map(String) : [];
        const allowed = ['removed', 'deleted', 'stranger'];
        const classes = allowed.filter(c => want.indexOf(c) >= 0);
        if (!classes.length) { res.status(400).json({ error: 'Pass purgeClasses as some of: removed, deleted, stranger.' }); return; }
        if (body.confirm !== true) { res.status(400).json({ error: 'Pass confirm:true to actually delete.' }); return; }

        const cj = await classifyJunk(q, owner);
        const ids = [];
        // The Square customer behind each row, collected BEFORE the row goes — once it is deleted
        // there is nothing left to derive it from. Keyed by row id so only rows that were actually
        // deleted below contribute one; a row held back never reaches Square.
        const sqByRow = {};
        classes.forEach(c => (cj.junk[c] || []).forEach(r => {
          ids.push(String(r.id));
          if (r.sq) sqByRow[String(r.id)] = String(r.sq);
        }));
        if (!ids.length) { res.status(400).json({ error: 'There is nothing in those classes to clear.' }); return; }

        // THE COPY, before anything goes. Chunked because a provider can have thousands of rows and
        // one row per chunk keeps each history value a readable size.
        try { await ensureHistoryTable(); } catch (e) {}
        let kept = 0;
        try {
          for (let i = 0; i < ids.length; i += 250) {
            const batch = ids.slice(i, i + 250);
            const full = await q`SELECT id, name, email, phone, token, deleted_at, invited_at,
              opened_at, created_at, updated_at, data
              FROM clients WHERE provider_id=${owner} AND id = ANY(${batch}::text[])`;
            if (!full || !full.length) continue;
            const payload = JSON.stringify(full);
            await q`INSERT INTO kv_history (owner, k, v, bytes, items, reason)
              VALUES (${owner}, 'sc_purged_clients', ${payload}, ${payload.length}, ${full.length}, 'before-purge')`;
            kept += full.length;
          }
        } catch (e) {
          console.error('[client-recover] purge backup failed:', (e && e.message) || e);
          res.status(500).json({ error: 'Could not keep a copy of those records first, so nothing was deleted.' });
          return;
        }
        if (kept < ids.length) {
          res.status(500).json({ error: 'Only ' + kept + ' of ' + ids.length + ' records could be copied, so nothing was deleted.' });
          return;
        }

        let purged = 0, eventsGone = 0, pushGone = 0;
        const failed = [], squareIds = [];
        for (let i = 0; i < ids.length; i += 200) {
          const batch = ids.slice(i, i + 200);
          try {
            const ev = await q`DELETE FROM client_events WHERE provider_id=${owner}
              AND client_id = ANY(${batch}::text[]) RETURNING id`;
            eventsGone += (ev || []).length;
          } catch (e) { /* a submission row left behind is harmless; the client row is the point */ }
          try {
            const ps = await q`DELETE FROM push_subscriptions WHERE provider_id=${owner}
              AND client_id = ANY(${batch}::text[]) RETURNING id`;
            pushGone += (ps || []).length;
          } catch (e) { /* same */ }
          try {
            const dl = await q`DELETE FROM clients WHERE provider_id=${owner}
              AND id = ANY(${batch}::text[]) RETURNING id`;
            (dl || []).forEach(d => { purged++; const sq = sqByRow[String(d.id)]; if (sq) squareIds.push(sq); });
            try { await tombstoneClients(owner, (dl || []).map(d => String(d.id))); } catch (e) { /* the device delete record still hides them */ }
          } catch (e) { failed.push(batch.length); }
        }
        // SQUARE IS NOT DELETED FROM HERE. These ids go back to the app, which spends them against
        // /api/square/delete-customers — the one path that resolves the caller's OWN Square OAuth
        // connection (sqContext, CLAUDE.md §0.2). This endpoint is founder-gated and can act on ANY
        // provider by email, so if it called Square itself it would be doing so with whichever token
        // the server could reach, which is exactly the cross-account shape §0 exists to prevent.
        // Only the rows the DELETE actually returned contribute an id, so nothing held back, and
        // nothing that failed to delete, is ever sent to Square.
        res.status(200).json({ ok: true, purged, eventsGone, pushGone, keptCopies: kept,
          classes, asked: ids.length, failedBatches: failed.length,
          squareIds: Array.from(new Set(squareIds)),
          note: 'A full copy of every record deleted is under Earlier copies as sc_purged_clients. '
            + 'The delete record was left alone on purpose, so nothing can come back through a sync.' });
        return;
      }

      // PUT THE CLEARED CLIENTS BACK. The counterpart to purgeClasses, and the reason the purge is
      // allowed to exist at all: the copy it took is a full set of clients rows, so the rows can be
      // re-inserted exactly as they were, token included. `restorePurgedAll` does every copy from
      // the purge; `restorePurgedId` does one history row.
      //
      // ON CONFLICT DO NOTHING on purpose. If a client id is live again — she re-added them, or a
      // sync recreated them — the row that is there now is newer than this copy and must win; a
      // restore is not a licence to overwrite current work with a snapshot.
      if (body.restorePurgedId || body.restorePurgedAll) {
        try { await ensureHistoryTable(); } catch (e) {}
        let hrows = [];
        try {
          hrows = body.restorePurgedAll
            ? await q`SELECT id, v FROM kv_history WHERE owner=${owner} AND k='sc_purged_clients'
                AND reason='before-purge' ORDER BY id`
            : await q`SELECT id, v FROM kv_history WHERE owner=${owner} AND k='sc_purged_clients'
                AND id=${Number(body.restorePurgedId)}`;
        } catch (e) { res.status(500).json({ error: 'Could not read the copy.' }); return; }
        if (!hrows.length) { res.status(404).json({ error: 'There is no copy of cleared clients for this account.' }); return; }
        let back = 0, skipped = 0, bad = 0;
        for (const h of hrows) {
          let list = null;
          try { list = JSON.parse(String(h.v || '[]')); } catch (e) { bad++; continue; }
          if (!Array.isArray(list)) { bad++; continue; }
          for (const c of list) {
            if (!c || !c.id) { bad++; continue; }
            try {
              const r = await q`INSERT INTO clients
                (id, provider_id, token, name, email, phone, data, invited_at, opened_at, created_at, updated_at, deleted_at)
                VALUES (${String(c.id)}, ${owner}, ${String(c.token || ('restored_' + String(c.id)))},
                  ${c.name || ''}, ${c.email || ''}, ${c.phone || ''},
                  ${JSON.stringify(c.data || {})}::jsonb,
                  ${c.invited_at == null ? null : Number(c.invited_at)},
                  ${c.opened_at == null ? null : Number(c.opened_at)},
                  ${c.created_at == null ? null : Number(c.created_at)},
                  ${Date.now()},
                  ${c.deleted_at == null ? null : Number(c.deleted_at)})
                ON CONFLICT (id) DO NOTHING RETURNING id`;
              if (r && r.length) { back++; try { await clearClientTombstones(owner, [String(c.id)]); } catch (e) {} } else skipped++;
            } catch (e) { bad++; }
          }
        }
        res.status(200).json({ ok: true, restored: back, alreadyThere: skipped, unreadable: bad,
          copies: hrows.length,
          note: 'Rows that are live again were left as they are — whatever is on the account now is '
            + 'newer than this copy. Her delete record still hides the ones she deleted, so use '
            + '“Bring back” on a name to actually show one again.' });
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

      res.status(400).json({ error: 'Pass restoreIds, exportIds, purgeClasses or restorePurgedAll.' });
      return;
    }

    // ── GET: the diagnosis ───────────────────────────────────────────────────
    // data is a jsonb column, so it has to be cast before coalesce/length — `coalesce(data,'')`
    // fails with "invalid input syntax for type json" and 500s the whole lookup. Caught by
    // scripts/test-client-recover.mjs against a real PostgreSQL; it would have been invisible here.
    // opened_at joins the select for the junk report below: a client who has opened their own link
    // is a real person whatever their chart holds, so that row is never a candidate for a purge.
    const rows = await q`SELECT id, name, deleted_at, updated_at, invited_at, opened_at,
      length(coalesce(data::text,'')) AS bytes, data
      FROM clients WHERE provider_id=${owner} ORDER BY lower(coalesce(name,''))`;

    const clients = (rows || []).map(r => ({
      id: r.id,
      name: r.name || '',
      deleted: !!r.deleted_at,
      deletedAt: r.deleted_at ? Number(r.deleted_at) : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
      bytes: Number(r.bytes || 0),
      invitedAt: r.invited_at ? Number(r.invited_at) : null,
      openedAt: r.opened_at ? Number(r.opened_at) : null,
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
      // Per-client counts (ids and numbers only, never text) for the maps keyed by client id, so the
      // screen's search can say "this Cooper Howard row has 3 summaries" for one record among many.
      if (['sc_session_summaries', 'sc_client_recs', 'sc_client_homecare', 'sc_body_maps', 'sc_note_drafts'].includes(key) && !out.unreadable) {
        try {
          const rows = await q`SELECT entry.key AS id,
              (CASE WHEN jsonb_typeof(entry.value)='array' THEN jsonb_array_length(entry.value) ELSE 1 END)::int AS n
            FROM kv, jsonb_each(kv.v::jsonb) AS entry
            WHERE kv.owner=${owner} AND kv.k=${key} AND jsonb_typeof(kv.v::jsonb)='object' LIMIT 6000`;
          const by = {};
          rows.forEach(r => { if (r && r.id && Number(r.n) > 0) by[String(r.id)] = Number(r.n); });
          out.byClient = by;
        } catch (e) {}
      }
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

    // The purge report. Computed by the SAME function the purge itself uses, so what she approves
    // in this paste is exactly what a purge would take — see classifyJunk.
    let junk = { removed: [], deleted: [], stranger: [], kept: [] }, rosterReadable = false;
    try { const cj = await classifyJunk(q, owner); junk = cj.junk; rosterReadable = cj.rosterReadable; }
    catch (e) { console.error('[client-recover] junk report failed:', e && e.message); }

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

    // DEVICES (2026-10-17, Diana): what each of her devices says it holds (counts it sends on its own
    // when the app opens), every device signed in to this account, and any OTHER account signed in from
    // the same network lately: a phone on a second account looks exactly like "my phone loses things".
    // The provider does nothing for any of this. Founder-only like the rest of this endpoint.
    let devices = [], sessions = [], sameNetwork = [];
    try { devices = (await listDeviceReports(owner)).map(d => ({ device: d.device_key, at: d.updated_at, report: d.report })); } catch (e) { devices = []; }
    try {
      sessions = (await q`SELECT device, location, created_at, last_seen_at, revoked FROM sessions
                          WHERE provider_id = ${owner} ORDER BY last_seen_at DESC LIMIT 15`)
        .map(r => ({ device: r.device || '', location: r.location || '', signedIn: r.created_at, lastSeen: r.last_seen_at, signedOut: !!r.revoked }));
      const ips = (await q`SELECT DISTINCT ip FROM sessions WHERE provider_id = ${owner} AND ip IS NOT NULL AND ip <> ''
                           AND last_seen_at > now() - interval '60 days'`).map(r => r.ip);
      if (ips.length) {
        sameNetwork = (await q`SELECT p.email, p.name, s.device, max(s.last_seen_at) AS last_seen
                               FROM sessions s JOIN providers p ON p.id = s.provider_id
                               WHERE s.ip = ANY(${ips}) AND s.provider_id <> ${owner}
                                 AND s.last_seen_at > now() - interval '60 days'
                               GROUP BY p.email, p.name, s.device ORDER BY max(s.last_seen_at) DESC LIMIT 10`)
          .map(r => ({ email: r.email, name: r.name || '', device: r.device || '', lastSeen: r.last_seen }));
      }
    } catch (e) { /* sessions are a diagnostic extra; never fail the lookup over them */ }

    res.status(200).json({
      ok: true,
      verdict,
      devices,
      sessions,
      sameNetwork,
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
      // What a purge would take and what it would keep back, per class. ADDED, never changed: a
      // build that has not relaunched reads every key above exactly as before (CLAUDE.md §1a).
      junk: {
        removed: junk.removed, deleted: junk.deleted, stranger: junk.stranger,
        kept: junk.kept.slice(0, 400), keptTotal: junk.kept.length,
        rosterReadable,
        // How many in each class also exist as a customer in her Square directory, so the screen
        // can say what a Square clear-out would take before she ticks it.
        squareCounts: {
          removed: junk.removed.filter(r => r.sq).length,
          deleted: junk.deleted.filter(r => r.sq).length,
          stranger: junk.stranger.filter(r => r.sq).length
        }
      },
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
