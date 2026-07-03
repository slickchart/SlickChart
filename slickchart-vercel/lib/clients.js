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
  _ready = true;
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
