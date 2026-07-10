// Provider-authed: GET returns the provider's current consult slug (plus a suggested slug
// derived from their business name if none is set yet); PUT { slug } claims/updates it.
import { verifyToken } from '../lib/auth.js';
import { dbEnabled, getKVValue } from '../lib/db.js';
import { getSlugForProvider, claimSlug, slugify } from '../lib/consult.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const c = (s && t) ? verifyToken(t, s) : null;
  return c && c.u;
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const provider = providerId(req);
  if (!provider) { res.status(401).json({ error: 'Not signed in' }); return; }
  try {
    if (req.method === 'GET') {
      const slug = await getSlugForProvider(provider);
      let suggestion = '';
      if (!slug) {
        try { const raw = await getKVValue(provider, 'sc_bizinfo'); const biz = raw ? JSON.parse(raw) : {}; suggestion = slugify(biz && (biz.name || biz.ownerName) || ''); } catch (e) { suggestion = ''; }
      }
      res.status(200).json({ ok: true, slug, suggestion });
      return;
    }
    if (req.method === 'PUT') {
      const desired = (req.body && req.body.slug) || '';
      const r = await claimSlug(provider, desired);
      if (!r.ok) { res.status(409).json({ error: r.error }); return; }
      res.status(200).json({ ok: true, slug: r.slug });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { try{console.error('[consult-slug]', e && e.stack || e);}catch(_){} res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
}
