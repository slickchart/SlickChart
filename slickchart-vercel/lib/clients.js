// Server-side client records: each client gets a unique, unguessable link token
// that maps to their own private data blob (summaries, aftercare, forms, photos,
// booking availability, branding). Client submissions (forms, booking requests,
// messages) are logged as events for the provider to see.
import crypto from 'crypto';
import { sql } from './db.js';

let _ready = false;
export async function ensureClientTables() {
  if (_ready) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS clients (
    id text PRIMARY KEY,
    provider_id text NOT NULL,
    token text UNIQUE NOT NULL,
    name text,
    email text,
    phone text,
    data jsonb DEFAULT '{}'::jsonb,
    invited_at bigint,
    opened_at bigint,
    created_at bigint,
    updated_at bigint
  )`;
  await q`CREATE INDEX IF NOT EXISTS clients_provider_idx ON clients(provider_id)`;
  await q`CREATE TABLE IF NOT EXISTS client_events (
    id text PRIMARY KEY,
    client_id text NOT NULL,
    provider_id text NOT NULL,
    kind text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    seen int DEFAULT 0,
    created_at bigint
  )`;
  await q`CREATE INDEX IF NOT EXISTS client_events_provider_idx ON client_events(provider_id)`;
  await q`CREATE TABLE IF NOT EXISTS client_prefs (
    client_id text PRIMARY KEY,
    prefs jsonb DEFAULT '{}'::jsonb,
    updated_at bigint
  )`;
  // Web-push subscriptions — one row per device a client enables notifications on.
  // Keyed by a hash of the endpoint so re-subscribing the same device updates in place.
  await q`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id text PRIMARY KEY,
    client_id text NOT NULL,
    provider_id text,
    endpoint text NOT NULL,
    sub jsonb NOT NULL,
    created_at bigint
  )`;
  await q`CREATE INDEX IF NOT EXISTS push_subs_client_idx ON push_subscriptions(client_id)`;
  // Dedup log for the reminder cron — one row per (client, reminder-instance) so a reminder
  // is sent at most once even though the cron runs repeatedly across its send window.
  await q`CREATE TABLE IF NOT EXISTS reminder_log (
    client_id text NOT NULL,
    rkey text NOT NULL,
    sent_at bigint,
    PRIMARY KEY (client_id, rkey)
  )`;
  _ready = true;
}

// Atomically claim a reminder: returns true only the FIRST time this (client, rkey) is
// seen, so concurrent/overlapping cron runs can't double-send. Callers send only on true.
export async function claimReminder(clientId, rkey) {
  const q = sql();
  const rows = await q`INSERT INTO reminder_log (client_id, rkey, sent_at)
    VALUES (${String(clientId)}, ${String(rkey)}, ${Date.now()})
    ON CONFLICT (client_id, rkey) DO NOTHING RETURNING rkey`;
  return rows.length > 0;
}

function _subId(endpoint) {
  return 'ps_' + crypto.createHash('sha256').update(String(endpoint || '')).digest('base64url').slice(0, 24);
}

// Store (or refresh) one device's push subscription for a client.
export async function savePushSub(clientId, providerId, subscription) {
  if (!subscription || !subscription.endpoint) return null;
  const q = sql();
  const id = _subId(subscription.endpoint);
  const now = Date.now();
  const data = JSON.stringify(subscription);
  await q`INSERT INTO push_subscriptions (id, client_id, provider_id, endpoint, sub, created_at)
    VALUES (${id}, ${String(clientId)}, ${providerId ? String(providerId) : null}, ${String(subscription.endpoint)}, ${data}::jsonb, ${now})
    ON CONFLICT (id) DO UPDATE SET client_id=${String(clientId)}, provider_id=${providerId ? String(providerId) : null}, sub=${data}::jsonb`;
  return id;
}

// All of a client's device subscriptions, as { id, sub } rows.
export async function listPushSubs(clientId) {
  const q = sql();
  const rows = await q`SELECT id, sub FROM push_subscriptions WHERE client_id=${String(clientId)}`;
  return rows.map(r => ({ id: r.id, sub: r.sub }));
}

export async function deletePushSub(id) {
  const q = sql();
  await q`DELETE FROM push_subscriptions WHERE id=${String(id)}`;
  return true;
}

export async function deletePushSubByEndpoint(clientId, endpoint) {
  const q = sql();
  await q`DELETE FROM push_subscriptions WHERE client_id=${String(clientId)} AND endpoint=${String(endpoint || '')}`;
  return true;
}

// For the reminder cron: every client's saved prefs (bounded to beta scale). Includes the
// client_id so the cron can look up that client's push subscriptions.
export async function listAllClientPrefs() {
  const q = sql();
  return await q`SELECT client_id, prefs FROM client_prefs LIMIT 5000`;
}

// A random, URL-safe token that's effectively impossible to guess.
export function genToken() { return crypto.randomBytes(16).toString('base64url'); }

// Create or update a client for a provider. Keeps the existing link token so a
// client's link never changes once issued.
export async function upsertClient(providerId, c) {
  const q = sql();
  const now = Date.now();
  const id = String((c && c.id) || ('c_' + genToken().slice(0, 10)));
  const data = JSON.stringify((c && c.data) || {});
  const rows = await q`SELECT token FROM clients WHERE id=${id} AND provider_id=${providerId}`;
  let token = rows[0] && rows[0].token;
  if (!token) {
    token = genToken();
    await q`INSERT INTO clients (id, provider_id, token, name, email, phone, data, created_at, updated_at)
      VALUES (${id}, ${providerId}, ${token}, ${(c && c.name) || ''}, ${(c && c.email) || ''}, ${(c && c.phone) || ''}, ${data}::jsonb, ${now}, ${now})
      ON CONFLICT (id) DO NOTHING`;
  } else {
    await q`UPDATE clients SET name=${(c && c.name) || ''}, email=${(c && c.email) || ''}, phone=${(c && c.phone) || ''}, data=${data}::jsonb, updated_at=${now}
      WHERE id=${id} AND provider_id=${providerId}`;
  }
  return { id, token, name: (c && c.name) || '', email: (c && c.email) || '' };
}

export async function listClients(providerId) {
  const q = sql();
  return await q`SELECT id, token, name, email, phone, invited_at, opened_at, updated_at
    FROM clients WHERE provider_id=${providerId} ORDER BY lower(name)`;
}

export async function getClientByToken(token) {
  const q = sql();
  const rows = await q`SELECT * FROM clients WHERE token=${token}`;
  return rows[0] || null;
}

export async function markOpened(token) {
  const q = sql();
  await q`UPDATE clients SET opened_at=${Date.now()} WHERE token=${token} AND opened_at IS NULL`;
}

export async function markInvited(providerId, ids) {
  if (!ids || !ids.length) return;
  const q = sql();
  const now = Date.now();
  for (const id of ids) {
    await q`UPDATE clients SET invited_at=${now} WHERE id=${id} AND provider_id=${providerId}`;
  }
}

export async function logEvent(providerId, clientId, kind, payload) {
  const q = sql();
  const id = 'ev_' + genToken().slice(0, 12);
  await q`INSERT INTO client_events (id, client_id, provider_id, kind, payload, created_at)
    VALUES (${id}, ${clientId}, ${providerId}, ${kind}, ${JSON.stringify(payload || {})}::jsonb, ${Date.now()})`;
  return id;
}

export async function listEvents(providerId) {
  const q = sql();
  return await q`SELECT id, client_id, kind, payload, seen, created_at
    FROM client_events WHERE provider_id=${providerId} ORDER BY created_at DESC LIMIT 500`;
}

// Full two-way message thread for one client (client-submitted + provider-sent),
// oldest first — this is the real message history behind the client app's chat.
export async function listClientMessages(clientId, providerId) {
  const q = sql();
  return await q`SELECT id, kind, payload, created_at FROM client_events
    WHERE client_id=${clientId} AND provider_id=${providerId} AND kind IN ('message','provider_message')
    ORDER BY created_at ASC LIMIT 500`;
}

// A client's own settings (notification prefs, homecare check-off state, streaks,
// dismissed banners). Keyed by client id, stored server-side so they follow the
// client across devices/browsers rather than living in one browser's localStorage.
export async function getClientPrefs(clientId) {
  const q = sql();
  const rows = await q`SELECT prefs FROM client_prefs WHERE client_id=${String(clientId)}`;
  return (rows[0] && rows[0].prefs) || {};
}
export async function saveClientPrefs(clientId, prefs) {
  const q = sql();
  const now = Date.now();
  const data = JSON.stringify((prefs && typeof prefs === 'object') ? prefs : {});
  await q`INSERT INTO client_prefs (client_id, prefs, updated_at)
    VALUES (${String(clientId)}, ${data}::jsonb, ${now})
    ON CONFLICT (client_id) DO UPDATE SET prefs=${data}::jsonb, updated_at=${now}`;
  return true;
}
