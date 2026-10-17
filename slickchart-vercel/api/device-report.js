// POST /api/device-report — provider-authed. The app sends a small health report about the device it is
// running on (counts only, see lib/device-report.js). The account it is filed under comes from the
// verified session token, never from the body.
import { sessionFromReq } from '../lib/auth.js';
import { sql, dbEnabled } from '../lib/db.js';
import { saveDeviceReport } from '../lib/device-report.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  let p = null;
  try { p = await sessionFromReq(req, sql()); } catch (e) { p = null; }
  if (!p || !p.u) { res.status(401).json({ error: 'Not signed in' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const key = String((body && body.device) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (!key || !body || typeof body.report !== 'object') { res.status(400).json({ error: 'Bad report' }); return; }
  try {
    await saveDeviceReport(String(p.u), key, Object.assign({}, body.report, { email: String(p.e || '') }));
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[device-report] failed:', e && e.stack || e);
    res.status(200).json({ ok: false });
  }
}
