// GET /api/admin/capacity   Authorization: Monitor <key>  (or a founder session)
//
// "Is SlickChart ready for 600 paying providers?" (Ashley, 2026-11-18). Answers it with the live
// numbers instead of guesses: how big the database is and what fills it, how much each account
// stores today (median, busiest, the share of the total), how close any account is to the 4.5 MB
// one-request limit that a new device's first full read has to fit in, how many emails, pushes and
// AI calls the app sends a month, and a straight-line projection of all of it to N accounts
// (?accounts=600 by default).
//
// Read-only. Sizes and counts only: never a stored value, a client name or any content. Accounts are
// named by masked email (same as the health sweep). Same owner-made, revocable key as push-state.
// Every section runs on its own, so one that fails says so and never hides the others.
import { dbEnabled, sql } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { maskEmail } from '../../lib/app-launch-log.js';

// The size every new device's first read (GET /api/store with no `since`) has to fit in: Vercel
// refuses a function response over 4.5 MB. JSON-escaping the stored strings adds to their raw size,
// which is why this is measured on to_json(v), the form the response actually carries.
export const ONE_READ_LIMIT = 4.5e6;

async function founderSession(req, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = secret && tok ? verifyToken(tok, secret) : null;
  if (!p) return false;
  try { if (p.sid && !(await isSessionValid(q, p.sid))) return false; } catch (e) {}
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  return founders.includes(String(p.e || '').toLowerCase());
}

const MB = n => Math.round(Number(n || 0) / 1e4) / 100;
export function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
// Projection: today's per-account sizes, scaled to N accounts. Two numbers, because the busy
// accounts carry most of the weight: "like today's mix" (total / accounts * N) and "if every
// account grew to today's 90th percentile" (p90 * N), a planning ceiling rather than a forecast.
export function project(perAccount, n) {
  const v = perAccount.filter(x => x > 0).sort((a, b) => a - b);
  const sum = v.reduce((s, x) => s + x, 0);
  return { accounts: v.length, totalMB: MB(sum), medianMB: MB(pct(v, 50)), p90MB: MB(pct(v, 90)), maxMB: MB(v[v.length - 1] || 0),
    atN_likeTodayMB: v.length ? MB(sum / v.length * n) : 0, atN_ifAllP90MB: MB(pct(v, 90) * n) };
}

