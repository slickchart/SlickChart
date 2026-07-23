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
  // Migration: tombstone marker for a client-initiated deletion. Set once the client purges
  // their data; it (a) hides the row from the provider roster and (b) stops a provider re-sync
  // from resurrecting the scrubbed PII (see upsertClient / deleteClientData below).
  await q`ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at bigint`;
  // Aftercare drip: when set, the reminder cron sends the timed Day-1 / Day-3 / Month-1 healing
  // messages measured from this timestamp (tattoo profession). Cleared after the series completes.
  await q`ALTER TABLE clients ADD COLUMN IF NOT EXISTS heal_started_at bigint`;
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

// Undo a claim when the reminder reached ZERO devices (a transient push-service failure). Deleting the
// dedup row lets the next hourly cron run retry, instead of the claim-before-send leaving that day's
// reminder permanently unsent.
export async function releaseReminder(clientId, rkey) {
  const q = sql();
  try { await q`DELETE FROM reminder_log WHERE client_id=${String(clientId)} AND rkey=${String(rkey)}`; } catch (e) {}
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

// Client-initiated data deletion: drop the app data a client controls — their saved
// preferences and every device push subscription.
export async function deleteClientPrefs(clientId) {
  const q = sql();
  await q`DELETE FROM client_prefs WHERE client_id=${String(clientId)}`;
  return true;
}
export async function deleteClientPushSubs(clientId) {
  const q = sql();
  await q`DELETE FROM push_subscriptions WHERE client_id=${String(clientId)}`;
  return true;
}

// Client-initiated deletion, server side: purge the client's own submissions and scrub the
// server-held PII so nothing personally identifiable remains on our side, while leaving the
// provider free to keep their own local treatment record for legal retention.
//   • client_events: every submission the client made (check-in photos, form answers, the
//     two-way message thread, virtual-consult photos, booking/contact updates). These are a
//     delivery queue the provider ingests into their own chart; anything not yet ingested is
//     intentionally discarded at the client's request. Call this BEFORE logging the
//     'delete-request' event so that notification survives the purge.
//   • the clients row: blank the contact columns (name/email/phone) and the server-side chart
//     mirror (data), rotate the link token to an unshared value so the old link is dead, and
//     set deleted_at so a provider re-sync can't resurrect any of it (see upsertClient).
// The provider never reads `data` back (listClients omits it; only the now-revoked client
// token could) — their retained record is their own local copy, so scrubbing here loses
// nothing they can still retrieve.
export async function deleteClientData(clientId) {
  const q = sql();
  const id = String(clientId);
  await q`DELETE FROM client_events WHERE client_id=${id}`;
  try { await q`DELETE FROM native_push_tokens WHERE owner_id=${id}`; } catch (e) { /* table may not exist yet */ }
  const revoked = 'revoked_' + genToken();
  await q`UPDATE clients SET name='', email='', phone='', data='{}'::jsonb, token=${revoked}, deleted_at=${Date.now()}
    WHERE id=${id}`;
  return true;
}

// Provider removed a client from THEIR app (or merged a duplicate away): soft-delete the roster row
// (scoped to this provider) so listClients no longer returns it and upsertClient won't resurrect it.
// Lighter than deleteClientData — keeps the row's PII/events intact, just tombstones it so a cloud
// re-sync can't re-add a blank zombie. This is what stops "a deleted client comes back".
export async function markClientDeleted(providerId, id) {
  const q = sql();
  await q`UPDATE clients SET deleted_at=${Date.now()}
    WHERE id=${String(id)} AND provider_id=${String(providerId)} AND deleted_at IS NULL`;
  return true;
}

// For the reminder cron: every client's saved prefs (bounded to beta scale). Joins the client
// row so the cron also has the provider_id (to send messages as the provider) and the aftercare
// heal_started_at (to time the healing drip). Excludes deleted clients.
export async function listAllClientPrefs() {
  const q = sql();
  return await q`SELECT cp.client_id, cp.prefs, c.provider_id, c.heal_started_at
    FROM client_prefs cp JOIN clients c ON c.id = cp.client_id
    WHERE c.deleted_at IS NULL LIMIT 5000`;
}

// Aftercare drip: start (or restart) the healing clock for one of a provider's own clients.
// Constrained by provider_id so a provider can only schedule drips for their own clients.
export async function setHealStart(clientId, providerId, startedAt) {
  const q = sql();
  const ts = Number(startedAt) || Date.now();
  await q`UPDATE clients SET heal_started_at=${ts}
    WHERE id=${String(clientId)} AND provider_id=${String(providerId)} AND deleted_at IS NULL`;
  return true;
}
// Cancel a drip (provider-scoped).
export async function clearHealStart(clientId, providerId) {
  const q = sql();
  await q`UPDATE clients SET heal_started_at=NULL WHERE id=${String(clientId)} AND provider_id=${String(providerId)}`;
  return true;
}
// Cancel a drip by client id only — used by the cron to retire a completed/expired series.
export async function clearHealStartById(clientId) {
  const q = sql();
  await q`UPDATE clients SET heal_started_at=NULL WHERE id=${String(clientId)}`;
  return true;
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
  const rows = await q`SELECT token, deleted_at FROM clients WHERE id=${id} AND provider_id=${providerId}`;
  // A client who deleted their data is tombstoned. Never resurrect the scrubbed PII or the
  // revoked token from the provider's still-cached copy — a re-sync of a deleted client is a
  // no-op server-side (the provider may keep their own local record; the server stays clean).
  if (rows[0] && rows[0].deleted_at) {
    return { id, token: rows[0].token, name: '', email: '', deleted: true };
  }
  let token = rows[0] && rows[0].token;
  if (!token) {
    token = genToken();
    // Two syncs can fire for the SAME brand-new client at once — e.g. the add-path sync (empty
    // pendingForms) and the "Send first-visit package" sync (carrying the intake). The old
    // ON CONFLICT DO NOTHING kept the FIRST insert and silently discarded the loser's data, so when the
    // empty one won, the intake form was lost (the client then saw only the pre-visit check-in, which
    // is re-injected server-side from a provider-wide KV and so was unaffected). Now the loser upserts
    // its data instead of being dropped, and — critically — a write that carries NO pending forms can
    // never wipe an intake the other write already stored: if the incoming blob's pendingForms is empty
    // but the stored one isn't, we keep the stored pendingForms. Token stays the first-issued one.
    await q`INSERT INTO clients (id, provider_id, token, name, email, phone, data, created_at, updated_at)
      VALUES (${id}, ${providerId}, ${token}, ${(c && c.name) || ''}, ${(c && c.email) || ''}, ${(c && c.phone) || ''}, ${data}::jsonb, ${now}, ${now})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        updated_at = EXCLUDED.updated_at,
        data = CASE
          WHEN COALESCE(jsonb_array_length(EXCLUDED.data->'pendingForms'), 0) = 0
               AND COALESCE(jsonb_array_length(clients.data->'pendingForms'), 0) > 0
            THEN jsonb_set(EXCLUDED.data, '{pendingForms}', clients.data->'pendingForms')
          ELSE EXCLUDED.data
        END
      WHERE clients.deleted_at IS NULL`;
    // A concurrent upsert of this same new id may have won the INSERT with a *different* token
    // (ON CONFLICT DO NOTHING keeps the first write). Re-read so we return the token that was
    // actually persisted — otherwise the loser hands back a token that isn't in the DB, i.e. a
    // dead client link. Cheap: only runs on brand-new clients.
    const back = await q`SELECT token FROM clients WHERE id=${id} AND provider_id=${providerId}`;
    if (back[0] && back[0].token) token = back[0].token;
  } else {
    await q`UPDATE clients SET name=${(c && c.name) || ''}, email=${(c && c.email) || ''}, phone=${(c && c.phone) || ''}, data=${data}::jsonb, updated_at=${now}
      WHERE id=${id} AND provider_id=${providerId}`;
  }
  return { id, token, name: (c && c.name) || '', email: (c && c.email) || '' };
}

export async function listClients(providerId) {
  const q = sql();
  return await q`SELECT id, token, name, email, phone, invited_at, opened_at, updated_at
    FROM clients WHERE provider_id=${providerId} AND deleted_at IS NULL ORDER BY lower(name)`;
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

export async function logEvent(providerId, clientId, kind, payload, idemKey) {
  const q = sql();
  // When the caller supplies an idempotency key (minted client-side and carried across a
  // retry), derive the row id from it so a submission that committed but lost its response
  // isn't written twice. Reuses the existing `id` primary key — no schema change — via
  // ON CONFLICT DO NOTHING. Without a key, a random id is used (no collisions to worry about).
  let id;
  if (idemKey) {
    const safe = String(idemKey).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    // Namespace the idempotency id by tenant + client so a key from one client/provider can never
    // suppress another's genuine submission via ON CONFLICT DO NOTHING. The id used to be derived
    // from the key alone (global), so a shared/guessed key across tenants could collide.
    const scope = (String(providerId || '') + '_' + String(clientId || '')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    id = safe ? ('ev_idem_' + scope + '_' + safe) : ('ev_' + genToken().slice(0, 12));
  } else {
    id = 'ev_' + genToken().slice(0, 12);
  }
  const rows = await q`INSERT INTO client_events (id, client_id, provider_id, kind, payload, created_at)
    VALUES (${id}, ${clientId}, ${providerId}, ${kind}, ${JSON.stringify(payload || {})}::jsonb, ${Date.now()})
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  // No row back → the id already existed (a duplicate retry); collapse to the existing event.
  return (rows && rows[0] && rows[0].id) ? rows[0].id : id;
}

export async function listEvents(providerId) {
  const q = sql();
  return await q`SELECT id, client_id, kind, payload, seen, created_at
    FROM client_events WHERE provider_id=${providerId} ORDER BY created_at DESC LIMIT 500`;
}

// Full two-way message thread for one client (client-submitted + provider-sent),
// oldest first — this is the real message history behind the client app's chat.
// Take the NEWEST 500 (DESC + LIMIT) then reverse to chronological order, so a long thread keeps
// showing recent messages instead of freezing on the oldest 500 and hiding everything newer.
export async function listClientMessages(clientId, providerId) {
  const q = sql();
  const rows = await q`SELECT id, kind, payload, created_at FROM client_events
    WHERE client_id=${clientId} AND provider_id=${providerId} AND kind IN ('message','provider_message')
    ORDER BY created_at DESC LIMIT 500`;
  return rows.reverse();
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
