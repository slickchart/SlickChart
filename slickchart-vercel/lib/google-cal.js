// GOOGLE CALENDAR — TWO-WAY SYNC.
//
// Ashley chose full two-way on 2026-10-08, with the permission trade-off shown to her: SlickChart
// writes real events into her Google Calendar (so a booking appears there immediately instead of
// whenever Google next polls the ICS feed), and her own Google events block SlickChart availability
// (so a dentist appointment stops a client booking that slot).
//
// SCOPE: `calendar.events`, not the full `calendar` scope. It does everything two-way needs — read,
// create, update and delete EVENTS — but cannot delete a whole calendar or change who she has shared
// one with. Narrower than what she was shown and identical in capability for this feature, which is
// the right side to err on for a token this powerful.
//
// §0 APPLIES WITH FULL FORCE. This stores a third-party OAuth token per provider, which is precisely
// the asset class behind the shared-Square-token incident. So: one row per provider, every read and
// write scoped by the provider id from a VERIFIED session, and NO fallback of any kind — there is no
// deployment-wide calendar, no "if hers is missing use the owner's". A provider with no connection
// gets no busy data, full stop.
//
// THE SEVEN-DAY TRAP, which is the single most reported failure in this whole category: a Google
// OAuth app left in "Testing" publishing status issues refresh tokens that EXPIRE AFTER 7 DAYS. That
// is almost certainly the real story behind every "it worked for a week and then stopped" complaint
// in the research. Code cannot fix it — the app has to be published — so instead a refresh failure is
// recorded on the row and surfaced as "reconnect needed" rather than silently returning no busy time.
import crypto from 'crypto';
import { sql, dbEnabled } from './db.js';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
// Our events carry this so inbound can tell them apart from her own life. Without it we would read
// back the appointment we just wrote and treat it as a separate commitment.
const TAG_KEY = 'slickchartApptId';

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

