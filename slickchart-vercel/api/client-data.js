// Public (token-authed): a client opens their personal link; we return only THEIR
// data blob (summaries, aftercare, forms, photos) plus the provider's shared
// branding, looked up separately — not duplicated inside every client's own row,
// which doesn't scale as a client list grows (this used to cause outsized sync
// payloads once a provider had more than a few clients).
import { dbEnabled, getKVValue } from '../lib/db.js';
import { ensureClientTables, getClientByToken, markOpened } from '../lib/clients.js';

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(404).json({ error: 'Not found' }); return; }
  const token = (req.query && req.query.t) || (req.body && req.body.t) || '';
  if (!token) { res.status(400).json({ error: 'Missing link token' }); return; }
  try {
    await ensureClientTables();
    const c = await getClientByToken(String(token));
    if (!c) { res.status(404).json({ error: 'This link is not valid or has been removed.' }); return; }
    markOpened(String(token)).catch(() => {});
    const data = Object.assign({}, c.data || {});
    try {
      const raw = await getKVValue(c.provider_id, 'sc_brand_colors');
      if (raw) data.brand = JSON.parse(raw);
    } catch (e) { /* fall back to whatever (if anything) was already in data.brand */ }
    try {
      const rawCat = await getKVValue(c.provider_id, 'sc_shop_catalog');
      if (rawCat) data.catalog = JSON.parse(rawCat);
    } catch (e) { /* no catalog published yet — client shows recommended only */ }
    try {
      const rawCfg = await getKVValue(c.provider_id, 'sc_checkin_cfg');
      if (rawCfg) data.checkinCfg = JSON.parse(rawCfg);
    } catch (e) { /* no saved check-in config yet — client falls back to defaults */ }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).json({
      ok: true,
      client: { id: c.id, name: c.name || '', email: c.email || '', data }
    });
  } catch (e) { console.error('[client-data] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
