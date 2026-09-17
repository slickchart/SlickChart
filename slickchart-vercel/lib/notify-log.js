// A short, append-only record of every founder notification the server TRIED to send.
//
// Why this exists: a signup push that goes nowhere leaves no trace anybody can look at. Ashley
// can't read Vercel logs, and by the time she notices a missing alert the invocation is long gone.
// Two real provider signups were missed with no way to tell which link in the chain broke — was the
// alert skipped, did it find no phone, or did it send and not arrive? Each of those has a different
// fix and there was no evidence to choose between them. So every attempt now writes one row saying
// exactly what happened, and the founder test tool reads the last few back.
//
// Deliberately tiny and best-effort: it must never be able to fail a signup. Every function here
// swallows its own errors.
import { sql } from './db.js';

let _ensured = false;
async function ensure(q) {
  if (_ensured) return;
  await q`CREATE TABLE IF NOT EXISTS notify_log (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    kind text,
    subject text,
    skipped text,
    devices int,
    sent int,
    detail text
  )`;
  _ensured = true;
}

// One address, partly hidden. The log is founder-only, but there is no reason to keep a plain list
// of signup addresses in a second place when the first few characters identify the row just as well.
export function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at < 1) return s ? s.slice(0, 2) + '…' : '';
  return s.slice(0, Math.min(3, at)) + '…' + s.slice(at);
}

/**
 * Record one founder-notification attempt.
 * @param {{kind:string, subject?:string, skipped?:string, devices?:number, sent?:number, detail?:string}} e
 *   kind    — 'provider-signup' | 'build-sale' | 'test'
 *   skipped — why nothing was sent, or '' when it was attempted
 */
export async function recordNotify(e) {
  try {
    const q = sql();
    await ensure(q);
    await q`INSERT INTO notify_log (kind, subject, skipped, devices, sent, detail)
      VALUES (${String(e.kind || '')}, ${maskEmail(e.subject)}, ${String(e.skipped || '')},
              ${Number(e.devices || 0)}, ${Number(e.sent || 0)}, ${String(e.detail || '').slice(0, 500)})`;
  } catch (err) { /* a log that can break a signup is worse than no log */ }
}

/** The most recent attempts, newest first. Returns [] on any problem. */
export async function recentNotifies(limit) {
  try {
    const q = sql();
    await ensure(q);
    const n = Math.max(1, Math.min(20, parseInt(limit, 10) || 5));
    return await q`SELECT at, kind, subject, skipped, devices, sent, detail
      FROM notify_log ORDER BY id DESC LIMIT ${n}`;
  } catch (err) { return []; }
}
