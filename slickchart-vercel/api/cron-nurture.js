// Scheduled nurture/drip sender — invoked by Vercel Cron (see vercel.json).
// Runs the lead + founder email sequences defined in lib/nurture.js. Safe to run
// as often as scheduled: every step is claimed once, and each contact gets at most
// one email per run. Auth matches cron-reminders (CRON_SECRET Bearer, or ?key= for
// a manual test).
import { dbEnabled } from '../lib/db.js';
import { runNurture } from '../lib/nurture.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;                                   // fail closed
  const h = req.headers['authorization'] || '';
  if (h === 'Bearer ' + secret) return true;                   // Vercel Cron
  if ((req.query && req.query.key) === secret) return true;     // manual test trigger
  return false;
}

export default async function handler(req, res) {
  if (!authorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }
  try {
    const summary = await runNurture();
    res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error('[cron-nurture] failed:', e && e.stack || e);
    res.status(500).json({ error: (e && e.message) || 'cron failed' });
  }
}
