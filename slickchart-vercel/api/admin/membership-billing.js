// /api/admin/membership-billing — Ashley's view of the server membership billing job, and its switch
// (2026-11-20). She chose "report-only first": the job lists who it WOULD charge until she turns real
// charging on here after reading that list.
//
//   GET   founder session or Monitor <key> -> { settings, labels, lastRun, days: [{day, accounts:[...]}] }
//   POST  founder session only: { membership_autobill_live, ..._start_hour, ..._end_hour, ..._retry_hours }
//
// Owner-only, from the VERIFIED token's email (§0.5), never a request field. The report never holds a
// client's name (initials only) and shows each provider by a masked email.
import { dbEnabled, sql, ensureProvidersTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { maskEmail } from '../../lib/app-launch-log.js';
import { FOUNDER_SETTINGS, getFounderSettings, setFounderSetting } from '../../lib/founder-settings.js';
import { ensureMembershipTables } from '../../lib/perks-billing.js';

const KEYS = ['membership_autobill_live', 'membership_autobill_start_hour', 'membership_autobill_end_hour', 'membership_autobill_retry_hours'];

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

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const q = sql();
  const founder = await founderSession(req, q);
  let monitor = false;
  if (!founder && req.method === 'GET') { try { monitor = await monitorKeyOk(req, q, (process.env.OWNER_EMAIL || '').trim().toLowerCase()); } catch (e) { monitor = false; } }
  if (!founder && !monitor) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }
  try {
    await ensureMembershipTables(q);
    if (req.method === 'POST') {
      const b = req.body || {};
      const saved = {};
      for (const k of KEYS) if (b[k] != null && b[k] !== '') { const v = await setFounderSetting(q, k, b[k]); if (v != null) saved[k] = v; }
      console.log('[admin/membership-billing] saved ' + JSON.stringify(saved));
      res.status(200).json({ ok: true, saved, settings: pick(await getFounderSettings(q)) });
      return;
    }
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
    await ensureProvidersTable();
    const settings = pick(await getFounderSettings(q));
    const labels = {}; for (const k of KEYS) labels[k] = { label: FOUNDER_SETTINGS[k].label, min: FOUNDER_SETTINGS[k].min, max: FOUNDER_SETTINGS[k].max, def: FOUNDER_SETTINGS[k].def };
    const rows = await q`SELECT r.day, r.owner, r.mode, r.summary, r.updated_at, p.email FROM membership_billing_reports r
      LEFT JOIN providers p ON p.id = r.owner
      WHERE r.day IN (SELECT DISTINCT day FROM membership_billing_reports ORDER BY day DESC LIMIT 3)
      ORDER BY r.day DESC, r.updated_at DESC LIMIT 300`;
    const byDay = {};
    for (const r of rows) {
      const s = typeof r.summary === 'string' ? JSON.parse(r.summary) : (r.summary || {});
      (byDay[r.day] = byDay[r.day] || []).push({ account: maskEmail(r.email || '') || 'an account', mode: r.mode, due: s.due || 0, wouldCharge: s.wouldCharge || 0, noCard: s.noCard || 0, charged: s.charged || 0, failed: s.failed || 0, amount: s.amount || 0, blocked: s.blocked || '', items: Array.isArray(s.items) ? s.items : [], at: s.at || null });
    }
    let lastRun = null;
    try { const lr = await q`SELECT started_at, finished_at, ok, summary FROM cron_runs WHERE name = 'cron-memberships' ORDER BY started_at DESC LIMIT 1`; if (lr[0]) lastRun = { at: lr[0].started_at, finished: !!lr[0].finished_at, ok: lr[0].ok, summary: lr[0].summary }; } catch (e) {}
    res.status(200).json({ ok: true, settings, labels, lastRun, days: Object.keys(byDay).sort().reverse().map(d => ({ day: d, accounts: byDay[d] })) });
  } catch (e) {
    console.error('[admin/membership-billing] failed:', (e && e.message) || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
function pick(all) { const o = {}; for (const k of KEYS) o[k] = all[k]; return o; }
