// The SERVER half of several Google accounts: lib/google-cal.js against a stubbed Postgres and a
// stubbed Google. The browser test covers what she sees; this covers what could cost her data.
//
// The expensive mistakes:
//   - the existing single connection loses its event_map on migration, so every appointment it had
//     already written looks new and gets created a SECOND time: a duplicate of her whole calendar
//   - two accounts share one event_map, so the second calendar PATCHes ids that do not exist in it
//   - disconnecting one account takes the others' rows with it
//   - one dead account stops the healthy ones syncing, or hides their busy time so a client is
//     offered a slot she is already booked in
//   - an account id from somewhere else deletes a row that is not the caller's (CLAUDE.md §0.1)
//
// lib/db.js imports @neondatabase/serverless, which is not installed here (CLAUDE.md §3), so the
// module is loaded with that import swapped for a tiny in-memory SQL stub. The logic under test is
// the real file's text.
//
//   node scratchpad/test-gcal-multi-db.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SRC = new URL('../slickchart-vercel/lib/google-cal.js', import.meta.url).pathname;
const OUT = join(process.env.TMPDIR || '/tmp', 'sc-gcal-undertest.mjs');

// ── a very small SQL engine, just enough for the statements this module runs ────────────────────
const DB = { google_connections: [], google_accounts: [] };
function reset() { DB.google_connections = []; DB.google_accounts = []; }
const norm = s => String(s).replace(/\s+/g, ' ').trim();

function runSQL(strings, values) {
  const text = norm(strings.join('\u0000'));
  const v = values.slice();
  const take = () => v.shift();
  const lower = text.toLowerCase();

  if (/^create table|^create index|^alter table/.test(lower)) return [];

  if (lower.startsWith('select')) {
    const table = /from (\w+)/.exec(lower)[1];
    const pid = take();
    let rows = DB[table].filter(r => String(r.provider_id) === String(pid));
    rows.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    return rows.map(r => Object.assign({}, r));
  }

  if (lower.startsWith('insert into google_accounts')) {
    const [id, provider_id, label, access_token, refresh_token, expires_at,
           calendar_ids, event_map, private_titles, last_ok, last_error, created_at, updated_at] =
      [take(), take(), take(), take(), take(), take(), take(), take(), take(), take(), take(), take(), take()];
    const existing = DB.google_accounts.find(r => r.id === id);
    if (existing) {
      if (/do nothing/.test(lower)) return [];
      if (label !== '') existing.label = label;
      existing.access_token = access_token;
      if (refresh_token != null) existing.refresh_token = refresh_token;
      existing.expires_at = expires_at; existing.last_ok = last_ok;
      existing.last_error = null; existing.updated_at = updated_at;
      return [];
    }
    DB.google_accounts.push({ id, provider_id, label, access_token, refresh_token, expires_at,
      calendar_ids, event_map, private_titles, last_ok, last_error, created_at, updated_at });
    return [];
  }

  if (lower.startsWith('insert into google_connections')) {
    const [provider_id, access_token, refresh_token, expires_at, calendar_ids, last_ok, last_error, created_at, updated_at] =
      [take(), take(), take(), take(), take(), take(), take(), take(), take()];
    const ex = DB.google_connections.find(r => r.provider_id === provider_id);
    if (ex) { Object.assign(ex, { access_token, expires_at, last_ok, last_error: null, updated_at }); if (refresh_token != null) ex.refresh_token = refresh_token; return []; }
    DB.google_connections.push({ provider_id, access_token, refresh_token, expires_at, calendar_ids,
      event_map: '{}', private_titles: false, last_ok, last_error, created_at, updated_at });
    return [];
  }

  if (lower.startsWith('update google_accounts')) {
    // Parse ONLY the SET clause. Scanning the whole statement also matches the WHERE's `id=?`,
    // which swallows the lookup parameter and makes every UPDATE silently hit no rows.
    const setPart = text.slice(0, (text.toLowerCase().indexOf(' where ') + 1) || text.length);
    const sets = []; const re = /(\w+)=\u0000/g; let m;
    while ((m = re.exec(setPart))) sets.push(m[1]);
    const vals = {}; sets.forEach(k => { vals[k] = take(); });
    const byId = / where id=/.test(lower);
    const key = take();
    DB.google_accounts.forEach(r => {
      if (byId ? r.id !== key : String(r.provider_id) !== String(key)) return;
      Object.assign(r, vals);
      if (/last_error=null/.test(lower)) r.last_error = null;
    });
    return [];
  }
  if (lower.startsWith('update google_connections')) return [];

  if (lower.startsWith('delete from google_accounts')) {
    const id = take();
    const pid = / and provider_id=/.test(lower) ? take() : null;
    DB.google_accounts = DB.google_accounts.filter(r =>
      pid === null ? String(r.provider_id) !== String(id)
                   : !(r.id === id && String(r.provider_id) === String(pid)));
    return [];
  }
  if (lower.startsWith('delete from google_connections')) {
    const pid = take();
    DB.google_connections = DB.google_connections.filter(r => String(r.provider_id) !== String(pid));
    return [];
  }
  throw new Error('stub SQL does not handle: ' + text.replace(/\u0000/g, '?').slice(0, 120));
}

