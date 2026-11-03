// /api/admin/orphans — people who PAID but never made their SlickChart account, what the automatic
// "finish your account" email did for each, and Ashley's two wait settings for it.
//
//   GET   founder session  -> full list + settings
//         Monitor <key>    -> same, emails masked (the daily brief reads this; she authorized the key)
//   POST  founder session only: { orphan_email_hours, orphan_alert_hours } -> saves either or both
//
// Owner-only, resolved from the VERIFIED token's email (§0.5), never from a request field. Reads only
// billing rows and the send log; it never changes a subscription or contacts anyone.
import { dbEnabled, sql, ensureProvidersTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { maskEmail } from '../../lib/app-launch-log.js';
import { ensureNurtureTables } from '../../lib/nurture.js';
import { FOUNDER_SETTINGS, getFounderSettings, setFounderSetting } from '../../lib/founder-settings.js';

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

const iso = v => { const t = v ? new Date(v).getTime() : 0; return t ? new Date(t).toISOString() : null; };

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const q = sql();
  const founder = await founderSession(req, q);
  let monitor = false;
  if (!founder && req.method === 'GET') { try { monitor = await monitorKeyOk(req, q, (process.env.OWNER_EMAIL || '').trim().toLowerCase()); } catch (e) { monitor = false; } }
  if (!founder && !monitor) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }

  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      const saved = {};
      for (const k of Object.keys(FOUNDER_SETTINGS)) if (b[k] != null && b[k] !== '') { const v = await setFounderSetting(q, k, b[k]); if (v != null) saved[k] = v; }
      const settings = await getFounderSettings(q);
      res.status(200).json({ ok: true, saved, settings });
      return;
    }
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

    await ensureProvidersTable();
    await ensureNurtureTables(q);
    const settings = await getFounderSettings(q);
    const rows = await q`SELECT s.email, s.updated_at,
        (SELECT sent_at FROM nurture_sends n WHERE n.email = lower(s.email) AND n.seq = 'orphan' AND n.step = 0) AS emailed_at,
        (SELECT sent_at FROM nurture_sends n WHERE n.email = lower(s.email) AND n.seq = 'orphan' AND n.step = 1) AS alerted_at,
        EXISTS (SELECT 1 FROM nurture_optout o WHERE o.email = lower(s.email)) AS unsubscribed
      FROM subscriptions s
      WHERE s.status IN ('active', 'trialing') AND coalesce(s.stripe_subscription_id, '') <> ''
        AND s.updated_at > now() - interval '60 days'
        AND NOT EXISTS (SELECT 1 FROM providers p WHERE lower(p.email) = lower(s.email))
      ORDER BY s.updated_at DESC LIMIT 50`;
    let fails = {};
    try { (await q`SELECT lower(email) AS e, count(*)::int AS n FROM login_attempts WHERE ts > now() - interval '30 days' GROUP BY lower(email)`).forEach(r => { fails[r.e] = r.n; }); } catch (e) {}
    const people = rows.map(r => {
      const em = String(r.email || '').toLowerCase();
      const hours = Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 3600000);
      const emailed = iso(r.emailed_at);
      let status;
      if (emailed) status = 'emailed';
      else if (r.unsubscribed) status = 'unsubscribed, not emailed';
      else if (hours < settings.orphan_email_hours) status = 'waiting (' + (settings.orphan_email_hours - hours) + 'h until the email)';
      else status = 'due, goes out on the next hourly run';
      return { email: founder ? em : maskEmail(em), paidAt: iso(r.updated_at), hoursSincePaid: hours, emailedAt: emailed, alertedAt: iso(r.alerted_at), status, failedSignIns: fails[em] || 0 };
    });
    const labels = {}; for (const k of Object.keys(FOUNDER_SETTINGS)) labels[k] = { label: FOUNDER_SETTINGS[k].label, min: FOUNDER_SETTINGS[k].min, max: FOUNDER_SETTINGS[k].max, def: FOUNDER_SETTINGS[k].def };
    res.status(200).json({ ok: true, settings, labels, people });
  } catch (e) {
    console.error('[admin/orphans] failed:', (e && e.message) || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
