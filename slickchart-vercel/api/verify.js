// GET/POST /api/verify?token=...  — marks a provider's email as verified.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database is configured.' }); return; }
  const token = String((req.query && req.query.token) || (req.body && req.body.token) || '');
  if (!token) { res.status(400).json({ error: 'Missing token.' }); return; }
  try {
    await ensureProvidersTable();
    const q = sql();
    const rows = await q`SELECT provider_id FROM auth_tokens WHERE token = ${token} AND kind = 'verify' AND expires_at > now()`;
    if (!rows.length) { res.status(400).json({ error: 'This verification link is invalid or has expired.' }); return; }
    await q`UPDATE providers SET verified = true WHERE id = ${rows[0].provider_id}`;
    await q`DELETE FROM auth_tokens WHERE token = ${token}`;
    res.status(200).json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