let src = readFileSync(SRC, 'utf8');
const IMPORT = "import { sql, dbEnabled } from './db.js';";
if (!src.includes(IMPORT)) { console.error('the db import moved; update this test'); process.exit(1); }
src = src.replace(IMPORT,
  "const dbEnabled=()=>true;\nconst sql=()=>((s,...v)=>globalThis.__SCSQL(s,v));");
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, src);
globalThis.__SCSQL = runSQL;
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'secret';
const G = await import('file://' + OUT);

// ── a stubbed Google ────────────────────────────────────────────────────────────────────────────
let CAL = {};                 // accessToken -> { summary, events:{id:body}, nextId, fail }
let created = 0, patched = 0, deleted = 0;
function stubGoogle() {
  created = patched = deleted = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const auth = String((opts.headers && opts.headers.Authorization) || '').replace('Bearer ', '');
    const cal = CAL[auth];
    const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
    if (u.includes('oauth2.googleapis.com/token') || u.includes('/token')) {
      const body = String(opts.body || '');
      const rt = /refresh_token=([^&]+)/.exec(body);
      const tok = rt ? 'fresh-' + decodeURIComponent(rt[1]) : 'fresh';
      if (CAL[tok] === undefined && rt) CAL[tok] = CAL['stale-' + decodeURIComponent(rt[1])] || { summary: '', events: {}, nextId: 1 };
      return json({ access_token: tok, expires_in: 3600 });
    }
    if (!cal) return json({ error: 'bad token' }, false, 401);
    // Event ids are unique PER CALENDAR in reality, so the stub prefixes with the account - a stub
    // that numbered both from 1 would hide a shared-map bug behind a coincidence.
    if (opts.method === 'POST') { const id = auth + '-ev' + (cal.nextId++); cal.events[id] = JSON.parse(opts.body); created++; return json({ id }); }
    if (opts.method === 'PATCH') { const id = decodeURIComponent(u.split('/events/')[1]); if (!cal.events[id]) return json({}, false, 404); patched++; return json({ id }); }
    if (opts.method === 'DELETE') { const id = decodeURIComponent(u.split('/events/')[1]); delete cal.events[id]; deleted++; return json({}); }
    return json({ summary: cal.summary, items: Object.entries(cal.events).map(([id, b]) => Object.assign({ id }, b)) });
  };
}

const results = [];
const check = (n, p, d) => results.push({ name: n, pass: p, detail: d || '' });
const APPT = { id: 'a1', dateISO: '2026-10-20', startMins: 600, durMins: 60, tx: 'Facial', title: 'A Facial' };

// 1. THE BIG ONE: an existing single connection migrates WITHOUT re-creating her calendar.
{
  reset(); stubGoogle();
  CAL['tok-old'] = { summary: 'ashley@slickchart.app', events: { evOLD: {} }, nextId: 9 };
  DB.google_connections.push({ provider_id: 'p1', access_token: 'tok-old', refresh_token: 'r1',
    expires_at: Date.now() + 3600000, calendar_ids: 'primary',
    event_map: JSON.stringify({ a1: 'evOLD' }), private_titles: false, last_ok: 1, last_error: null });

  const accts = await G.listGoogleAccounts('p1');
  check('legacy connection is migrated into the accounts table', accts.length === 1, 'got ' + accts.length);
  check('legacy connection KEEPS its event_map',
    JSON.parse(accts[0].event_map || '{}').a1 === 'evOLD', accts[0] && accts[0].event_map);

  const r = await G.syncApptsToGoogle('p1', [APPT]);
  check('the already-synced appointment is PATCHED, not duplicated',
    r.updated === 1 && r.created === 0, JSON.stringify(r));
  check('no second copy appeared in her calendar', created === 0, 'created ' + created);
}

