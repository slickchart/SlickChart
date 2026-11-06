// GET /api/admin/health-sweep   Authorization: Monitor <key>  (or a founder session)
//
// The daily health sweep (2026-10-29). Ashley: "build your own system to sweep, monitor, and fix
// ongoing issues from now on". Every check here is a past incident in SESSION-HANDOFF.md turned into
// something the server can see BEFORE a provider has to report it: a shared Square merchant, a library
// that shrank, settings saved as `null`, a founder alert that reached no phone, a device whose saves
// are not reaching the account, a job that stopped running, a provider who cannot get in.
//
// Read-only. Counts and masked emails only: no client names, notes, messages or contact details ever
// leave this endpoint (a client is named by the last 4 characters of its id at most). Same owner-made,
// revocable key as push-state / new-providers / app-launches. Each check runs on its own, so one that
// fails is reported as "could not run" and never hides the others.
//
// Response: { at, build, checks: [{ id, title, level: 'ok'|'warn'|'alert', count, items: [text] }],
//             problems: [text] }   — problems lists every warn/alert line, worst first.
import { dbEnabled, sql, ensureProvidersTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { maskEmail } from '../../lib/app-launch-log.js';
import { APP_BUILD } from '../../lib/app-build.js';
import { ensureCronRunsTable } from '../../lib/cron-runs.js';

async function founderSession(req, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = secret && tok ? verifyToken(tok, secret) : null;
  if (!p) return false;
  try { if (p.sid && !(await isSessionValid(q, p.sid))) return false; } catch (e) {}
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  return founders.includes(String(p.e || '').toLowerCase());
}

// Libraries whose shrink means lost work (kv-history TRACKED keeps the copy from before the write).
const SHRINK_KEYS = ['sc_clients', 'sc_session_summaries', 'sc_client_recs', 'sc_client_homecare', 'sc_workspace', 'sc_forms', 'sc_brand_colors', 'sc_courses', 'sc_guides', 'sc_appts', 'sc_note_drafts'];
// Settings that once saved as the literal text `null` and reset a provider's hours/branding (§2q).
const SETTINGS_KEYS = ['sc_availability', 'sc_bizinfo', 'sc_brand_colors', 'sc_business_hours', 'sc_workspace', 'sc_forms'];
// Each scheduled job and the most time that may pass without a successful run (2-3x its schedule).
const CRONS = { 'cron-reminders': 45, 'cron-provider-reminders': 45, 'cron-checkins': 150, 'cron-automations': 150, 'cron-events': 150, 'cron-nurture': 150, 'cron-orphan-checkout': 150 };

const buildDate = b => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(b || '')); return m ? Date.parse(m[1] + 'T00:00:00Z') : 0; };
const tail = id => '…' + String(id || '').slice(-4);

// WHAT shrank, in counts, so a shrink can be judged from the brief without opening the provider's
// data (2026-10-30: "sc_forms went from 49970 to 3239 bytes" said nothing about whether a form was
// lost or one form was simply edited shorter). Compound libraries are broken down by part (the part
// names are the app's own, e.g. tmpls/guides), forms say how many went missing and how many of those
// she deleted herself. Only counts and the app's part names: never a client id, name or any content.
const COMPOUND = { sc_forms: 1, sc_workspace: 1 };
const entries = x => Array.isArray(x) ? x.length : (x && typeof x === 'object' ? Object.keys(x).length : 0);
// The delete record(s) the app keeps for each library (slickchart.html _TOMB_OBJ). A shrink whose
// missing ids are all in these is the provider deleting things, not data loss (2026-11-03: a provider
// tidying 3 clients, 2 courses and a finished note draft read as an ALERT).
export const DELETE_KEYS = { sc_clients: ['sc_deleted_clients', 'sc_merged_ids'], sc_courses: ['sc_hidden_courses'],
  sc_guides: ['sc_hidden_guides'], sc_appts: ['sc_deleted_appts'], sc_note_drafts: ['sc_deleted_note_drafts'], sc_forms: ['sc_hidden_forms'] };
