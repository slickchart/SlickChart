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
    // Courses this client has paid for. Stored per provider as one accumulating map keyed
    // "<clientId>:<courseId>" (written by the Square webhook); we hand back only the ids belonging to
    // THIS client, so one client's link can never reveal what another client bought.
    try {
      const rawBuys = await getKVValue(c.provider_id, 'sc_course_purchases');
      if (rawBuys) {
        const all = JSON.parse(rawBuys) || {};
        const mine = {};
        const prefix = String(c.id) + ':';
        Object.keys(all).forEach(k => { if (k.indexOf(prefix) === 0) mine[k.slice(prefix.length)] = all[k]; });
        if (Object.keys(mine).length) data.purchases = mine;
      }
    } catch (e) { /* nothing purchased yet, or unreadable — the course simply stays locked */ }
    try {
      const rawCfg = await getKVValue(c.provider_id, 'sc_checkin_cfg');
      if (rawCfg) data.checkinCfg = JSON.parse(rawCfg);
    } catch (e) { /* no saved check-in config yet, client falls back to defaults */ }
    try {
      const rawSvc = await getKVValue(c.provider_id, 'sc_service_menu');
      if (rawSvc) {
        const svc = JSON.parse(rawSvc);
        if (Array.isArray(svc)) data.services = svc.map(s => (s && s.name ? String(s.name).trim() : '')).filter(Boolean);
      }
    } catch (e) { /* no service menu published yet, client falls back to a generic list */ }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).json({
      ok: true,
      client: { id: c.id, name: c.name || '', email: c.email || '', data }
    });
  } catch (e) { console.error('[client-data] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
