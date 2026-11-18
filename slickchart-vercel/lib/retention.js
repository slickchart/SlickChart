// OLD RECORDS THAT NOTHING EVER REMOVED (2026-11-18 sweep; Ashley: "fix all of those").
//
// These tables only ever grew. Every rule below deletes ONLY rows that can no longer change what the
// app does, and keeps a generous margin. It runs once a day (claimed in reminder_log, so overlapping
// cron runs cannot both do it) and in bounded batches, so one run can never hold the database long.
// Each rule is its own try: one failing never stops the others.
//
// Deliberately NOT touched:
//  - sessions that are not revoked: a phone or computer can hold a sign-in for years, and a missing
//    session row reads as signed out (isSessionValid). Only revoked ones go.
//  - reminder_log rows whose key is not dated: "hasn't visited in N days" (evt:nov...) and healing
//    stages (heal-...) would send again if their claim disappeared, and 'founder' rows are her paid
//    sign-up alerts. Only dated, one-time keys go: homecare/appointment reminders (the date is in the
//    key), one-time automations (sent within 48 h of their time), birthdays (the year is in the key),
//    and check-in requests for a booking long past.
//  - client_events, notify_log, beta_events, kv itself: those are records she or the brief reads.
//  - kv_history 'shrink', 'daily', 'device-snapshot' and 'from-backup' copies: pruneKey already keeps
//    a fixed number of those per key. Here only the reasons it never pruned.
import { claimReminder } from './clients.js';

const BATCH = 5000;

async function batched(label, out, fn) {
  let n = 0;
  try {
    for (let i = 0; i < 20; i++) {            // at most 100,000 rows per rule per day
      const r = await fn();
      const k = Array.isArray(r) ? r.length : 0;
      n += k;
      if (k < BATCH) break;
    }
  } catch (e) { out.errors.push(label + ': ' + String((e && e.message) || e).slice(0, 120)); }
  out.removed[label] = n;
}

export async function pruneOldRecords(q) {
  const out = { removed: {}, errors: [] };

  // kv_history: copies kept before a restore, a dedupe or a purge. Keep the newest 10 per account and
  // key and reason, and anything from the last 90 days, whatever its count.
  await batched('kv_history', out, () => q`DELETE FROM kv_history WHERE id IN (
      SELECT id FROM (
        SELECT id, saved_at, row_number() OVER (PARTITION BY owner, k, reason ORDER BY saved_at DESC) AS rn
        FROM kv_history WHERE reason IN ('before-restore', 'dedupe', 'before-purge')
      ) t WHERE rn > 10 AND saved_at < now() - interval '90 days' LIMIT ${BATCH}
    ) RETURNING id`);

  // reminder_log: dated one-time claims older than 180 days (sent_at is epoch ms).
  await batched('reminder_log', out, () => q`DELETE FROM reminder_log WHERE ctid IN (
      SELECT ctid FROM reminder_log
      WHERE client_id <> 'founder' AND sent_at IS NOT NULL
        AND sent_at < (extract(epoch from now()) * 1000 - 15552000000::bigint)
        AND (rkey LIKE 'homecare%' OR rkey LIKE 'apptbefore:%' OR rkey LIKE 'apptday:%'
          OR rkey LIKE 'auto:%' OR rkey LIKE 'evt:bday:%' OR rkey LIKE 'cicron:%' OR rkey LIKE 'retention:%')
      LIMIT ${BATCH}
    ) RETURNING client_id`);

  // Failed sign-in attempts older than 45 days (the limiter looks back 15 minutes; reports 30 days).
  await batched('login_attempts', out, () => q`DELETE FROM login_attempts WHERE id IN (
      SELECT id FROM login_attempts WHERE ts < now() - interval '45 days' LIMIT ${BATCH}) RETURNING id`);

  // One-time links (reset, email change, ...) that expired more than 7 days ago.
  await batched('auth_tokens', out, () => q`DELETE FROM auth_tokens WHERE token IN (
      SELECT token FROM auth_tokens WHERE expires_at < now() - interval '7 days' LIMIT ${BATCH}) RETURNING token`);

  // Sign-ins she (or a password change) already ended, unseen for 60 days. A missing row reads as
  // ended too, so removing one changes nothing.
  await batched('sessions', out, () => q`DELETE FROM sessions WHERE id IN (
      SELECT id FROM sessions WHERE revoked = true AND last_seen_at < now() - interval '60 days' LIMIT ${BATCH}) RETURNING id`);

  // The AI daily-use counters (one row per caller per day). The limit and the capacity report read
  // the last 30 days; keep 90.
  await batched('ai_usage', out, () => q`DELETE FROM kv WHERE ctid IN (
      SELECT ctid FROM kv WHERE k LIKE 'aiusage:%'
        AND k < ${'aiusage:' + new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)} LIMIT ${BATCH}
    ) RETURNING k`);

  return out;
}

// Once a day, whichever cron gets there first.
export async function pruneOldRecordsDaily(q) {
  const day = new Date().toISOString().slice(0, 10);
  let mine = false;
  try { mine = await claimReminder('system', 'retention:' + day); } catch (e) { mine = false; }
  if (!mine) return null;
  const out = await pruneOldRecords(q);
  try { console.log('[retention]', JSON.stringify(out)); } catch (e) {}
  return out;
}
