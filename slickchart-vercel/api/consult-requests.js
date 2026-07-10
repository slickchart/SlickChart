// Provider-authed: list the consult requests submitted through this provider's public link.
import { verifyToken } from '../lib/auth.js';
import { dbEnabled } from '../lib/db.js';
import { listConsultRequests } from '../lib/consult.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const c = (s && t) ? verifyToken(t, s) : null;
  return c && c.u;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, requests: [] }); return; }
  const provider = providerId(req);
  if (!provider) { res.status(401).json({ error: 'Not signed in' }); return; }
  try {
    const requests = await listConsultRequests(provider);
    res.status(200).json({ ok: true, requests });
  } catch (e) { try{console.error('[consult-requests]', e && e.stack || e);}catch(_){} res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
}