// Ids of a library: an object keyed by id, or a list of {id}. null when the shape is neither.
function idsOf(x) {
  if (Array.isArray(x)) { const ids = x.map(e => e && typeof e === 'object' && e.id != null ? String(e.id) : null); return ids.every(Boolean) ? ids : null; }
  return (x && typeof x === 'object') ? Object.keys(x) : null;
}
// A delete record is {id: stamp} or [id, ...]; a negative stamp is a put-back (lib/clients.js).
function deletedSet(vals) {
  const out = {};
  for (const v of vals) { let o; try { o = JSON.parse(v); } catch (e) { continue; }
    if (Array.isArray(o)) o.forEach(id => { out[String(id)] = 1; });
    else if (o && typeof o === 'object') for (const [id, st] of Object.entries(o)) if (!(typeof st === 'number' && st < 0)) out[id] = 1; }
  return out;
}
// sc_note_drafts is {clientId: draft}. A draft leaves the map for one of four reasons, and only the
// last one can be work at risk. Its delete record keys are "nd:<clientId>" (slickchart.html
// _expireCommittedDraft), so a plain id lookup read every expiry as "not deleted by her" and raised a
// false alert. Counts and characters only, never text.
export function explainNoteDrafts(oldV, nowV, tomb, goneClients) {
  let a, b; try { a = JSON.parse(oldV); b = nowV == null ? {} : JSON.parse(nowV); } catch (e) { return ''; }
  if (!a || typeof a !== 'object' || Array.isArray(a)) return '';
  if (!b || typeof b !== 'object') b = {};
  tomb = tomb || {}; goneClients = goneClients || {};
  const typed = d => { let n = 0; try { const sec = d && d.sections; if (sec && typeof sec === 'object') for (const v of Object.values(sec)) n += String(v == null ? '' : v).trim().length; } catch (e) {} return n; };
  let expired = 0, client = 0, saved = 0, open = 0, openChars = 0, moved = 0;
  const gone = Object.keys(a).filter(id => !(id in b));
  for (const id of gone) {
    const d = a[id] || {};
    if (('nd:' + id) in tomb) expired++;
    else if (id in goneClients) client++;
    else if (d.committed) saved++;
    else { open++; openChars += typed(d); }
  }
  // An entry still there under the same id but now empty of typing is "moved/cleared", reported apart.
  for (const id of Object.keys(a)) if (id in b && typed(a[id]) > 0 && typed(b[id]) === 0) moved++;
  const mine = expired + client + saved;
  let out = '. Entries: ' + Object.keys(a).length + ' before, ' + Object.keys(b).length + ' now (' + mine + ' of the ' + gone.length + ' gone were deleted by her)';
  out += '. Gone: ' + expired + ' expired (visit saved), ' + client + ' client removed or merged, ' + saved + ' saved visit, ' + open + ' UNSAVED (' + openChars + ' typed characters)';
  if (moved) out += '; ' + moved + ' emptied in place';
  return out;
}
export function explainShrink(k, oldV, nowV, hiddenV) {
  let a, b, hid = {};
  try { a = JSON.parse(oldV); b = nowV == null ? null : JSON.parse(nowV); } catch (e) { return ''; }
  if (hiddenV && typeof hiddenV === 'object') hid = hiddenV; else try { hid = JSON.parse(hiddenV || '{}') || {}; } catch (e) {}
  if (!a || typeof a !== 'object') return '';
  if (!COMPOUND[k] || Array.isArray(a)) {
    let out = '. Entries: ' + entries(a) + ' before, ' + entries(b) + ' now';
    const ia = idsOf(a), ib = idsOf(b);
    if (ia && DELETE_KEYS[k]) {
      const now = new Set(ib || []);
      const gone = ia.filter(id => !now.has(id));
      if (gone.length) out += ' (' + gone.filter(id => id in hid).length + ' of the ' + gone.length + ' gone were deleted by her)';
    }
    return out;
  }
  const bb = (b && typeof b === 'object') ? b : {};
  const parts = [];
  for (const p of Object.keys(a)) {
    const ob = JSON.stringify(a[p] || '').length, nb = JSON.stringify(bb[p] == null ? '' : bb[p]).length;
    const oe = entries(a[p]), ne = entries(bb[p]);
    if (ne < oe || nb < ob * 0.75) parts.push(p + ' ' + oe + '\u2192' + ne + ' entries (' + ob + '\u2192' + nb + ' bytes)');
  }
  let out = parts.length ? '. Shrank: ' + parts.slice(0, 6).join(', ') : '';
  if (k === 'sc_forms' && a.tmpls && typeof a.tmpls === 'object') {
    const now = (bb.tmpls && typeof bb.tmpls === 'object') ? bb.tmpls : {};
    const gone = Object.keys(a.tmpls).filter(id => !(id in now));
    const deleted = gone.filter(id => id in hid).length;
    const shorter = Object.keys(a.tmpls).filter(id => id in now && JSON.stringify(now[id]).length < JSON.stringify(a.tmpls[id]).length * 0.75).length;
    out += '. Forms: ' + gone.length + ' gone (' + deleted + ' deleted by her), ' + shorter + ' edited much shorter';
  }
  return out;
}

