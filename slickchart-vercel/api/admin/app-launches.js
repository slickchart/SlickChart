// GET /api/admin/app-launches   Authorization: Monitor <key>  (or a founder session)
// The phone apps' launch logs (lib/app-launch-log.js), newest first, so Claude can see why an app
// closes or signs someone out WITHOUT asking the founder or the provider for anything (CLAUDE.md §4d).
// Same owner-made, revocable, read-only key as api/admin/push-state.js. Emails are masked; there is
// no client data in these rows to begin with. ?platform=ios narrows it.
import { dbEnabled, sql } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { ensureAppLaunchTable, maskEmail } from '../../lib/app-launch-log.js';

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
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const q = sql();
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  let ok = false;
  try { ok = (await monitorKeyOk(req, q, owner)) || (await founderSession(req, q)); } catch (e) { ok = false; }
  if (!ok) { res.status(403).json({ error: 'Owner-only.' }); return; }
  await ensureAppLaunchTable();
  const plat = String((req.query && req.query.platform) || '').toLowerCase().replace(/[^a-z]/g, '');
  const rows = plat
    ? await q`SELECT * FROM app_launch_logs WHERE lower(platform) = ${plat} ORDER BY updated_at DESC LIMIT 60`
    : await q`SELECT * FROM app_launch_logs ORDER BY updated_at DESC LIMIT 60`;
  res.status(200).json({ phones: (rows || []).map(r => ({
    device: String(r.device_key).slice(-6), account: maskEmail(r.email) || '(not signed in)', platform: r.platform, os: r.os, build: r.build,
    updated: r.updated_at, events: r.events || [] })) });
}
