// GET /api/collection-pdf  — provider-authed. Hands a signed-in provider with a live subscription the
// links to the printable Esthetician Collection PDFs (the same files sold on Etsy), in three styles.
//
// The files sit under an unguessable folder name that appears nowhere but here: the page never links
// to it, robots are told not to index it (vercel.json), and the app only learns the address from this
// endpoint after the caller's session and subscription are checked. It is not DRM — a provider can
// pass a link on, exactly as an Etsy buyer can pass on a download — it just keeps the files out of
// search engines and away from anyone who is not a signed-in subscriber.
import { sessionFromReq } from '../lib/auth.js';
import { sql, dbEnabled, getSubscription } from '../lib/db.js';

const DIR = '/assets/ec-9308d13917a6f75f4f385060/';
const FILES = [
  { style: 'neutral', label: 'Neutral', url: DIR + 'neutral.pdf' },
  { style: 'blush', label: 'Blush', url: DIR + 'blush.pdf' },
  { style: 'luxe', label: 'Luxe', url: DIR + 'luxe.pdf' }
];

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  let p = null;
  try { p = await sessionFromReq(req, dbEnabled() ? sql() : null); } catch (e) { p = null; }
  if (!p || !p.u) { res.status(401).json({ error: 'Please sign in to SlickChart to download these.' }); return; }
  // Same rule as signing in (api/login.js): only a paying account gets in when payment is required.
  // A provider who is behind on a payment is let in there with a banner, so she is let in here too.
  if ((process.env.REQUIRE_PAYMENT || '').toLowerCase() === 'true' && p.u !== 'owner') {
    const email = String(p.e || '').trim().toLowerCase();
    const founders = ['botanicalaestheticsbyashley@gmail.com']
      .concat(String(process.env.FOUNDER_EMAILS || '').toLowerCase().split(','))
      .map(s => s.trim()).filter(Boolean);
    if (!founders.includes(email)) {
      let sub = null;
      try { sub = email && dbEnabled() ? await getSubscription(email) : null; } catch (e) { sub = null; }
      const ok = !!(sub && ['active', 'trialing', 'past_due'].includes(sub.status));
      if (!ok) { res.status(402).json({ error: 'The printable collection comes with an active SlickChart subscription.' }); return; }
    }
  }
  res.status(200).json({ ok: true, files: FILES });
}