export async function runSweep(q) {
  const checks = [];
  const emails = {};
  try { (await q`SELECT id, email FROM providers`).forEach(r => { emails[r.id] = maskEmail(r.email); }); } catch (e) {}
  const who = id => emails[id] || ('account ' + tail(id));
  async function check(id, title, fn) {
    try {
      const r = await fn();
      checks.push({ id, title, level: r.level || (r.items && r.items.length ? 'warn' : 'ok'), count: r.items ? r.items.length : 0, items: (r.items || []).slice(0, 25), note: r.note });
    } catch (e) {
      checks.push({ id, title, level: 'warn', count: 0, items: ['could not run: ' + String((e && e.message) || e).slice(0, 120)] });
    }
  }

  // 1. §0: two provider accounts on one Square merchant is the original cross-account incident.
  await check('isolation-square', 'No two accounts share a Square business', async () => {
    const rows = await q`SELECT merchant_id, array_agg(provider_id) AS ids FROM square_connections
      WHERE merchant_id IS NOT NULL AND merchant_id <> '' GROUP BY merchant_id HAVING count(DISTINCT provider_id) > 1`;
    return { level: rows.length ? 'alert' : 'ok', items: rows.map(r => 'Square business …' + String(r.merchant_id).slice(-4) + ' is connected to ' + r.ids.length + ' accounts: ' + r.ids.map(who).join(', ')) };
  });

  // 2. A library that shrank in the last day (kv_history keeps the copy from before each shrink).
  await check('data-shrink', 'No saved library shrank sharply in the last day', async () => {
    const rows = await q`SELECT h.owner, h.k, h.items AS old_items, h.bytes AS old_bytes, length(kv.v) AS now_bytes, h.saved_at,
        h.v AS old_v, kv.v AS now_v
      FROM kv_history h LEFT JOIN kv ON kv.owner = h.owner AND kv.k = h.k
      WHERE h.reason = 'shrink' AND h.saved_at > now() - interval '26 hours' AND h.k = ANY(${SHRINK_KEYS})
      ORDER BY h.saved_at DESC LIMIT 60`;
    // First run on live data (2026-10-29): a new provider clearing the 3 starter courses read as an
    // alert. A shrink of a few hundred bytes is a provider tidying up; an alert needs real work at stake.
    const seen = new Set(), items = []; let big = false;
    for (const r of rows) {
      const key = r.owner + '|' + r.k;
      if (seen.has(key) || !((r.old_bytes || 0) > 200 && (r.now_bytes || 0) < (r.old_bytes || 0) * 0.8)) continue;
      seen.add(key);
      let del = {};
      if (DELETE_KEYS[r.k]) { try { del = deletedSet((await q`SELECT v FROM kv WHERE owner = ${r.owner} AND k = ANY(${DELETE_KEYS[r.k]})`).map(x => x.v)); } catch (e) {} }
      let why;
      if (r.k === 'sc_note_drafts') {
        let gc = {};
        try { gc = deletedSet((await q`SELECT v FROM kv WHERE owner = ${r.owner} AND k = ANY(${['sc_deleted_clients', 'sc_merged_ids']})`).map(x => x.v)); } catch (e) {}
        why = explainNoteDrafts(r.old_v, r.now_v, del, gc);
      } else why = explainShrink(r.k, r.old_v, r.now_v, del);
      // Every missing entry is one she deleted (or a finished draft): tidying, not loss. Still listed.
      const m = / \((\d+) of the (\d+) gone were deleted by her\)/.exec(why);
      const allHers = !!(m && m[1] === m[2]);
      if ((r.old_bytes || 0) > 2000 && !allHers) big = true;
      items.push(who(r.owner) + ': ' + r.k + ' went from ' + r.old_bytes + ' to ' + (r.now_bytes || 0) + ' bytes (' + (r.old_items != null ? r.old_items + ' items before; ' : '') + 'earlier copy kept)' + why);
    }
    return { level: big ? 'alert' : (items.length ? 'warn' : 'ok'), items };
  });

  // 3. Settings stored as an empty value (§2q: hours saved as `null` reset every device).
  await check('settings-empty', 'No settings saved as empty', async () => {
    // Only accounts in use (signed in on some device in the last 2 days). The app repairs an empty
    // copy from the device the moment it opens (_healAvailability, _mergeStamped), so an empty value
    // on an account nobody has opened is harmless and waits for that; on an account in use it is a bug.
    const rows = await q`SELECT owner, k FROM kv WHERE k = ANY(${SETTINGS_KEYS}) AND (v IS NULL OR btrim(v) IN ('null', '', '""'))
      AND EXISTS (SELECT 1 FROM sessions s WHERE s.provider_id = kv.owner AND s.last_seen_at > now() - interval '2 days' AND NOT coalesce(s.revoked, false))`;
    return { items: rows.map(r => who(r.owner) + ': ' + r.k + ' is empty on the server') };
  });

  // 4. Founder alerts that reached no phone, and feedback that was never alerted (§0b, 2026-10-21).
  await check('founder-alerts', 'Every alert to Ashley went out', async () => {
    const rows = await q`SELECT kind, subject, skipped, devices, sent, detail, at FROM notify_log
      WHERE at > now() - interval '26 hours' AND (coalesce(sent, 0) = 0 OR coalesce(skipped, '') <> '' OR detail LIKE '%failed%')
      AND coalesce(skipped, '') NOT LIKE 'already announced%' AND coalesce(detail, '') NOT LIKE '%already covered%'
      ORDER BY at DESC LIMIT 20`;
    const items = rows.map(r => r.kind + ' alert' + (r.subject ? ' (' + maskEmail(r.subject) + ')' : '') + ': ' + (r.skipped ? 'skipped, ' + String(r.skipped).slice(0, 80) : 'reached ' + (r.sent || 0) + ' of ' + (r.devices || 0) + ' phones') + (r.detail ? '; ' + String(r.detail).slice(0, 80) : ''));
    try {
      const fb = await q`SELECT f.id FROM feedback f WHERE f.ts > now() - interval '26 hours' AND f.ts < now() - interval '10 minutes'
        AND coalesce(f.message, '') <> '' AND NOT EXISTS (SELECT 1 FROM notify_log n WHERE n.kind = 'feedback' AND n.at BETWEEN f.ts AND f.ts + interval '10 minutes')`;
      if (fb.length) items.push(fb.length + ' feedback message(s) with no alert record');
    } catch (e) {}
    return { level: items.length ? 'alert' : 'ok', items };
  });

  // 5. Devices whose saves are not reaching the account, or whose storage / loaders are failing.
  // The provider app's events list is ONE response, and Vercel refuses one over ~4.5 MB. Past that,
  // every poll failed and no form or check-in reached the provider (Josie, 2026-11-06). The list is
  // slimmed since build 2026-11-04i; this says how big the whole thing would be, per account.
  await check('events-size', 'Client submissions fit in one download', async () => {
    const rows = await q`SELECT provider_id, count(*)::int AS n, sum(octet_length(payload::text))::bigint AS bytes FROM (
        SELECT provider_id, payload, row_number() OVER (PARTITION BY provider_id ORDER BY created_at DESC) AS rn FROM client_events) t
      WHERE rn <= 2000 GROUP BY provider_id HAVING sum(octet_length(payload::text)) > 2500000 ORDER BY bytes DESC`;
    const items = rows.map(r => who(r.provider_id) + ': newest ' + r.n + ' events weigh ' + (Number(r.bytes) / 1e6).toFixed(1) + ' MB'
      + (Number(r.bytes) > 4300000 ? ' (over the 4.5 MB limit: builds before 2026-11-04i get NO submissions)' : ''));
    return { items, level: rows.some(r => Number(r.bytes) > 4300000) ? 'warn' : 'ok' };
  });

  await check('device-health', 'Every device is saving to the account', async () => {
    const rows = await q`SELECT provider_id, device_key, report, updated_at FROM device_reports WHERE updated_at > now() - interval '3 days'`;
    const items = [];
    for (const r of rows) {
      const p = r.report || {}, bad = [];
      // 1 or 2 is a save still in its few-second delay when the report was taken (first live run).
      if ((p.unsent || 0) >= 5) bad.push(p.unsent + ' changes not yet saved to the account');
      if ((p.memOnly || 0) > 0) bad.push(p.memOnly + ' items held only in memory');
      if (p.idbWorks === false) bad.push('device storage not working');
      if (p.reloadFails) bad.push('screens failing to reload: ' + String(p.reloadFails).slice(0, 80));
      if ((p.evPollFails || 0) >= 3) bad.push('client submissions are not reaching it: the last ' + p.evPollFails + ' checks for new forms and check-ins failed (status ' + (p.evPollStatus || '?') + ')');
      if ((p.storageKB || 0) > 4300) bad.push('device storage nearly full (' + p.storageKB + ' KB of about 5000)');
      if (bad.length) items.push(who(r.provider_id) + ', ' + (p.platform || '?') + ' ' + (p.kind || '') + ' …' + String(r.device_key).slice(-4) + ': ' + bad.join('; '));
    }
    return { items };
  });

  // 6. Scheduled jobs (client reminders, check-ins, automations): ran recently and finished OK.
  await check('scheduled-jobs', 'Every scheduled job is running', async () => {
    await ensureCronRunsTable(q);
    const rows = await q`SELECT DISTINCT ON (name) name, finished_at, ok, status, summary FROM cron_runs WHERE finished_at IS NOT NULL ORDER BY name, finished_at DESC`;
    const okRows = await q`SELECT name, max(finished_at) AS last_ok, count(*) FILTER (WHERE NOT ok AND finished_at > now() - interval '26 hours') AS fails
      FROM cron_runs WHERE finished_at IS NOT NULL GROUP BY name`;
    // Started and never finished (lib/cron-runs.js writes a row at the start): stopped for time.
    const stuck = {}, stuckAt = {}, speed = {};
    try { (await q`SELECT name, count(*)::int AS n, array_agg(to_char(started_at AT TIME ZONE 'UTC', 'HH24:MI') ORDER BY started_at) AS at FROM cron_runs WHERE finished_at IS NULL
      AND started_at < now() - interval '15 minutes' AND started_at > now() - interval '26 hours' GROUP BY name`).forEach(r => { stuck[r.name] = r.n; stuckAt[r.name] = r.at || []; }); } catch (e) {}
    // How long the FINISHED runs took, so a run that did not finish can be read against them: near
    // the platform's time limit means the job is too slow; far under it means something hung.
    try { (await q`SELECT name, count(*)::int AS n,
        round(max(extract(epoch FROM finished_at - started_at)))::int AS slowest,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - started_at)))::int AS typical
      FROM cron_runs WHERE finished_at IS NOT NULL AND started_at > now() - interval '26 hours' GROUP BY name`).forEach(r => { speed[r.name] = r; }); } catch (e) {}
    const last = {}; rows.forEach(r => { last[r.name] = r; });
    const lastOk = {}; okRows.forEach(r => { lastOk[r.name] = r; });
    const anyRecorded = rows.length > 0;
    const items = []; let level = 'ok';
    for (const [name, maxMin] of Object.entries(CRONS)) {
      const r = last[name];
      if (stuck[name]) {
        const sp = speed[name];
        const at = (stuckAt[name] || []).slice(0, 6).join(', ');
        items.push(name + ': started ' + stuck[name] + 'x in the last day and never finished (stopped for running too long?)'
          + (at ? '; started at ' + at + ' UTC' : '')
          + (sp ? '; the ' + sp.n + ' that finished took ' + sp.typical + 's typically, ' + sp.slowest + 's at most' : ''));
        level = 'alert';
      }
      if (!r) { if (anyRecorded && !stuck[name]) { items.push(name + ': no run recorded'); level = 'alert'; } continue; }
      const mins = Math.round((Date.now() - new Date(r.finished_at).getTime()) / 60000);
      if (mins > maxMin) { items.push(name + ': last ran ' + mins + ' minutes ago'); level = 'alert'; }
      if (!r.ok) { items.push(name + ': last run failed (status ' + r.status + ')'); if (level === 'ok') level = 'warn'; }
      const f = lastOk[name] && Number(lastOk[name].fails);
      if (f > 2) items.push(name + ': ' + f + ' failed runs in the last day');
    }
    return { level, items, note: anyRecorded ? undefined : 'no runs recorded yet (recording starts with build 2026-10-29b)' };
  });

  // 7. Square connections that should have refreshed and did not.
  await check('square-tokens', 'Every Square connection is current', async () => {
    let rows;
    try { rows = await q`SELECT provider_id, expires_at, refresh_error FROM square_connections WHERE expires_at IS NOT NULL AND expires_at < now() + interval '6 days'`; }
    catch (e) { rows = await q`SELECT provider_id, expires_at FROM square_connections WHERE expires_at IS NOT NULL AND expires_at < now() + interval '6 days'`; }
    const items = rows.map(r => who(r.provider_id) + ': Square sign-in ' + (new Date(r.expires_at) < new Date() ? 'EXPIRED ' : 'expires ') + new Date(r.expires_at).toISOString().slice(0, 10) + ' and has not refreshed' + (r.refresh_error ? ' (Square said: ' + String(r.refresh_error).slice(0, 80) + ')' : ''));
    return { level: rows.some(r => new Date(r.expires_at) < new Date()) ? 'alert' : (items.length ? 'warn' : 'ok'), items };
  });

  // 8. Billing: a provider using the app on a lapsed plan, or a paid plan with no account to use it.
  await check('billing', 'Every paying provider can get in', async () => {
    const items = [];
    const lapsed = await q`SELECT s.email, s.status FROM subscriptions s JOIN providers p ON lower(p.email) = lower(s.email)
      WHERE s.status IN ('past_due', 'unpaid', 'incomplete') AND EXISTS (SELECT 1 FROM sessions x WHERE x.provider_id = p.id AND x.last_seen_at > now() - interval '7 days')`;
    lapsed.forEach(r => items.push(maskEmail(r.email) + ': payment ' + r.status.replace('_', ' ') + ', still using the app'));
    // And what the automatic "finish your account" email (cron-orphan-checkout) did for each, so the
    // brief can say "emailed Nov 1, still nothing" instead of guessing whether anyone was told.
    let orphan = [];
    try {
      orphan = await q`SELECT s.email, s.updated_at,
          (SELECT to_char(sent_at AT TIME ZONE 'UTC', 'Mon DD HH24:MI') FROM nurture_sends n WHERE n.email = lower(s.email) AND n.seq = 'orphan' AND n.step = 0) AS emailed,
          (SELECT to_char(sent_at AT TIME ZONE 'UTC', 'Mon DD HH24:MI') FROM nurture_sends n WHERE n.email = lower(s.email) AND n.seq = 'orphan' AND n.step = 1) AS alerted,
          EXISTS (SELECT 1 FROM nurture_optout o WHERE o.email = lower(s.email)) AS unsub
        FROM subscriptions s WHERE s.status = 'active' AND s.updated_at < now() - interval '3 hours'
        AND s.updated_at > now() - interval '30 days' AND NOT EXISTS (SELECT 1 FROM providers p WHERE lower(p.email) = lower(s.email))
        AND coalesce(s.stripe_subscription_id, '') <> ''`;
    } catch (e) {
      orphan = await q`SELECT s.email FROM subscriptions s WHERE s.status = 'active' AND s.updated_at < now() - interval '3 hours'
        AND s.updated_at > now() - interval '30 days' AND NOT EXISTS (SELECT 1 FROM providers p WHERE lower(p.email) = lower(s.email))
        AND coalesce(s.stripe_subscription_id, '') <> ''`;
    }
    orphan.forEach(r => items.push(maskEmail(r.email) + ': paid but has no SlickChart account'
      + (r.emailed ? '; setup email sent ' + r.emailed + ' UTC' : (r.unsub ? '; unsubscribed, so no setup email' : (('emailed' in r) ? '; setup email NOT sent yet' : '')))
      + (r.alerted ? '; you were told ' + r.alerted + ' UTC' : '')));
    return { level: orphan.length ? 'alert' : (items.length ? 'warn' : 'ok'), items };
  });

  // 9. Someone who keeps failing to sign in (rows are cleared on a successful sign-in).
  await check('sign-in', 'Nobody is stuck at sign-in', async () => {
    const rows = await q`SELECT lower(email) AS email, count(*)::int AS n, max(ts) AS last FROM login_attempts
      WHERE ts > now() - interval '26 hours' GROUP BY lower(email) HAVING count(*) >= 3 ORDER BY n DESC LIMIT 15`;
    const known = new Set((await q`SELECT lower(email) AS e FROM providers`).map(r => r.e));
    return { items: rows.map(r => maskEmail(r.email) + ': ' + r.n + ' failed sign-ins, still not in' + (known.has(r.email) ? '' : ' (no account with this email)')) };
  });

  // 10. App launch logs: the app signing someone out, or erroring.
  await check('app-logs', 'No phone was signed out or hit an error', async () => {
    const rows = await q`SELECT device_key, email, platform, build, events FROM app_launch_logs WHERE updated_at > now() - interval '26 hours'`;
    const since = Date.now() - 26 * 3600 * 1000, items = [];
    for (const r of rows) {
      const ev = (Array.isArray(r.events) ? r.events : []).filter(e => e && Number(e.t) > since);
      const dropped = ev.filter(e => e.e === 'token-dropped').length;
      const errs = ev.filter(e => e.e === 'error').length;
      const offline = ev.filter(e => e.e === 'offline-page-shown').length;
      const cut = ev.filter(e => e.e === 'prev-launch-cut-off').length;
      const bits = [];
      if (dropped) bits.push('signed out by the app ' + dropped + 'x');
      if (errs) bits.push(errs + ' error(s)');
      if (offline) bits.push('offline page shown ' + offline + 'x');
      if (cut > 1) bits.push('app closed mid-launch ' + cut + 'x');
      if (bits.length) items.push((maskEmail(r.email) || '(not signed in)') + ', ' + r.platform + ' ' + (r.build || '') + ': ' + bits.join(', '));
    }
    return { items };
  });

  // 11. Devices still on an old build after a few days (they never relaunched, or cannot update).
  await check('stale-builds', 'Every active device is on a current build', async () => {
    const rows = await q`SELECT provider_id, device_key, report FROM device_reports WHERE updated_at > now() - interval '2 days'`;
    const live = buildDate(APP_BUILD);
    const items = rows.filter(r => live && buildDate(r.report && r.report.build) && live - buildDate(r.report.build) > 5 * 86400000)
      .map(r => who(r.provider_id) + ', ' + ((r.report && r.report.platform) || '?') + ': still on ' + r.report.build);
    return { items };
  });

  // 12. Push to provider phones failing (native_push_log), grouped by reason.
  await check('phone-push', 'Phone notifications are being accepted', async () => {
    const rows = await q`SELECT outcome, reason, count(*)::int AS n, to_char(max(at) AT TIME ZONE 'UTC', 'Mon DD HH24:MI') AS last FROM native_push_log WHERE at > now() - interval '26 hours'
      AND (outcome LIKE 'removed%' OR outcome LIKE 'send failed%') GROUP BY outcome, reason ORDER BY n DESC LIMIT 10`;
    // The LAST time each failure happened, so a fix (e.g. the Apple key added) can be confirmed by
    // reading: a failure that stopped before the fix only ages out of the 26-hour window.
    return { items: rows.map(r => r.n + 'x ' + r.outcome + (r.reason ? ': ' + String(r.reason).slice(0, 80) : '') + (r.last ? ' (last ' + r.last + ' UTC)' : '')) };
  });

  // 13. New providers who signed in but never finished setup (2026-10-24).
  await check('new-setup', 'Every new provider finished setup', async () => {
    const rows = await q`SELECT p.id FROM providers p WHERE p.created_at < now() - interval '6 hours' AND p.created_at > now() - interval '7 days'
      AND EXISTS (SELECT 1 FROM sessions s WHERE s.provider_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM kv WHERE kv.owner = p.id AND kv.k = 'sc_onboarded')`;
    return { items: rows.map(r => who(r.id) + ': signed in but setup never saved') };
  });

  // 14. Duplicate bursts: many clients created at once, or the same email twice (2026-10-15 "47 bookings").
  await check('duplicates', 'No burst of duplicate clients', async () => {
    const dayAgo = Date.now() - 86400000;
    // A provider who joined this week is importing her list (542 in a day on the first live run).
    const burst = await q`SELECT c.provider_id, count(*)::int AS n FROM clients c JOIN providers p ON p.id = c.provider_id
      WHERE c.created_at > ${dayAgo} AND c.deleted_at IS NULL AND p.created_at < now() - interval '7 days'
      GROUP BY c.provider_id HAVING count(*) > 40`;
    // A shared email on its own is normal (a mum booking for her daughters, a couple), and a standing
    // count repeated it as a warning every morning without anything changing (2026-10-31: six accounts,
    // 31-79 each, the same numbers day after day). Warn only on what is NEW: a shared email whose newest
    // copy was made in the last day. The standing totals stay in the note, split into same name (likely
    // one person twice) and different names (family members), so nothing is hidden.
    const dup = await q`SELECT provider_id, count(*)::int AS n,
        sum(CASE WHEN names = 1 THEN 1 ELSE 0 END)::int AS same,
        sum(CASE WHEN newest > ${dayAgo} THEN 1 ELSE 0 END)::int AS fresh,
        sum(CASE WHEN newest > ${dayAgo} AND names = 1 THEN 1 ELSE 0 END)::int AS fresh_same
      FROM (SELECT provider_id, count(DISTINCT lower(trim(coalesce(name, '')))) AS names, max(created_at) AS newest FROM clients
        WHERE deleted_at IS NULL AND coalesce(email, '') <> '' GROUP BY provider_id, lower(email) HAVING count(*) > 1) d
      GROUP BY provider_id`;
    const fresh = dup.filter(r => r.fresh >= 5);
    const standing = dup.filter(r => r.n >= 25);
    // WHERE the same-name copies are (2026-11-02, Ashley: "find out why it's happening"). Counts only.
    // A copy she can SEE is one whose id is still in her app's own list (kv sc_clients); a copy that
    // is only a server row was already merged or removed in the app and is invisible to her. And WHEN
    // the newest copy of each pair was made, so a leftover from the 2026-10-15 fix reads differently
    // from something still being created.
    const detail = {};
    for (const r of standing.filter(x => x.same > 0).slice(0, 12)) {
      try {
        const groups = await q`SELECT array_agg(id) AS ids, max(created_at) AS newest,
            array_agg(DISTINCT CASE WHEN left(id, 3) = 'sq_' THEN 'sq' WHEN left(id, 5) = 'c_bk_' THEN 'bk' WHEN left(id, 2) = 'c_' THEN 'c_' ELSE 'c' END) AS kinds
          FROM clients WHERE provider_id = ${r.provider_id} AND deleted_at IS NULL AND coalesce(email, '') <> ''
          GROUP BY lower(email) HAVING count(*) > 1 AND count(DISTINCT lower(trim(coalesce(name, '')))) = 1`;
        let mine = null;
        try { const kv = await q`SELECT v FROM kv WHERE owner = ${r.provider_id} AND k = 'sc_clients'`; const o = kv[0] && JSON.parse(kv[0].v); if (o && typeof o === 'object' && !Array.isArray(o)) mine = new Set(Object.keys(o)); } catch (e) {}
        const d = { seen: 0, serverOnly: 0, d7: 0, d30: 0, older: 0, kinds: {} };
        const wk = Date.now() - 7 * 86400000, mo = Date.now() - 30 * 86400000;
        for (const g of groups) {
          if (mine) { const inList = (g.ids || []).filter(id => mine.has(String(id))).length; if (inList > 1) d.seen++; else d.serverOnly++; }
          const t = Number(g.newest) || Date.parse(g.newest) || 0;
          if (t > wk) d.d7++; else if (t > mo) d.d30++; else d.older++;
          const k = (g.kinds || []).slice().sort().join('+'); d.kinds[k] = (d.kinds[k] || 0) + 1;
        }
        detail[r.provider_id] = (mine ? d.seen + ' both in her list, ' + d.serverOnly + ' only one in her list' : 'her list not readable')
          + '; newest copy: ' + d.d7 + ' this week, ' + d.d30 + ' this month, ' + d.older + ' older'
          + '; id kinds ' + Object.entries(d.kinds).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => k + ' ' + n).join(', ')
        // What her own app did about them at its last automatic merge (device report, counts and field
        // names only): left copies and the field that differed, so a pair left for her is explained.
        try {
          const dr = await q`SELECT report FROM device_reports WHERE provider_id = ${r.provider_id} AND report ? 'dupesLeft' ORDER BY updated_at DESC LIMIT 1`;
          const rep = dr[0] && dr[0].report;
          if (rep) detail[r.provider_id] += '; her app last merged ' + (Number(rep.dupesMerged) || 0) + ', left ' + (Number(rep.dupesLeft) || 0) + ' for her' + (rep.dupesWhy ? ' (' + rep.dupesWhy + ')' : '');
        } catch (e) {}
      } catch (e) { detail[r.provider_id] = 'detail failed: ' + (e && e.message); }
    }
    return { items: burst.map(r => who(r.provider_id) + ': ' + r.n + ' clients added in the last day')
      .concat(fresh.map(r => who(r.provider_id) + ': ' + r.fresh + ' emails newly on more than one client today (' + r.fresh_same + ' with the same name)')),
      note: standing.length ? 'Shared emails, standing (not new): ' + standing.map(r => who(r.provider_id) + ' ' + r.n + ' (' + r.same + ' same name' + (detail[r.provider_id] ? ': ' + detail[r.provider_id] : '') + ')').join(', ') : undefined };
  });

  // 15. A client the provider deleted that is still live on the server (Cooper Howard, 2026-10-21).
  await check('deleted-but-live', 'Deleted clients stay deleted', async () => {
    const rows = await q`SELECT owner, k, v FROM kv WHERE k IN ('sc_deleted_clients', 'sc_undeleted_clients')`;
    const del = {}, und = {};
    rows.forEach(r => { let o = null; try { o = JSON.parse(r.v); } catch (e) {} if (o && typeof o === 'object' && !Array.isArray(o)) (r.k === 'sc_deleted_clients' ? del : und)[r.owner] = o; });
    const items = [];
    for (const owner of Object.keys(del)) {
      const st = v => (typeof v === 'number' && Number.isFinite(v)) ? v : (v ? 1 : 0);
      // Same rule as the app and lib/clients.js reconcileDeletedClients: a negative stamp is a put-back.
      const ids = Object.keys(del[owner]).filter(id => { const d = st(del[owner][id]), u = st((und[owner] || {})[id]); return d > 0 && d > u; });
      if (!ids.length) continue;
      const live = await q`SELECT count(*)::int AS n FROM clients WHERE provider_id = ${owner} AND deleted_at IS NULL AND id = ANY(${ids.slice(0, 2000)})`;
      if (live[0] && live[0].n > 0) items.push(who(owner) + ': ' + live[0].n + ' client(s) she deleted are still live on the server');
    }
    return { items };
  });

  const rank = { alert: 0, warn: 1, ok: 2 };
  checks.sort((a, b) => rank[a.level] - rank[b.level]);
  const problems = [];
  checks.filter(c => c.level !== 'ok').forEach(c => c.items.forEach(i => problems.push((c.level === 'alert' ? 'ALERT ' : '') + c.title + ': ' + i)));
  return { at: new Date().toISOString(), build: APP_BUILD, checks, problems };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const q = sql();
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  let ok = false;
  try { ok = (await monitorKeyOk(req, q, owner)) || (await founderSession(req, q)); } catch (e) { ok = false; }
  if (!ok) { res.status(403).json({ error: 'Owner-only.' }); return; }
  try { await ensureProvidersTable(); } catch (e) {}
  res.status(200).json(await runSweep(q));
}