let _ready = false;
export async function ensureGoogleTable() {
  if (_ready) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS google_connections (
    provider_id text PRIMARY KEY,
    access_token text,
    refresh_token text,
    expires_at bigint,
    calendar_ids text,
    event_map text,
    last_ok bigint,
    last_error text,
    created_at bigint,
    updated_at bigint
  )`;
  // Whether a client's NAME may travel to Google. Off by default, which is the behaviour every
  // existing connection already has — changing what a provider's calendar shows underneath her
  // without being asked would be its own surprise. ALTER for rows that predate the column.
  try { await q`ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS private_titles boolean DEFAULT false`; } catch (e) {}
  // SEVERAL GOOGLE ACCOUNTS, one provider.
  //
  // google_connections.provider_id is the PRIMARY KEY, so that table can hold exactly one account
  // per provider, and CLAUDE.md §3 forbids dropping or renaming anything the live code reads. So
  // the several-accounts case gets its own table and the old one is left exactly as it is, as a
  // fallback and a backup. Nothing here ever deletes from it.
  await q`CREATE TABLE IF NOT EXISTS google_accounts (
    id text PRIMARY KEY,
    provider_id text NOT NULL,
    label text,
    access_token text,
    refresh_token text,
    expires_at bigint,
    calendar_ids text,
    event_map text,
    private_titles boolean DEFAULT false,
    last_ok bigint,
    last_error text,
    created_at bigint,
    updated_at bigint
  )`;
  // Every read is per provider (§0.1), so the index matches how it is queried.
  try { await q`CREATE INDEX IF NOT EXISTS google_accounts_provider ON google_accounts (provider_id)`; } catch (e) {}
  _ready = true;
}

// Which calendar a token writes to, in HER words, so the screen can say "Connected: her@email" and
// not just "Connected". events.list hands back the calendar's own title, and for a main calendar
// that is the account's email address.
//
// Deliberately NOT calendarList.list, which is the obvious call for this: that one needs
// calendar.readonly, a scope Google has NOT approved for this app, and asking for it would mean
// another verification round — their approval mail says exactly that. events.list is covered by the
// calendar.events scope we already hold. Verified against Google's own reference, not from memory.
export async function calendarLabel(accessToken) {
  if (!accessToken) return '';
  try {
    const qs = new URLSearchParams({ maxResults: '1', timeMin: new Date().toISOString() });
    const r = await fetch(EVENTS_URL + '?' + qs.toString(), { headers: { Authorization: 'Bearer ' + accessToken } });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return '';
    return String(j.summary || '').slice(0, 120);
  } catch (e) { return ''; }
}

// Every account this provider has connected, oldest first.
//
// The legacy single row in google_connections is folded in the first time we look, CARRYING ITS
// event_map — without that, every appointment it had already written would look new and be created
// a second time, giving her a duplicate of her whole calendar.
export async function listGoogleAccounts(providerId) {
  if (!providerId || !dbEnabled()) return [];
  await ensureGoogleTable();
  const q = sql();
  const pid = String(providerId);
  let rows = await q`SELECT id, provider_id, label, access_token, refresh_token, expires_at,
    calendar_ids, event_map, private_titles, last_ok, last_error, created_at
    FROM google_accounts WHERE provider_id=${pid} ORDER BY created_at ASC`;
  if (rows.length) return rows;
  const legacy = await q`SELECT provider_id, access_token, refresh_token, expires_at, calendar_ids,
    event_map, private_titles, last_ok, last_error FROM google_connections WHERE provider_id=${pid}`;
  const L = legacy[0];
  if (!L || !(L.access_token || L.refresh_token)) return [];
  const now = Date.now();
  await q`INSERT INTO google_accounts (id, provider_id, label, access_token, refresh_token, expires_at,
      calendar_ids, event_map, private_titles, last_ok, last_error, created_at, updated_at)
    VALUES (${pid + ':legacy'}, ${pid}, ${''}, ${L.access_token || ''},
      ${L.refresh_token || null}, ${Number(L.expires_at) || 0}, ${L.calendar_ids || 'primary'},
      ${L.event_map || '{}'}, ${!!L.private_titles}, ${Number(L.last_ok) || 0},
      ${L.last_error || null}, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING`;
  return await q`SELECT id, provider_id, label, access_token, refresh_token, expires_at,
    calendar_ids, event_map, private_titles, last_ok, last_error, created_at
    FROM google_accounts WHERE provider_id=${pid} ORDER BY created_at ASC`;
}

async function noteAccountError(id, msg) {
  try {
    const q = sql();
    await q`UPDATE google_accounts SET last_error=${String(msg || '').slice(0, 200)}, updated_at=${Date.now()}
      WHERE id=${String(id)}`;
  } catch (e) {}
}

// Store the account this grant belongs to. Reconnecting the SAME account must UPDATE its row rather
// than add a second one, or every reconnect leaves another dead entry on her screen. The calendar's
// title is the only account identity this scope can see, so that is what we match on; if she has
// renamed her calendar to something another of her accounts also uses, the worst case is a second
// row she can disconnect, never a lost or crossed connection.
export async function saveGoogleAccount(providerId, t, opts) {
  if (!providerId || !t || !t.access_token) return null;
  await ensureGoogleTable();
  const q = sql();
  const pid = String(providerId);
  const now = Date.now();
  const label = await calendarLabel(t.access_token);
  const expires = now + (Math.max(60, parseInt(t.expires_in, 10) || 3600) * 1000);
  const existing = await listGoogleAccounts(pid);
  // A legacy row has no label yet; the first reconnect adopts it rather than orphaning its event_map.
  const match = (label && existing.find(r => String(r.label || '') === label))
    || existing.find(r => !String(r.label || '') && r.id === pid + ':legacy')
    || null;
  const id = match ? match.id : (pid + ':' + now.toString(36) + Math.random().toString(36).slice(2, 8));
  const wantPrivate = (opts && typeof opts.privateTitles === 'boolean') ? opts.privateTitles : null;
  await q`INSERT INTO google_accounts (id, provider_id, label, access_token, refresh_token, expires_at,
      calendar_ids, event_map, private_titles, last_ok, last_error, created_at, updated_at)
    VALUES (${id}, ${pid}, ${label}, ${String(t.access_token)},
      ${t.refresh_token ? String(t.refresh_token) : null}, ${expires}, ${'primary'},
      ${(match && match.event_map) || '{}'}, ${wantPrivate === null ? false : wantPrivate},
      ${now}, NULL, ${now}, ${now})
    ON CONFLICT (id) DO UPDATE SET
      label = CASE WHEN EXCLUDED.label <> '' THEN EXCLUDED.label ELSE google_accounts.label END,
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, google_accounts.refresh_token),
      expires_at = EXCLUDED.expires_at,
      last_ok = EXCLUDED.last_ok, last_error = NULL, updated_at = EXCLUDED.updated_at`;
  if (wantPrivate !== null) {
    await q`UPDATE google_accounts SET private_titles=${wantPrivate}, updated_at=${now} WHERE id=${id}`;
  }
  return id;
}

// One account, by id, and only ever one belonging to the CALLER (§0.1): the id is the only thing the
// request supplies, so provider_id is in the WHERE as well and a crafted id matches nothing.
export async function deleteGoogleAccount(providerId, id) {
  if (!providerId || !id) return false;
  await ensureGoogleTable();
  const q = sql();
  await q`DELETE FROM google_accounts WHERE id=${String(id)} AND provider_id=${String(providerId)}`;
  return true;
}

// A usable access token for ONE account, refreshed if needed.
async function accountAccessToken(acct) {
  if (!acct) return '';
  const now = Date.now();
  if (acct.access_token && Number(acct.expires_at) > now + 60000) return acct.access_token;
  if (!acct.refresh_token) {
    await noteAccountError(acct.id, 'no refresh token — reconnect needed');
    const e = new Error('reconnect needed'); e.code = 'reconnect'; throw e;
  }
  const body = new URLSearchParams({
    refresh_token: acct.refresh_token, client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '', grant_type: 'refresh_token'
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) {
    await noteAccountError(acct.id, (j && (j.error_description || j.error)) || 'refresh failed');
    const e = new Error('reconnect needed'); e.code = 'reconnect'; throw e;
  }
  const expires = Date.now() + (Math.max(60, parseInt(j.expires_in, 10) || 3600) * 1000);
  try {
    const q = sql();
    await q`UPDATE google_accounts SET access_token=${String(j.access_token)}, expires_at=${expires},
      last_error=NULL, updated_at=${Date.now()} WHERE id=${String(acct.id)}`;
  } catch (e) {}
  acct.access_token = j.access_token; acct.expires_at = expires;
  return j.access_token;
}

// "Is this provider connected at all", and the first account's details. Kept because lib/booking.js
// and the existing tests ask exactly that question. Multi-account callers want listGoogleAccounts.
export async function getGoogleConnection(providerId) {
  if (!providerId || !dbEnabled()) return null;
  try {
    const accounts = await listGoogleAccounts(providerId);
    if (accounts.length) return accounts[0];
  } catch (e) { /* fall through to the legacy row */ }
  const q = sql();
  const rows = await q`SELECT provider_id, access_token, refresh_token, expires_at, calendar_ids,
    event_map, private_titles, last_ok, last_error FROM google_connections WHERE provider_id=${String(providerId)}`;
  return rows[0] || null;
}

// `opts.privateTitles` is the choice she made on the connect screen BEFORE granting, carried here
// inside the SIGNED state token (never a raw query parameter — §0.1). It has to be applied as the
// row is created: the privacy switch only existed on the connected card, so the only way to reach
// it was to connect first, and by then the first sync had already put client names into Google.
// Left undefined, the column default stands and a reconnect keeps whatever she chose before.
export async function saveGoogleConnection(providerId, t, opts) {
  if (!providerId) return false;
  // Every read now goes through google_accounts, so a grant has to land there or it is invisible.
  // The legacy row is still written below, untouched in shape, so nothing that predates this can
  // be left worse off than it was.
  try { await saveGoogleAccount(providerId, t, opts); } catch (e) {}
  const q = sql();
  const now = Date.now();
  const wantPrivate = (opts && typeof opts.privateTitles === 'boolean') ? opts.privateTitles : null;
  const expires = now + (Math.max(60, parseInt(t && t.expires_in, 10) || 3600) * 1000);
  // A refresh exchange returns NO refresh_token. COALESCE keeps the one we already have rather than
  // nulling it, which would silently turn a working connection into a dead one.
  await q`INSERT INTO google_connections
      (provider_id, access_token, refresh_token, expires_at, calendar_ids, last_ok, last_error, created_at, updated_at)
    VALUES (${String(providerId)}, ${String((t && t.access_token) || '')},
            ${(t && t.refresh_token) ? String(t.refresh_token) : null},
            ${expires}, ${(t && t.calendar_ids) || 'primary'}, ${now}, NULL, ${now}, ${now})
    ON CONFLICT (provider_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, google_connections.refresh_token),
      expires_at = EXCLUDED.expires_at,
      last_ok = EXCLUDED.last_ok,
      last_error = NULL,
      updated_at = EXCLUDED.updated_at`;
  // Applied separately so the INSERT above stays one statement and a reconnect that carries no
  // explicit choice cannot quietly reset a preference she already set.
  if (wantPrivate !== null) {
    await q`UPDATE google_connections SET private_titles=${wantPrivate}, updated_at=${now}
            WHERE provider_id=${String(providerId)}`;
  }
  return true;
}

// Disconnect EVERYTHING for this provider. The old single-account "Disconnect" button means this,
// so it still does. Per-account removal is deleteGoogleAccount.
export async function deleteGoogleConnection(providerId) {
  if (!providerId) return false;
  const q = sql();
  await q`DELETE FROM google_connections WHERE provider_id=${String(providerId)}`;
  try { await q`DELETE FROM google_accounts WHERE provider_id=${String(providerId)}`; } catch (e) {}
  return true;
}

async function noteGoogleError(providerId, msg) {
  try {
    const q = sql();
    await q`UPDATE google_connections SET last_error=${String(msg || '').slice(0, 200)}, updated_at=${Date.now()}
      WHERE provider_id=${String(providerId)}`;
  } catch (e) {}
}

export async function exchangeGoogleCode(code, redirectUri) {
  const body = new URLSearchParams({
    code: String(code || ''), client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: String(redirectUri || ''), grant_type: 'authorization_code'
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) {
    const e = new Error((j && (j.error_description || j.error)) || 'token exchange failed');
    e.code = 'exchange';
    throw e;
  }
  return j;
}

// A usable access token, refreshed if needed. Returns '' when the provider has no connection, and
// throws { code:'reconnect' } when the refresh itself was rejected — the caller turns that into a
// visible "reconnect" state instead of pretending there is simply no busy time.
export async function googleAccessToken(providerId) {
  const conn = await getGoogleConnection(providerId);
  if (!conn) return '';
  const now = Date.now();
  // 60s of slack so a token that expires mid-request is refreshed first.
  if (conn.access_token && Number(conn.expires_at) > now + 60000) return conn.access_token;
  if (!conn.refresh_token) {
    await noteGoogleError(providerId, 'no refresh token — reconnect needed');
    const e = new Error('reconnect needed'); e.code = 'reconnect'; throw e;
  }
  const body = new URLSearchParams({
    refresh_token: conn.refresh_token, client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '', grant_type: 'refresh_token'
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) {
    // invalid_grant here is the seven-day Testing-mode expiry, a revoked grant, or a changed
    // password. All of them mean the same thing to her: reconnect.
    await noteGoogleError(providerId, (j && (j.error_description || j.error)) || 'refresh failed');
    const e = new Error('reconnect needed'); e.code = 'reconnect'; throw e;
  }
  await saveGoogleConnection(providerId, j);
  return j.access_token;
}

// ── INBOUND: her Google events become busy blocks ───────────────────────────────────────────────
//
// Read from events.list rather than freeBusy, because with the events scope we can see which events
// are OURS (tagged) and skip them — reading back the appointment we just wrote would otherwise look
// like a second, separate commitment sitting on the same slot.
//
// An event she has marked "Free" (transparency: transparent) is NOT busy. That is Google's own
// meaning of the flag and it is the correct behaviour, but it WILL be reported as a bug, which is why
// the settings screen says it in plain words.
//
// Returns { start, end } as MINUTES FROM MIDNIGHT — the shape lib/booking.js already works in,
// converted the same way its Square branch does.
// Busy across EVERY connected account, unioned. If she is booked in either calendar she is busy,
// so a client must not be offered that slot. One unreadable account does not hide the others'
// commitments — the alternative is offering a time she is already taken.
export async function googleBusyMinutes(providerId, dateISO, token, tz) {
  if (token) return await busyForToken(providerId, dateISO, token, null, tz);
  const accounts = await listGoogleAccounts(providerId);
  if (!accounts.length) return [];
  const all = [];
  let anyOk = false, lastErr = null;
  for (const acct of accounts) {
    try {
      const access = await accountAccessToken(acct);
      if (!access) continue;
      const got = await busyForToken(providerId, dateISO, access, acct, tz);
      got.forEach(x => all.push(x));
      anyOk = true;
    } catch (e) { lastErr = e; }
  }
  // Only when NOTHING could be read do we raise: a half-read day would quietly offer booked slots.
  if (!anyOk && lastErr) throw lastErr;
  return all;
}

async function busyForToken(providerId, dateISO, access, acct, tz) {
  if (!access) return [];
  // HER day, in her time zone. This used the server's clock (UTC), so a 10am Pacific event blocked
  // 5pm and an evening one fell on the wrong day entirely.
  const { zonedDayRange, zonedMinutes, zonedDateKey } = await import('./square.js');
  const dr = zonedDayRange(dateISO, tz || null);
  const dayStart = dr.start;
  const qs = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: new Date(dr.end.getTime() + 1000).toISOString(),
    singleEvents: 'true',          // expand recurring events into real instances
    orderBy: 'startTime',
    maxResults: '250'
  });
  const r = await fetch(EVENTS_URL + '?' + qs.toString(), { headers: { Authorization: 'Bearer ' + access } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) {
    if (acct) await noteAccountError(acct.id, 'events.list ' + r.status);
    else await noteGoogleError(providerId, 'events.list ' + r.status);
    const e = new Error('calendar unreadable'); e.code = 'calendar'; throw e;
  }
  const out = [];
  (j.items || []).forEach(ev => {
    if (!ev || ev.status === 'cancelled') return;
    if (String(ev.transparency || '') === 'transparent') return;        // she marked it Free
    if (ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private[TAG_KEY]) return;  // ours
    // An all-day event has `date` rather than `dateTime` and blocks the whole day.
    if (ev.start && ev.start.date && !ev.start.dateTime) { out.push({ start: 0, end: 24 * 60 }); return; }
    const s = Date.parse((ev.start && ev.start.dateTime) || ''), en = Date.parse((ev.end && ev.end.dateTime) || '');
    if (!s || !en) return;
    let startM = zonedMinutes(s, tz), endM = zonedMinutes(en, tz);
    // Clamp to the day asked about, or an overnight event produces a backwards range that blocks
    // nothing at all.
    if (en - s >= 86400000) { startM = 0; endM = 24 * 60; }
    else {
      if (zonedDateKey(s, tz) !== dateISO) startM = 0;
      if (zonedDateKey(en, tz) !== dateISO) endM = 24 * 60;
    }
    if (endM > startM) out.push({ start: startM, end: endM });
  });
  try {
    const q = sql();
    if (acct) await q`UPDATE google_accounts SET last_ok=${Date.now()}, last_error=NULL WHERE id=${String(acct.id)}`;
    else await q`UPDATE google_connections SET last_ok=${Date.now()}, last_error=NULL WHERE provider_id=${String(providerId)}`;
  } catch (e) {}
  return out;
}

// ── OUTBOUND: her SlickChart appointments become real Google events ──────────────────────────────
//
// A RESCHEDULE IS A PATCH, NEVER A DELETE-AND-RECREATE. That is the specific failure the research
// found in GoHighLevel: it deletes the original and makes a new one, which re-fires "booked" without
// firing "cancelled" and breaks everything downstream. We keep the Google event id per appointment
// and PATCH it, so the event keeps its identity, its reminders, and anything the client added to it.
function eventMapOf(conn) {
  try { const m = JSON.parse((conn && conn.event_map) || '{}'); return (m && typeof m === 'object') ? m : {}; } catch (e) { return {}; }
}
async function saveEventMap(accountId, map) {
  const q = sql();
  await q`UPDATE google_accounts SET event_map=${JSON.stringify(map || {})}, updated_at=${Date.now()}
    WHERE id=${String(accountId)}`;
}
// The event as Google will store it. `private` is the provider's "keep client names out of Google"
// setting, read from her connection row rather than from the request, so a device running older JS
// cannot push a name after she has turned it off.
//
// What leaves SlickChart when it is ON: the service name, the date, the time and the length. No
// client name and no appointment notes — the notes are the other place a name or a clinical detail
// would ride along, and a title scrubbed of the name is worth nothing if the description still has
// it. Busy time still blocks the slot, which is the whole point of the sync.
function eventBody(a, isPrivate) {
  const mins = Math.max(5, parseInt(a.durMins, 10) || 60);
  // The app sends the exact instant (it knows her time zone; this server runs in UTC, so building the
  // time here put a 10am appointment at 3am Pacific). Older app builds don't, so fall back.
  let start = a.startISO ? new Date(a.startISO) : null;
  if (!start || isNaN(start.getTime())) {
    start = new Date(a.dateISO + 'T00:00:00');
    start.setHours(Math.floor(a.startMins / 60), a.startMins % 60, 0, 0);
  }
  const end = new Date(start.getTime() + mins * 60000);
  return {
    summary: (isPrivate
      ? String(a.tx || 'Appointment')
      : String(a.title || ((a.client ? a.client + ' \u2014 ' : '') + (a.tx || 'Appointment')) || 'Appointment')
      ).slice(0, 300),
    description: isPrivate ? '' : String(a.notes || '').slice(0, 2000),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    extendedProperties: { private: { [TAG_KEY]: String(a.id) } }
  };
}
// Reconcile one provider's appointments into Google: create what is new, PATCH what moved, delete
// what she cancelled. Returns counts. Best-effort per appointment so one bad row cannot stop the rest.
// Reconcile into EVERY account she has connected. Each carries its own event_map, because the same
// appointment is a different Google event in each calendar — sharing one map would make the second
// account PATCH an id that does not exist there and then create a duplicate on the next run.
//
// One account failing (a revoked grant, a refresh Google rejected) must not stop the others: she
// reconnects that one and the rest were never interrupted.
export async function syncApptsToGoogle(providerId, appts) {
  const total = { created: 0, updated: 0, deleted: 0, failed: 0, accounts: 0, reconnect: [] };
  const accounts = await listGoogleAccounts(providerId);
  if (!accounts.length) return total;
  for (const acct of accounts) {
    try {
      const r = await syncApptsToAccount(acct, appts);
      total.created += r.created; total.updated += r.updated;
      total.deleted += r.deleted; total.failed += r.failed;
      total.accounts++;
    } catch (e) {
      if (e && e.code === 'reconnect') total.reconnect.push(String(acct.label || ''));
      else total.failed++;
    }
  }
  return total;
}

async function syncApptsToAccount(acct, appts) {
  const out = { created: 0, updated: 0, deleted: 0, failed: 0 };
  const access = await accountAccessToken(acct);
  if (!access) return out;
  const conn = acct;
  const isPrivate = !!(conn && conn.private_titles);
  const map = eventMapOf(conn);
  const want = new Map();
  (Array.isArray(appts) ? appts : []).forEach(a => { if (a && a.id && a.dateISO && a.startMins != null) want.set(String(a.id), a); });
  const hdr = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access };

  for (const [id, a] of want) {
    const body = eventBody(a, isPrivate);
    try {
      if (map[id]) {
        const r = await fetch(EVENTS_URL + '/' + encodeURIComponent(map[id]), { method: 'PATCH', headers: hdr, body: JSON.stringify(body) });
        if (r.status === 404 || r.status === 410) { delete map[id]; }   // she deleted it in Google; fall through to recreate
        else if (!r.ok) { out.failed++; continue; }
        else { out.updated++; continue; }
      }
      // A fixed event id per (calendar, appointment): two pushes a moment apart (her next booking, or
      // a second device) used to both create the event, and the copy that lost the map write was
      // never updated or deleted. Now the second insert gets 409 and simply takes the first's event.
      const fixedId = 'sc' + crypto.createHash('sha256').update(String(acct.id) + '|' + id).digest('hex').slice(0, 40);
      const r2 = await fetch(EVENTS_URL, { method: 'POST', headers: hdr, body: JSON.stringify(Object.assign({ id: fixedId }, body)) });
      if (r2.status === 409) {
        const r3 = await fetch(EVENTS_URL + '/' + fixedId, { method: 'PATCH', headers: hdr, body: JSON.stringify(Object.assign({ status: 'confirmed' }, body)) });
        if (r3.ok) { map[id] = fixedId; out.updated++; } else out.failed++;
        continue;
      }
      const j2 = await r2.json().catch(() => null);
      if (!r2.ok || !j2 || !j2.id) { out.failed++; continue; }
      map[id] = j2.id; out.created++;
    } catch (e) { out.failed++; }
  }
  // Anything we previously wrote that is no longer in her appointments was cancelled here.
  for (const id of Object.keys(map)) {
    if (want.has(id)) continue;
    try {
      const r = await fetch(EVENTS_URL + '/' + encodeURIComponent(map[id]), { method: 'DELETE', headers: hdr });
      if (r.ok || r.status === 404 || r.status === 410) { delete map[id]; out.deleted++; }
      else out.failed++;
    } catch (e) { out.failed++; }
  }
  try { await saveEventMap(acct.id, map); } catch (e) {}
  try {
    const q = sql();
    await q`UPDATE google_accounts SET last_ok=${Date.now()}, last_error=NULL, updated_at=${Date.now()}
      WHERE id=${String(acct.id)}`;
  } catch (e) {}
  return out;
}
