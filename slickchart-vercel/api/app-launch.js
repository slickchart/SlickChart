// POST /api/app-launch — the phone app's own launch log (lib/app-launch-log.js). Works signed in or
// not, because the problem it exists for is a phone that never gets signed in. The account comes only
// from a verified session token; the body can name nothing but its own random device key.
import { sessionFromReq } from '../lib/auth.js';
import { sql, dbEnabled } from '../lib/db.js';
import { saveAppLaunch } from '../lib/app-launch-log.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  let body = req.body;
  // The app's offline page posts text/plain (no CORS preflight from the app's own local page).
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object' || JSON.stringify(body).length > 16000) { res.status(400).json({ error: 'Bad log' }); return; }
  const key = String(body.device || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (!key) { res.status(400).json({ error: 'Bad log' }); return; }
  let who = null;
  try { who = await sessionFromReq(req, sql()); } catch (e) { who = null; }
  try { await saveAppLaunch(key, body, who); res.status(200).json({ ok: true }); }
  catch (e) { console.error('[app-launch] failed:', e && e.stack || e); res.status(200).json({ ok: false }); }
}
