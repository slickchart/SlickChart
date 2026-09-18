// PUBLIC (no auth): GET /api/book-slots?slug=<slug>&date=YYYY-MM-DD
// The free times on one day, for a provider whose booking page is in instant mode.
//
// ISOLATION: returns ONLY a list of times that are free. Never what she is booked with, never who
// with, never how many. A caller learns exactly what her page already shows.
import { dbEnabled } from '../lib/db.js';
import { getProviderBySlug } from '../lib/consult.js';
import { getBookingConfig, getHours, openSlots, isoDay } from '../lib/booking.js';

const _hits = new Map();
function burstOk(key, limit, windowMs) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { _hits.set(key, arr); return false; }
  arr.push(now); _hits.set(key, arr);
  if (_hits.size > 5000) { for (const k of _hits.keys()) { if (k !== key) _hits.delete(k); if (_hits.size <= 4000) break; } }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, slots: [] }); return; }
  const slug = String((req.query && req.query.slug) || '').toLowerCase();
  const date = isoDay(req.query && req.query.date);
  if (!slug || !date) { res.status(400).json({ error: 'Bad request' }); return; }
  const ip = String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim() || 'ip';
  if (!burstOk('bs:' + ip, 60, 60000)) { res.status(429).json({ error: 'Slow down a moment.' }); return; }
  try {
    const prov = await getProviderBySlug(slug);
    if (!prov) { res.status(404).json({ error: 'Not found' }); return; }
    const cfg = await getBookingConfig(prov.id);
    if (!cfg.on || cfg.mode !== 'instant') { res.status(200).json({ ok: true, mode: cfg.on ? cfg.mode : 'off', slots: [] }); return; }
    const hours = await getHours(prov.id);
    const slots = await openSlots(prov.id, date, cfg, hours);
    res.setHeader('Cache-Control', 'no-store');
    // null = we could not see her whole calendar. Say so, so the page asks for a request rather
    // than showing times that might already be taken.
    if (slots === null) { res.status(200).json({ ok: true, mode: 'request', unknown: true, slots: [] }); return; }
    res.status(200).json({ ok: true, mode: 'instant', slots });
  } catch (e) {
    console.error('[book-slots] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
