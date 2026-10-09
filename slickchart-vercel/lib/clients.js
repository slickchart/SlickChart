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
  // Passwordless IN-APP client sign-in: a one-time 6-digit code (scrypt-hashed) emailed to a client
  // so they can sign into their care space from inside the native app without a personal link. One
  // active code per email (a new request replaces it); short expiry; attempts capped. See api/client-code.js.
  await q`CREATE TABLE IF NOT EXISTS client_login_codes (
    email text PRIMARY KEY,
    code_hash text NOT NULL,
    expires_at bigint NOT NULL,
    attempts int DEFAULT 0,
    created_at bigint
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
// Parts of a client's data blob that must never be wiped by a sync that simply did not have them in
// hand. The blob is REPLACED wholesale on every write, which is right for most of it (name, profile,
// aftercare) and catastrophic for the two lists that live ONLY here.
//
// A provider lost the same client summary over and over. Her phone would sync that client for an
// unrelated reason while its in-memory copy of the summaries was briefly empty, and the whole-blob
// write destroyed the account's good copy, so the client's own app lost her journey too. The
// provider-side merges (CLAUDE.md §0.7/§0.8) made it rarer, which is exactly what she reported
// ("the time between deletions is longer"), but a merge running on one device cannot protect the
// server from a write sent by another.
//
// So the server refuses the destructive case: an incoming EMPTY (or absent) array never replaces a
// stored non-empty one. Deliberately narrow. It does not merge the two lists and it does not stop a
// genuine shrink from 3 to 1 — it stops the drop to zero, the one that destroys a record nobody can
// get back. The cost is that deleting your LAST summary needs a second write to stick; that is
// visible and recoverable, unlike silently losing the journey.
//
// `animals` is protected for the same reason and is load-bearing twice over: for the equestrian
// trade it is the owner's list of their horses, each with that horse's own summaries and photos, so
// an empty one wipes what the owner sees in their app — AND it is the only copy of the owner-to-horse
// grouping that lives anywhere but the provider's own roster, which makes it the last fallback if a
// device ever loses the links (see _carryAnimalLink in slickchart.html). For a provider with no
// animals it is always empty on both sides, so the guard never fires for them.
//
// The protected keys are the VALUES list in both statements below (summaries, pendingForms,
// animals). The
// guard runs INSIDE the statement on purpose — a read-then-write in JS would race two concurrent
// syncs, which is how this blob got clobbered to begin with. Add a key to both lists if you add
// another append-only list to the client blob, and keep the expression a shallow `||` overlay: it
// touches only the protected keys, and adds nothing to a blob that never had them.
//
// Both length tests are wrapped in a CASE rather than guarded by a separate `jsonb_typeof(...)='array'
// AND ...`: SQL does not promise to evaluate AND left to right, and Postgres happily ran
// jsonb_array_length on a corrupted scalar value and threw, failing the whole sync.
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
    // phone is COALESCEd rather than overwritten below: several call sites build the client list by
    // hand, and one of them omitting phone silently wiped the column for every client — which broke
    // check-in auto-send for anyone who books with a phone number and no email, since the cron
    // matches a Square customer to a client by email OR phone.
    //
    // THE PROTECTED KEYS. An incoming blob whose list is EMPTY never wipes a stored list that
    // EMPTY WAS NOT THE ONLY WAY TO LOSE THEM. The first version of this guard only blocked an
    // incoming EMPTY array from replacing a stored non-empty one, and said so: "a genuine shrink
    // from 3 to 1 still lands. It stops the drop to zero." That left the case Diana kept hitting —
    // a device replaying an OLDER non-empty list over a newer one. Her client's summary appeared,
    // then was replaced later by a stale copy, while her notes, guides and products (which live in
    // kv and already merge) stayed put. She reported it still happening on 2026-10-07, the day
    // AFTER the empty-only guard shipped, which is what proved the guard was not the whole fix.
    // So the write is also refused when it is demonstrably STALE. The app stamps _uAt on a client
    // whose content actually changed (_stampClientChanges) and now sends it, so an incoming blob
    // older than the stored one cannot replace these keys. A NEWER write with fewer entries still
    // lands, which is what keeps deleting a summary possible — unioning here would resurrect
    // deleted ones, the §0.8 trap. Every test sits inside a CASE: SQL does not promise
    // left-to-right AND, and a scalar where an array was expected already threw once and failed
    // that client's whole sync. An incoming blob with no _uAt reads as 0, which only loses to a
    // stored stamp that exists — so nothing changes until a stamped write has landed.
    // isn't. It started as summaries/pendingForms/animals; `forms`, `progressPhotos` and
    // `pendingGuides` were added 2026-10-08 after Heather reported missing forms.
    //
    // `forms` is built from the client's submittedForms/signedForms, so it IS the record that an
    // intake was completed. It was unprotected, and the app was pushing up PLACEHOLDER records it
    // had invented itself (a chart with no name and em-dashes for every field) — each of those
    // carries forms:[] and summaries:[], so the stored forms were overwritten with nothing while
    // the stored summaries survived. That is why her account showed summaries intact on some rows
    // and zero forms on every single one. The app no longer pushes those placeholders
    // (_isBlankSkeleton), and now the server will not accept the damage even if something does.
    //
    // Anything added here must be a list that only ever GROWS by itself. Do NOT add a list the
    // provider can legitimately empty, or clearing it becomes impossible (§0.8, read the other way).
    //
    // ON CONFLICT is on (id) alone, because id is the PRIMARY KEY — so without the provider_id
    // condition on the DO UPDATE, a collision across ACCOUNTS clobbers the other provider's row:
    // her client's name, email, phone and whole data blob replaced by a stranger's, inside her
    // account, with her summaries gone. Not hypothetical: the app mints ids as 'c' + Date.now(),
    // bumping by 1 on a local clash, so two providers adding (or importing) clients at the same
    // moment land on the same ids. With the condition the cross-account write simply matches no
    // row, and the re-read below turns that into a reported failure instead of silent data loss.
    await q`INSERT INTO clients (id, provider_id, token, name, email, phone, data, created_at, updated_at)
      VALUES (${id}, ${providerId}, ${token}, ${(c && c.name) || ''}, ${(c && c.email) || ''}, ${(c && c.phone) || ''}, ${data}::jsonb, ${now}, ${now})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = COALESCE(NULLIF(EXCLUDED.phone, ''), clients.phone),
        updated_at = EXCLUDED.updated_at,
        data = EXCLUDED.data || COALESCE((
          SELECT jsonb_object_agg(k, clients.data->k)
            FROM (VALUES ('summaries'),('pendingForms'),('animals'),('forms'),('progressPhotos'),('pendingGuides')) AS t(k)
           WHERE COALESCE(CASE WHEN jsonb_typeof(clients.data->k) = 'array'
                               THEN jsonb_array_length(clients.data->k) END, 0) > 0
             AND (COALESCE(CASE WHEN jsonb_typeof(EXCLUDED.data->k) = 'array'
                                THEN jsonb_array_length(EXCLUDED.data->k) END, 0) = 0
                  OR COALESCE(CASE WHEN jsonb_typeof(EXCLUDED.data->'_uAt') = 'number'
                                   THEN (EXCLUDED.data->>'_uAt')::bigint END, 0)
                     < COALESCE(CASE WHEN jsonb_typeof(clients.data->'_uAt') = 'number'
                                     THEN (clients.data->>'_uAt')::bigint END, 0))
        ), '{}'::jsonb)
      WHERE clients.deleted_at IS NULL
        AND clients.provider_id = EXCLUDED.provider_id`;
    // A concurrent upsert of this same new id may have won the INSERT with a *different* token
    // (ON CONFLICT DO NOTHING keeps the first write). Re-read so we return the token that was
    // actually persisted — otherwise the loser hands back a token that isn't in the DB, i.e. a
    // dead client link. Cheap: only runs on brand-new clients.
    const back = await q`SELECT token FROM clients WHERE id=${id} AND provider_id=${providerId}`;
    if (back[0] && back[0].token) { token = back[0].token; }
    else {
      // Nothing of ours is there: this id is held by ANOTHER account (or is tombstoned). Say so
      // instead of returning a token that isn't in the database — api/clients lists the client in
      // `failed` and the provider gets told it couldn't be saved, which is recoverable. Returning
      // a phantom token is not: her client's link would silently never work.
      const e = new Error('client id already in use');
      e.code = 'id_taken';
      throw e;
    }
  } else {
    // One CTE so the posted blob is sent as a single bound parameter even though the guard reads it
    // twice. `inc.d` is what was just posted; `clients.data` is still the stored row's value here.
    await q`WITH inc AS (SELECT ${data}::jsonb AS d)
      UPDATE clients SET name=${(c && c.name) || ''}, email=${(c && c.email) || ''},
        phone=COALESCE(NULLIF(${(c && c.phone) || ''}, ''), clients.phone),
        data = inc.d || COALESCE((
          SELECT jsonb_object_agg(k, clients.data->k)
            FROM (VALUES ('summaries'),('pendingForms'),('animals'),('forms'),('progressPhotos'),('pendingGuides')) AS t(k)
           WHERE COALESCE(CASE WHEN jsonb_typeof(clients.data->k) = 'array'
                               THEN jsonb_array_length(clients.data->k) END, 0) > 0
             AND (COALESCE(CASE WHEN jsonb_typeof(inc.d->k) = 'array'
                                THEN jsonb_array_length(inc.d->k) END, 0) = 0
                  OR COALESCE(CASE WHEN jsonb_typeof(inc.d->'_uAt') = 'number'
                                   THEN (inc.d->>'_uAt')::bigint END, 0)
                     < COALESCE(CASE WHEN jsonb_typeof(clients.data->'_uAt') = 'number'
                                     THEN (clients.data->>'_uAt')::bigint END, 0))
        ), '{}'::jsonb),
        updated_at=${now}
      FROM inc
      WHERE clients.id=${id} AND clients.provider_id=${providerId}`;
  }
  return { id, token, name: (c && c.name) || '', email: (c && c.email) || '' };
}

