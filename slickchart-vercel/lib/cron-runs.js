// A record of every scheduled job run (2026-10-29). Until now no cron recorded that it ran at all: its
// summary went only into the HTTP response and each failure only to console.error, so a reminder or
// check-in job that stopped, or ran and reached nobody, left nothing Ashley or the daily health sweep
// could see. withCronRun wraps a cron handler, lets it run exactly as before, and writes one row with
// the status code and the NUMBERS from its JSON reply (counts only: an array is stored as its length,
// text is dropped), so no client name, email or message can ever land here. Best-effort: a failure to
// record never changes the cron's own response.
import { sql, dbEnabled } from './db.js';

let _ready = false;
export async function ensureCronRunsTable(q) {
  if (_ready) return;
  await q`CREATE TABLE IF NOT EXISTS cron_runs (
    id bigserial PRIMARY KEY,
    name text NOT NULL,
    started_at timestamptz NOT NULL,
    finished_at timestamptz DEFAULT now(),
    status int,
    ok boolean,
    summary jsonb
  )`;
  _ready = true;
}

// Numbers and true/false only, one level down at most.
export function countsOnly(body) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const [k, v] of Object.entries(body).slice(0, 40)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k + '_count'] = v.length;
    else if (v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v).slice(0, 20)) {
        if (typeof v2 === 'number' && Number.isFinite(v2)) out[k + '.' + k2] = v2;
        else if (typeof v2 === 'boolean') out[k + '.' + k2] = v2;
        else if (Array.isArray(v2)) out[k + '.' + k2 + '_count'] = v2.length;
      }
    }
  }
  return out;
}

export function withCronRun(name, handler) {
  return async function cronWithRunLog(req, res) {
    const started = new Date();
    let status = 200, body = null, threw = false;
    const origStatus = res.status ? res.status.bind(res) : null;
    const origJson = res.json ? res.json.bind(res) : null;
    if (origStatus) res.status = (c) => { status = c; return origStatus(c); };
    if (origJson) res.json = (b) => { body = b; return origJson(b); };
    try { await handler(req, res); }
    catch (e) { threw = true; status = 500; throw e; }
    finally {
      // A refused caller (no CRON_SECRET) is not a run.
      if (status !== 401 && status !== 403 && dbEnabled()) {
        try {
          const q = sql();
          await ensureCronRunsTable(q);
          const ok = !threw && status < 400 && !(body && body.ok === false);
          await q`INSERT INTO cron_runs (name, started_at, status, ok, summary)
                  VALUES (${name}, ${started.toISOString()}, ${status}, ${ok}, ${JSON.stringify(countsOnly(body))}::jsonb)`;
          if (Math.random() < 0.02) await q`DELETE FROM cron_runs WHERE finished_at < now() - interval '30 days'`;
        } catch (e) { /* never let the record fail the cron */ }
      }
    }
  };
}
