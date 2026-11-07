// GET /api/admin/client-forms?name=<part of a name>   Authorization: Monitor <key>
//
// Read-only. Where did ONE of the founder's own clients' forms go? (Josie, 2026-11-07: her intake,
// done at home AND with Sign here, never showed on her profile through four fixes.) Ashley said yes to
// Claude reading this with the key she already made for the alert diagnosis (push-state). It answers
// for the OWNER_EMAIL account only, never another provider: the account is resolved from the server's
// own env, not from the request. Form names, dates, ids and counts; never an answer, note or contact.
import { dbEnabled, sql } from '../../lib/db.js';
import { monitorKeyOk } from '../feedback.js';

const tail = v => String(v || '').slice(-6);
const iso = v => { const n = Number(v); return n ? new Date(n).toISOString() : (v ? String(v) : null); };
function parse(t) { try { return typeof t === 'string' ? JSON.parse(t) : t; } catch (e) { return null; } }
function recs(v) { const o = parse(v); if (!o) return []; return Array.isArray(o) ? o.map(r => [r && r.id, r]) : Object.entries(o); }
function formsOf(r) {
  return (Array.isArray(r && r.submittedForms) ? r.submittedForms : []).map(f => ({ formId: f && f.formId, title: f && f.title, ev: f && f.evId ? tail(f.evId) : null, at: iso(f && f.at), signed: !!(f && f.signed), by: (f && (f.filledBy || (f.sod ? 'sign here' : ''))) || '' }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const q = sql();
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  let ok = false;
  try { ok = await monitorKeyOk(req, q, owner); } catch (e) { ok = false; }
  if (!ok) { res.status(403).json({ error: 'Owner-only.' }); return; }
  const name = String((req.query && req.query.name) || '').trim().toLowerCase();
  if (name.length < 3) { res.status(400).json({ error: 'name: at least 3 letters' }); return; }
  const pr = await q`SELECT id FROM providers WHERE lower(email) = ${owner} LIMIT 1`;
  if (!pr.length) { res.status(404).json({ error: 'no account' }); return; }
  const p = pr[0].id;
  const like = '%' + name + '%';
  const out = { name };
  const rows = await q`SELECT id, name, deleted_at, invited_at, opened_at, created_at, updated_at, (token IS NOT NULL AND token <> '') AS has_token,
      jsonb_array_length(CASE WHEN jsonb_typeof(data->'forms')='array' THEN data->'forms' ELSE '[]'::jsonb END) AS blob_forms
    FROM clients WHERE provider_id = ${p} AND lower(coalesce(name,'')) LIKE ${like}`;
  const ids = rows.map(r => String(r.id));
  out.serverRows = rows.map(r => ({ id: r.id, name: r.name, removed: r.deleted_at ? iso(r.deleted_at) : null, invited: iso(r.invited_at), opened: iso(r.opened_at), created: iso(r.created_at), updated: iso(r.updated_at), hasLink: r.has_token, formsInBlob: r.blob_forms }));
  const ev = ids.length ? await q`SELECT id, client_id, kind, payload->>'formId' AS fid, payload->>'title' AS title, payload->>'signed' AS signed, created_at
    FROM client_events WHERE provider_id = ${p} AND client_id = ANY(${ids}::text[]) ORDER BY created_at DESC LIMIT 200` : [];
  out.events = ev.map(e => ({ ev: tail(e.id), client: e.client_id, kind: e.kind, formId: e.fid, title: e.title, signed: e.signed, at: iso(e.created_at) }));
  // Forms anywhere in the account in the last 10 days (no names), and forms on ids with no client row.
  const since = Date.now() - 10 * 86400000;
  const recent = await q`SELECT e.id, e.client_id, e.kind, e.payload->>'formId' AS fid, e.payload->>'title' AS title, e.created_at, (c.id IS NULL) AS no_row, c.deleted_at
    FROM client_events e LEFT JOIN clients c ON c.id = e.client_id AND c.provider_id = ${p}
    WHERE e.provider_id = ${p} AND e.kind = 'form' AND e.created_at > ${since} ORDER BY e.created_at DESC LIMIT 60`;
  out.recentForms = recent.map(e => ({ ev: tail(e.id), client: ids.includes(String(e.client_id)) ? e.client_id : '…' + tail(e.client_id), formId: e.fid, title: e.title, at: iso(e.created_at), noClientRow: e.no_row, rowRemoved: !!e.deleted_at }));
  const orph = await q`SELECT count(*)::int AS n FROM client_events e WHERE e.provider_id = ${p} AND e.kind = 'form'
    AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = e.client_id AND c.provider_id = ${p})`;
  out.formEventsWithNoClientRow = orph[0] ? orph[0].n : 0;
  // The account's own list (what every device loads) and its delete / merge records.
  const kv = await q`SELECT k, v FROM kv WHERE owner = ${p} AND k IN ('sc_clients','sc_merged_into','sc_deleted_clients','sc_undeleted_clients')`;
  const K = {}; kv.forEach(r => { K[r.k] = r.v; });
  const match = (id, r) => r && String(r.name || '').toLowerCase().includes(name);
  out.accountList = recs(K.sc_clients).filter(([id, r]) => match(id, r)).map(([id, r]) => ({ id, name: r.name, forms: formsOf(r), signedForms: Array.isArray(r.signedForms) ? r.signedForms : [], pending: (Array.isArray(r.pendingForms) ? r.pendingForms : []).map(x => x && x.formId), hasLink: !!r._token, squareId: r.squareId ? tail(r.squareId) : null, appInvited: !!r.appInvited, fvpForms: r.fvpForms || null, uAt: iso(r._uAt) }));
  const listIds = out.accountList.map(x => String(x.id)).concat(ids);
  const mi = parse(K.sc_merged_into) || {};
  out.mergedInto = Object.entries(mi).filter(([a, b]) => listIds.includes(String(a)) || listIds.includes(String(b)));
  const dl = parse(K.sc_deleted_clients) || {}, ud = parse(K.sc_undeleted_clients) || {};
  out.deleteRecord = listIds.filter(id => dl[id]).map(id => ({ id, at: iso(dl[id]), undeleted: ud[id] ? iso(ud[id]) : null }));
  // Earlier copies of the list: did any of them hold her forms?
  const hist = await q`SELECT id, reason, saved_at, v FROM kv_history WHERE owner = ${p} AND k = 'sc_clients' ORDER BY saved_at DESC LIMIT 40`;
  out.earlierCopies = hist.map(h => {
    const m = recs(h.v).filter(([id, r]) => match(id, r));
    return { copy: h.id, reason: h.reason, at: h.saved_at, matches: m.map(([id, r]) => ({ id, forms: formsOf(r).map(f => f.formId + (f.ev ? '#' + f.ev : '') + '@' + (f.at || '')) })) };
  });
  res.status(200).json(out);
}