export async function listClients(providerId) {
  const q = sql();
  return await q`SELECT id, token, name, email, phone, invited_at, opened_at, updated_at
    FROM clients WHERE provider_id=${providerId} AND deleted_at IS NULL ORDER BY lower(name)`;
}

// ── Deep links into a client's own space ─────────────────────────────────────────────────────────
// EVERY client-facing URL must carry that client's link token. A tokenless "/client?s=..." (which is
// what every push used to send) lands them in the app with no idea who they are; the app then has only
// a remembered token in browser storage to fall back on, and when that is missing — a new device, an
// in-app browser with partitioned storage, cleared data — they used to be shown the SAMPLE space.
// Passing the token removes the guesswork entirely. /space (not /client) because the installed provider
// app claims /client and /client/* as Universal/App Links and would intercept the tap.
export function spaceUrl(token, screen) {
  if (!token) return '';
  return '/space?c=' + encodeURIComponent(token) + (screen ? ('&s=' + encodeURIComponent(screen)) : '');
}
// Look up one client's link token by id, for senders that only carry the id.
export async function getClientToken(clientId) {
  if (!clientId) return '';
  try {
    await ensureClientTables();
    const q = sql();
    const rows = await q`SELECT token FROM clients WHERE id = ${clientId} LIMIT 1`;
    return (rows[0] && rows[0].token) || '';
  } catch (e) { return ''; }
}

