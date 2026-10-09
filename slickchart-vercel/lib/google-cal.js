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
  _ready = true;
}

export async function getGoogleConnection(providerId) {
  if (!providerId || !dbEnabled()) return null;
  const q = sql();
  const rows = await q`SELECT provider_id, access_token, refresh_token, expires_at, calendar_ids,
    event_map, last_ok, last_error FROM google_connections WHERE provider_id=${String(providerId)}`;
  return rows[0] || null;
}

// `opts.privateTitles` is the choice she made on the connect screen BEFORE granting, carried here
// inside the SIGNED state token (never a raw query parameter — §0.1). It has to be applied as the
// row is created: the privacy switch only existed on the connected card, so the only way to reach
// it was to connect first, and by then the first sync had already put client names into Google.
// Left undefined, the column default stands and a reconnect keeps whatever she chose before.
export async function saveGoogleConnection(providerId, t, opts) {
  if (!providerId) return false;
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

export async function deleteGoogleConnection(providerId) {
  if (!providerId) return false;
  const q = sql();
  await q`DELETE FROM google_connections WHERE provider_id=${String(providerId)}`;
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
export async function googleBusyMinutes(providerId, dateISO, token) {
  const access = token || await googleAccessToken(providerId);
  if (!access) return [];
  const dayStart = new Date(dateISO + 'T00:00:00');
  const qs = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: new Date(dayStart.getTime() + 86400000).toISOString(),
    singleEvents: 'true',          // expand recurring events into real instances
    orderBy: 'startTime',
    maxResults: '250'
  });
  const r = await fetch(EVENTS_URL + '?' + qs.toString(), { headers: { Authorization: 'Bearer ' + access } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) {
    await noteGoogleError(providerId, 'events.list ' + r.status);
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
    const ls = new Date(s), le = new Date(en);
    let startM = ls.getHours() * 60 + ls.getMinutes();
    let endM = le.getHours() * 60 + le.getMinutes();
    // Clamp to the day asked about, or an overnight event produces a backwards range that blocks
    // nothing at all.
    if (en - s >= 86400000) { startM = 0; endM = 24 * 60; }
    else {
      if (ls.toDateString() !== dayStart.toDateString()) startM = 0;
      if (le.toDateString() !== dayStart.toDateString()) endM = 24 * 60;
    }
    if (endM > startM) out.push({ start: startM, end: endM });
  });
  try {
    const q = sql();
    await q`UPDATE google_connections SET last_ok=${Date.now()}, last_error=NULL WHERE provider_id=${String(providerId)}`;
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
async function saveEventMap(providerId, map) {
  const q = sql();
  await q`UPDATE google_connections SET event_map=${JSON.stringify(map || {})}, updated_at=${Date.now()}
    WHERE provider_id=${String(providerId)}`;
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
  const start = new Date(a.dateISO + 'T00:00:00');
  const mins = Math.max(5, parseInt(a.durMins, 10) || 60);
  start.setHours(Math.floor(a.startMins / 60), a.startMins % 60, 0, 0);
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
export async function syncApptsToGoogle(providerId, appts) {
  const out = { created: 0, updated: 0, deleted: 0, failed: 0 };
  const access = await googleAccessToken(providerId);
  if (!access) return out;
  const conn = await getGoogleConnection(providerId);
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
      const r2 = await fetch(EVENTS_URL, { method: 'POST', headers: hdr, body: JSON.stringify(body) });
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
  try { await saveEventMap(providerId, map); } catch (e) {}
  return out;
}