export async function capacityReport(q, n) {
  const out = { at: new Date().toISOString(), projectTo: n, sections: {} };
  const run = async (name, fn) => { try { out.sections[name] = await fn(); } catch (e) { out.sections[name] = { error: String((e && e.message) || e).slice(-300) }; } };
  const emails = {};
  try { (await q`SELECT id, email FROM providers`).forEach(r => { emails[String(r.id)] = maskEmail(r.email); }); } catch (e) {}
  const who = id => emails[String(id)] || ('account …' + String(id || '').slice(-4));

  await run('accounts', async () => {
    const p = await q`SELECT count(*)::int AS n, count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new30 FROM providers`;
    let paying = null, statuses = {};
    try { (await q`SELECT status, count(*)::int AS n FROM subscriptions GROUP BY status`).forEach(r => { statuses[r.status] = r.n; }); paying = (statuses.active || 0) + (statuses.trialing || 0); } catch (e) {}
    return { providers: p[0].n, createdLast30Days: p[0].new30, subscriptions: statuses, activeOrTrialing: paying };
  });

  await run('database', async () => {
    const d = await q`SELECT pg_database_size(current_database())::bigint AS b`;
    const t = await q`SELECT c.relname AS tname, pg_total_relation_size(c.oid)::bigint AS b, coalesce(s.n_live_tup, 0)::bigint AS rows
      FROM pg_class c LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace ORDER BY 2 DESC LIMIT 20`;
    return { totalMB: MB(d[0].b), tables: t.map(r => ({ table: r.tname, MB: MB(r.b), rows: Number(r.rows) })) };
  });

  // Per-account footprint, by where it lives. kv = the synced libraries (what a device reads);
  // kv_history = the safety-net copies; files = photos, PDFs, lesson files (base64 in Postgres);
  // client_events = forms, check-ins and consults clients sent in (with their photos).
  const per = {};
  const add = (id, k, b) => { const o = per[id] || (per[id] = { kv: 0, firstRead: 0, history: 0, files: 0, fileCount: 0, events: 0 }); o[k] += Number(b) || 0; };
  await run('kv', async () => {
    const r = await q`SELECT owner, sum(octet_length(v))::bigint AS b, sum(octet_length(to_json(v)::text))::bigint AS j, count(*)::int AS n FROM kv GROUP BY owner`;
    r.forEach(x => { add(x.owner, 'kv', x.b); add(x.owner, 'firstRead', x.j); });
    const big = await q`SELECT owner, k, octet_length(v)::bigint AS b FROM kv ORDER BY octet_length(v) DESC NULLS LAST LIMIT 12`;
    return { biggestValues: big.map(x => who(x.owner) + ': ' + x.k + ' ' + MB(x.b) + ' MB') };
  });
  await run('kvHistory', async () => {
    const r = await q`SELECT owner, sum(octet_length(v))::bigint AS b FROM kv_history GROUP BY owner`;
    r.forEach(x => add(x.owner, 'history', x.b));
    const by = await q`SELECT reason, count(*)::int AS n, sum(octet_length(v))::bigint AS b FROM kv_history GROUP BY reason ORDER BY 3 DESC`;
    return { byReason: by.map(x => ({ reason: x.reason, copies: x.n, MB: MB(x.b) })) };
  });
  await run('files', async () => {
    const r = await q`SELECT owner, count(*)::int AS n, sum(octet_length(data) + coalesce(octet_length(staging), 0))::bigint AS b FROM files GROUP BY owner`;
    r.forEach(x => { add(x.owner, 'files', x.b); add(x.owner, 'fileCount', x.n); });
    const g = await q`SELECT count(*) FILTER (WHERE updated_at > now() - interval '30 days')::int AS n30,
      coalesce(sum(octet_length(data)) FILTER (WHERE updated_at > now() - interval '30 days'), 0)::bigint AS b30,
      count(*)::int AS n, coalesce(avg(octet_length(data)), 0)::bigint AS avg FROM files`;
    return { files: g[0].n, averageKB: Math.round(Number(g[0].avg) / 1000), addedLast30Days: g[0].n30, addedLast30DaysMB: MB(g[0].b30) };
  });
  await run('clientEvents', async () => {
    const r = await q`SELECT provider_id, sum(octet_length(payload::text))::bigint AS b FROM client_events GROUP BY provider_id`;
    r.forEach(x => add(x.provider_id, 'events', x.b));
    const g = await q`SELECT count(*)::int AS n, count(*) FILTER (WHERE created_at > (extract(epoch from now()) * 1000 - 2592000000::bigint))::int AS n30,
      coalesce(sum(octet_length(payload::text)) FILTER (WHERE created_at > (extract(epoch from now()) * 1000 - 2592000000::bigint)), 0)::bigint AS b30 FROM client_events`;
    return { events: g[0].n, addedLast30Days: g[0].n30, addedLast30DaysMB: MB(g[0].b30) };
  });

  await run('perAccount', async () => {
    const ids = Object.keys(per).filter(id => emails[id]);   // real provider accounts only
    const col = k => ids.map(id => per[id][k]);
    const total = ids.map(id => per[id].kv + per[id].history + per[id].files + per[id].events);
    const firstRead = ids.map(id => ({ id, b: per[id].firstRead })).sort((a, b) => b.b - a.b);
    const top = ids.map((id, i) => ({ id, t: total[i] })).sort((a, b) => b.t - a.t).slice(0, 10)
      .map(x => { const o = per[x.id]; return who(x.id) + ': ' + MB(x.t) + ' MB (libraries ' + MB(o.kv) + ', safety copies ' + MB(o.history) + ', ' + o.fileCount + ' files ' + MB(o.files) + ', client submissions ' + MB(o.events) + ')'; });
    return {
      all: project(total, n), libraries: project(col('kv'), n), safetyCopies: project(col('history'), n),
      files: project(col('files'), n), clientSubmissions: project(col('events'), n),
      busiest: top,
      // A new device's first read is ONE response. Past 4.5 MB that device cannot open the account.
      firstReadOverLimit: firstRead.filter(x => x.b > ONE_READ_LIMIT).map(x => who(x.id) + ': ' + MB(x.b) + ' MB'),
      firstReadOver3MB: firstRead.filter(x => x.b > 3e6 && x.b <= ONE_READ_LIMIT).map(x => who(x.id) + ': ' + MB(x.b) + ' MB'),
      firstReadLargest: firstRead.slice(0, 5).map(x => who(x.id) + ': ' + MB(x.b) + ' MB')
    };
  });

  // Monthly volumes that scale with accounts (each one best-effort: a table may not exist yet).
  await run('monthly', async () => {
    const m = {};
    const tryN = async (k, f) => { try { const r = await f(); m[k] = Number((r[0] && r[0].n) || 0); } catch (e) { m[k] = null; } };
    await tryN('clientReminderEmails', () => q`SELECT count(*)::int AS n FROM reminder_log WHERE sent_at > (extract(epoch from now()) * 1000 - 2592000000::bigint)`);
    await tryN('nurtureEmails', () => q`SELECT count(*)::int AS n FROM nurture_sends WHERE sent_at > now() - interval '30 days'`);
    await tryN('announcementEmails', () => q`SELECT count(*)::int AS n FROM announcement_emails WHERE sent_at > now() - interval '30 days'`);
    await tryN('bookingAlerts', () => q`SELECT count(*)::int AS n FROM booking_alert_log WHERE at > (extract(epoch from now()) * 1000 - 2592000000::bigint)`);
    await tryN('nativePushes', () => q`SELECT count(*)::int AS n FROM native_push_log WHERE at > now() - interval '30 days'`);
    await tryN('founderAlerts', () => q`SELECT count(*)::int AS n FROM notify_log WHERE at > now() - interval '30 days'`);
    await tryN('aiCalls', () => q`SELECT coalesce(sum(CASE WHEN v ~ '^[0-9]+$' THEN v::int ELSE 0 END), 0)::int AS n FROM kv
      WHERE k LIKE 'aiusage:%' AND k >= ${'aiusage:' + new Date(Date.now() - 2592000000).toISOString().slice(0, 10)}`);
    await tryN('aiAccounts', () => q`SELECT count(DISTINCT owner)::int AS n FROM kv WHERE k LIKE 'aiusage:%'
      AND k >= ${'aiusage:' + new Date(Date.now() - 2592000000).toISOString().slice(0, 10)}`);
    await tryN('squareConnections', () => q`SELECT count(*)::int AS n FROM square_connections`);
    return m;
  });
  // How long each scheduled job takes today, so its time at N accounts can be read against the
  // platform's 300 s limit (most of them walk every account once per run).
  await run('jobs', async () => {
    const r = await q`SELECT name, count(*)::int AS runs,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - started_at)))::int AS typical_s,
        round(max(extract(epoch FROM finished_at - started_at)))::int AS slowest_s,
        count(*) FILTER (WHERE finished_at IS NULL AND started_at < now() - interval '15 minutes')::int AS never_finished
      FROM cron_runs WHERE started_at > now() - interval '7 days' GROUP BY name ORDER BY name`;
    return r.map(x => ({ job: x.name, runs: x.runs, typicalSeconds: x.typical_s, slowestSeconds: x.slowest_s, neverFinished: x.never_finished }));
  });
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const q = sql();
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  let ok = false;
  try { ok = (await monitorKeyOk(req, q, owner)) || (await founderSession(req, q)); } catch (e) { ok = false; }
  if (!ok) { res.status(403).json({ error: 'Owner-only.' }); return; }
  const n = Math.max(1, Math.min(100000, parseInt((req.query && req.query.accounts) || '600', 10) || 600));
  res.status(200).json(await capacityReport(q, n));
}