export async function getClientByToken(token) {
  const q = sql();
  // deleted_at IS NULL is a STRUCTURAL privacy guarantee: once a client is removed — whether the client
  // deleted their own data (deleteClientData) or the provider removed them from their roster
  // (markClientDeleted) — their magic link stops resolving here, so every client-facing endpoint that
  // authenticates via this lookup (client-data, client-submit, client-messages, client-prefs,
  // push-subscribe, guide-file client GET, …) goes dark at once. This does not depend on any single
  // delete path remembering to rotate the token. A tombstoned client is never resurrected (upsertClient
  // no-ops on a deleted row), so this can never wrongly hide an active client.
  const rows = await q`SELECT * FROM clients WHERE token=${token} AND deleted_at IS NULL`;
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

// The provider GET feeds two things off this list: the notification feed AND the client-side
// self-heal that re-derives a chart's forms/check-ins from the event log when a device's cached
// copy was lost. The old LIMIT 500 (across ALL clients) meant that once a provider passed ~500
// lifetime events, the oldest form/check-in events aged out of the window and could no longer be
// recovered by the self-heal. Raised to match the 2000-client upsert bound so the safety net
// covers realistic single-provider volume. (If this ever needs to scale further, split the query
// so high-volume message events can't crowd out the structured form/check-in events.)
export async function listEvents(providerId) {
  const q = sql();
  return await q`SELECT id, client_id, kind, payload, seen, created_at
    FROM client_events WHERE provider_id=${providerId} ORDER BY created_at DESC LIMIT 2000`;
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
