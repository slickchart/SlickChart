// GET/PUT /api/client-prefs?t=token — token-authed, same pattern as
// /api/client-data. This is where a client's OWN settings live for real:
// notification preferences, homecare check-off state, engagement streaks,
// dismissed banners. None of this should only live in one browser.
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, getClientByToken, getClientPrefs, saveClientPrefs } from '../lib/clients.js';

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ ok: false, prefs: {} }); return; }
  await ensureClientTables();
  const token = (req.query && req.query.t) || (req.body && req.body.t) || '';
  if (!token) { res.status(400).json({ error: 'Missing link token' }); return; }
  try {
    const c = await getClientByToken(String(token));
    if (!c) { res.status(404).json({ error: 'This link is not valid or has been removed.' }); return; }

    if (req.method === 'GET') {
      const prefs = await getClientPrefs(c.id);
      res.status(200).json({ ok: true, prefs });
      return;
    }
    if (req.method === 'PUT') {
      const body = req.body || {};
      const prefs = (body.prefs && typeof body.prefs === 'object') ? body.prefs : {};
      await saveClientPrefs(c.id, prefs);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
