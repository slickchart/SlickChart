// Public (token-authed): a client opens their personal link; we return only THEIR
// data blob (summaries, aftercare, forms, photos) plus the provider's shared
// branding, looked up separately — not duplicated inside every client's own row,
// which doesn't scale as a client list grows (this used to cause outsized sync
// payloads once a provider had more than a few clients).
import { dbEnabled, getKVValue } from '../lib/db.js';
import { ensureClientTables, getClientByToken, markOpened } from '../lib/clients.js';
import { getBookingConfig, listServices } from '../lib/booking.js';

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
    // Provider identity backfill. providerName/studio ride inside the client's own blob, written when
    // the provider last published this client's space — so a client invited before the provider filled
    // in their business info (or whose blob predates these fields) arrives with them blank, and the
    // client app then has no real name to show. Fill them from the provider's live business info here.
    // Scoped to c.provider_id, which comes from the token's own client row — never from the request.
    try {
      const needName = !String(data.providerName || '').trim();
      const needStudio = !String(data.studio || '').trim();
      if (needName || needStudio) {
        const rawBiz = await getKVValue(c.provider_id, 'sc_bizinfo');
        const biz = rawBiz ? JSON.parse(rawBiz) : null;
        if (biz && typeof biz === 'object') {
          if (needStudio && biz.name) data.studio = String(biz.name).trim();
          if (needName) {
            // Same derivation the provider app uses: owner name (or business name), first word only.
            const who = String(biz.ownerName || biz.name || '').trim();
            const first = who ? (who.split(',')[0].trim().split(/\s+/)[0] || '') : '';
            if (first) data.providerName = first;
          }
          if (!String(data.website || '').trim() && biz.website) data.website = String(biz.website).trim();
        }
      }
    } catch (e) { /* best-effort — the client app falls back to neutral wording, never the demo seed */ }
    try {
      const rawCat = await getKVValue(c.provider_id, 'sc_shop_catalog');
      if (rawCat) data.catalog = JSON.parse(rawCat);
    } catch (e) { /* no catalog published yet — client shows recommended only */ }
    try {
      const rawCfg = await getKVValue(c.provider_id, 'sc_checkin_cfg');
      if (rawCfg) data.checkinCfg = JSON.parse(rawCfg);
    } catch (e) { /* no saved check-in config yet, client falls back to defaults */ }
    // THE SERVICES THIS CLIENT MAY REQUEST — her real catalog and nothing invented.
    //
    // This read sc_service_menu directly, so a provider on Square was offering her clients the app's
    // own menu while booking out of a different catalog: Ashley, 2026-10-12, "the preferred services
    // do not match the service catalog". listServices() is the one resolver — Square's catalog when
    // she has Square, her own service menu when she does not, and an EMPTY list when she has listed
    // nothing, which the client app shows honestly instead of offering a made-up "Appointment".
    //
    // The provider id comes from the token's own row (getClientByToken), never from the request, so
    // a client can only ever be told about their own provider's services (CLAUDE.md 0.1, 0.3).
    try {
      const svcCfg = await getBookingConfig(c.provider_id);
      const svc = await listServices(c.provider_id, svcCfg);
      data.services = (svc || []).map(s => String((s && s.name) || '').trim()).filter(Boolean);
    } catch (e) { /* Square or the menu unreadable — the client app shows its empty state */ }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).json({
      ok: true,
      client: { id: c.id, name: c.name || '', email: c.email || '', data }
    });
  } catch (e) { console.error('[client-data] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
