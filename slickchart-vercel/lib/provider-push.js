// Web-push subscriptions for PROVIDERS.
//
// Until now push only reached CLIENTS: push_subscriptions is keyed by client_id, and the provider
// app's only notification path was a local browser Notification that fires exclusively while a tab
// is open and hidden. So a provider could set a follow-up reminder and never be told about it unless
// she happened to open the app. This is the table that fixes that.
//
// CLAUDE.md §0.1 applies to every function here: a subscription belongs to exactly one provider, and
// every read and write is scoped by the provider_id derived from a verified session. The only
// deliberately cross-owner read is listDuePushOwners, which exists for the cron and is named so it
// is obvious; it returns owners and their subscriptions and never mixes one owner's rows into
// another's result.
import { sql, dbEnabled } from './db.js';

let _ready = false;
export async function ensureProviderPushTable() {
  if (_ready) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS provider_push_subscriptions (
    id text PRIMARY KEY,
    provider_id text NOT NULL,
    endpoint text NOT NULL,
    sub text NOT NULL,
    created_at bigint
  )`;
  await q`CREATE INDEX IF NOT EXISTS provider_push_provider_idx ON provider_push_subscriptions(provider_id)`;
  // One row per (provider, endpoint): re-subscribing the same device must update, not accumulate.
  // Without this a provider who reinstalls collects dead endpoints and every reminder fans out to
  // them, which is how a push sender starts getting rate-limited.
  await q`CREATE UNIQUE INDEX IF NOT EXISTS provider_push_endpoint_uniq ON provider_push_subscriptions(provider_id, endpoint)`;
  _ready = true;
}

function rid() { return 'pp_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export async function saveProviderPushSub(providerId, sub) {
  if (!providerId || !sub || !sub.endpoint) return false;
  const q = sql();
  const endpoint = String(sub.endpoint);
  await q`INSERT INTO provider_push_subscriptions (id, provider_id, endpoint, sub, created_at)
    VALUES (${rid()}, ${String(providerId)}, ${endpoint}, ${JSON.stringify(sub)}, ${Date.now()})
    ON CONFLICT (provider_id, endpoint) DO UPDATE SET sub = EXCLUDED.sub, created_at = EXCLUDED.created_at`;
  return true;
}

export async function listProviderPushSubs(providerId) {
  if (!providerId) return [];
  const q = sql();
  const rows = await q`SELECT id, sub FROM provider_push_subscriptions WHERE provider_id=${String(providerId)}`;
  return rows.map(r => { let s = null; try { s = JSON.parse(r.sub); } catch (e) {} return s ? { id: r.id, sub: s } : null; }).filter(Boolean);
}

export async function deleteProviderPushSubByEndpoint(providerId, endpoint) {
  if (!providerId || !endpoint) return false;
  const q = sql();
  await q`DELETE FROM provider_push_subscriptions WHERE provider_id=${String(providerId)} AND endpoint=${String(endpoint)}`;
  return true;
}

// Used by the sender when a push service reports the subscription is gone (404/410). Scoped by id,
// which is already unique per provider, so this cannot reach another account's row.
export async function deleteProviderPushSubById(id) {
  if (!id) return false;
  const q = sql();
  await q`DELETE FROM provider_push_subscriptions WHERE id=${String(id)}`;
  return true;
}

export async function countProviderPushSubs(providerId) {
  if (!providerId) return 0;
  const q = sql();
  const rows = await q`SELECT count(*)::int AS n FROM provider_push_subscriptions WHERE provider_id=${String(providerId)}`;
  return (rows[0] && rows[0].n) || 0;
}

// CRON ONLY. Every owner that has at least one push subscription, with the reminder keys the cron
// needs, in one pass — so the job does not run a query per provider. Grouped by owner on the way out
// and never merged, so one provider's reminders cannot be sent to another's device.
export async function listReminderOwners() {
  if (!dbEnabled()) return [];
  const q = sql();
  const rows = await q`SELECT k.owner, k.k, k.v
    FROM kv k
    WHERE k.k IN ('sc_reminders', 'sc_pro_vc_invites', 'sc_clients', 'sc_notif_settings')
      AND EXISTS (SELECT 1 FROM provider_push_subscriptions p WHERE p.provider_id = k.owner)`;
  const byOwner = new Map();
  rows.forEach(r => {
    const o = String(r.owner);
    if (!byOwner.has(o)) byOwner.set(o, { owner: o, reminders: null, invites: null, clients: null, notif: null });
    const slot = byOwner.get(o);
    let parsed = null;
    try { parsed = JSON.parse(r.v); } catch (e) { return; }
    if (r.k === 'sc_reminders') slot.reminders = parsed;
    else if (r.k === 'sc_pro_vc_invites') slot.invites = parsed;
    else if (r.k === 'sc_clients') slot.clients = parsed;
    else if (r.k === 'sc_notif_settings') slot.notif = parsed;
  });
  return Array.from(byOwner.values());
}

// Dedupe, per provider. reminder_log's primary key is (client_id, rkey); provider reminders are
// claimed with the provider id in the client_id column, prefixed so the two namespaces can never
// collide with a real client id.
export function providerClaimKey(providerId) { return 'prov:' + String(providerId); }
