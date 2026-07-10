// PUBLIC (no auth): a prospect submits a consult request through a provider's public link
// (slickchart.com/consult/<slug>). Resolves the slug to a provider and records a lead.
// Unauthenticated by design (it's a public contact form), so it's strictly validated,
// size-capped, and rate-limited by IP and by slug.
import { dbEnabled } from '../lib/db.js';
import { getProviderBySlug, addConsultRequest } from '../lib/consult.js';

// Best-effort in-memory burst limiter (per function instance; fails open) — same shape as
// /api/client-submit and /api/ai. Stops a script from flooding a provider's lead list.
const _hits = new Map();
function burstOk(key, limit, windowMs) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { _hits.set(key, arr); return false; }
  arr.push(now);
  _hits.set(key, arr);
  if (_hits.size > 5000) { for (const k of _hits.keys()) { if (k !== key) _hits.delete(k); if (_hits.size <= 4000) break; } }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const b = req.body || {};
  const slug = String(b.slug || '').toLowerCase();
  const name = String(b.name || '').trim().slice(0, 120);
  const email = String(b.email || '').trim().slice(0, 160);
  const phone = String(b.phone || '').trim().slice(0, 40);
  const message = String(b.message || '').trim().slice(0, 2000);
  if (!slug) { res.status(400).json({ error: 'Missing link.' }); return; }
  if (!name || !email || !/.+@.+\..+/.test(email)) { res.status(400).json({ error: 'Please add your name and a valid email.' }); return; }
  if (!message) { res.status(400).json({ error: 'Please tell them a little about what you’re looking for.' }); return; }

  // Prefer the platform-set real client IP (x-real-ip on Vercel); the leftmost X-Forwarded-For
  // entry is client-supplied and spoofable, so only fall back to it if x-real-ip is absent.
  const ip = String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim() || 'ip';
  if (!burstOk('cr:' + ip, 8, 60000) || !burstOk('crslug:' + slug, 40, 60000)) {
    res.status(429).json({ error: 'Too many requests — please try again in a minute.' });
    return;
  }
  try {
    const prov = await getProviderBySlug(slug);
    if (!prov) { res.status(404).json({ error: 'This consult link is not active.' }); return; }
    await addConsultRequest(prov.id, { name, email, phone, message });
    res.status(200).json({ ok: true });
  } catch (e) { try{console.error('[consult-request]', e && e.stack || e);}catch(_){} res.status(500).json({ error: 'Something went wrong — please try again.' }); }
}