// 2. Two accounts: each gets the appointment, each keeps its OWN map.
{
  reset(); stubGoogle();
  CAL['t1'] = { summary: 'one@x.com', events: {}, nextId: 1 };
  CAL['t2'] = { summary: 'two@y.com', events: {}, nextId: 1 };
  await G.saveGoogleAccount('p2', { access_token: 't1', refresh_token: 'r1', expires_in: 3600 });
  await G.saveGoogleAccount('p2', { access_token: 't2', refresh_token: 'r2', expires_in: 3600 });
  const accts = await G.listGoogleAccounts('p2');
  check('two accounts are stored separately', accts.length === 2, 'got ' + accts.length);
  check('each is labelled with its own calendar',
    accts.map(a => a.label).sort().join(',') === 'one@x.com,two@y.com', JSON.stringify(accts.map(a => a.label)));

  const r = await G.syncApptsToGoogle('p2', [APPT]);
  check('the appointment reaches BOTH calendars', r.created === 2 && r.accounts === 2, JSON.stringify(r));
  const after = await G.listGoogleAccounts('p2');
  const maps = after.map(a => JSON.parse(a.event_map || '{}').a1);
  check('each calendar keeps its OWN event id', maps[0] && maps[1] && maps[0] !== maps[1], JSON.stringify(maps));

  // A second run must update, never create again.
  stubGoogle();
  CAL['t1'].events = { 't1-ev1': {} }; CAL['t2'].events = { 't2-ev1': {} };
  const r2 = await G.syncApptsToGoogle('p2', [APPT]);
  check('a second sync updates both and creates nothing', r2.created === 0 && r2.updated === 2, JSON.stringify(r2));
}

// 3. Reconnecting the SAME account updates its row instead of piling up duplicates.
{
  reset(); stubGoogle();
  CAL['t1'] = { summary: 'same@x.com', events: {}, nextId: 1 };
  await G.saveGoogleAccount('p3', { access_token: 't1', refresh_token: 'r1', expires_in: 3600 });
  await G.saveGoogleAccount('p3', { access_token: 't1', refresh_token: 'r1b', expires_in: 3600 });
  const accts = await G.listGoogleAccounts('p3');
  check('reconnecting the same calendar does not add a second row', accts.length === 1, 'got ' + accts.length);
}

// 4. Disconnecting ONE leaves the others, and only ever the caller's.
{
  reset(); stubGoogle();
  CAL['t1'] = { summary: 'keep@x.com', events: {}, nextId: 1 };
  CAL['t2'] = { summary: 'drop@y.com', events: {}, nextId: 1 };
  await G.saveGoogleAccount('p4', { access_token: 't1', refresh_token: 'r1', expires_in: 3600 });
  const dropId = await G.saveGoogleAccount('p4', { access_token: 't2', refresh_token: 'r2', expires_in: 3600 });
  await G.deleteGoogleAccount('p4', dropId);
  const left = await G.listGoogleAccounts('p4');
  check('disconnecting one leaves the other connected',
    left.length === 1 && left[0].label === 'keep@x.com', JSON.stringify(left.map(a => a.label)));

  // §0.1: another provider's id must match nothing.
  CAL['t3'] = { summary: 'other@z.com', events: {}, nextId: 1 };
  const otherId = await G.saveGoogleAccount('pOTHER', { access_token: 't3', refresh_token: 'r3', expires_in: 3600 });
  await G.deleteGoogleAccount('p4', otherId);
  const other = await G.listGoogleAccounts('pOTHER');
  check('one account cannot disconnect another provider\'s calendar', other.length === 1, 'got ' + other.length);
}

// 5. A dead account must not stop the healthy one, and must not hide its busy time.
{
  reset(); stubGoogle();
  CAL['good'] = { summary: 'good@x.com', events: { busy1: { start: { dateTime: '2026-10-20T14:00:00.000Z' }, end: { dateTime: '2026-10-20T15:00:00.000Z' } } }, nextId: 1 };
  await G.saveGoogleAccount('p5', { access_token: 'good', refresh_token: 'rg', expires_in: 3600 });
  await G.saveGoogleAccount('p5', { access_token: 'dead', refresh_token: 'rd', expires_in: 3600 });
  // kill the dead one for good: no refresh target
  DB.google_accounts.forEach(r => { if (r.access_token === 'dead') { r.refresh_token = null; r.expires_at = 0; } });

  const r = await G.syncApptsToGoogle('p5', [APPT]);
  check('a dead account does not stop the healthy one syncing', r.created === 1, JSON.stringify(r));
  check('and the dead one is reported so she can reconnect it', r.reconnect.length === 1, JSON.stringify(r.reconnect));

  const busy = await G.googleBusyMinutes('p5', '2026-10-20');
  check('busy time from the healthy calendar still blocks bookings', busy.length >= 1, JSON.stringify(busy));
}

let bad = 0;
for (const r of results) { if (!r.pass) bad++;
  console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(56) + (r.pass ? '' : ('  <- ' + r.detail))); }
console.log(bad ? '\n' + bad + ' of ' + results.length + ' FAILED'
  : '\nan existing connection migrates without duplicating her calendar, each account keeps\n'
  + 'its own event map, disconnecting one leaves the rest, and a dead account neither stops\n'
  + 'the others nor hides their busy time');
process.exit(bad ? 1 : 0);
