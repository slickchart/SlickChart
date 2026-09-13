// POST /api/build-access  { email }  ->  always the same generic success
//
// "I bought this and lost the email." Sends the buyer their access links again, to the address on the
// receipt and nowhere else.
//
// Follows the same rules as the other passwordless flows (CLAUDE.md §0.4): the response is IDENTICAL
// whether or not that email ever bought, so this can't be used to probe the customer list; the links
// only ever go to the address Stripe has, never back in the HTTP response; and it's rate-limited per
// IP and per email so it can't be turned into a mail cannon.
//
// Stripe stays the source of truth, exactly as it is for the success redirect — we ask it which
// checkout sessions this email paid for rather than trusting a local table. That also means this
// works for purchases made before build_purchases existed. Anything it finds is backfilled into that
// table (silently — see recordBuildSale's notify flag) so the stats catch up too.
import { recordBuildSale, sendAccessEmail } from '../lib/build-sales.js';

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

async function stripeGet(key, path) {
  const r = await fetch('https://api.stripe.com/v1/' + path, { headers: { Authorization: 'Bearer ' + key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('stripe ' + r.status + ' ' + ((j && j.error && j.error.message) || ''));
  return j;
}

// Every paid roadmap checkout for this email. customer_creation:'always' on the checkout means each
// buyer has a Stripe customer, so email → customers → sessions is the reliable route.
async function paidSessionsFor(key, email) {
  const out = [];
  const customers = await stripeGet(key, 'customers?limit=20&email=' + encodeURIComponent(email));
  for (const c of (customers.data || [])) {
    let sessions;
    try { sessions = await stripeGet(key, 'checkout/sessions?limit=100&customer=' + encodeURIComponent(c.id)); }
    catch (e) { continue; }
    for (const s of (sessions.data || [])) {
      if (String(s.payment_status || '') !== 'paid') continue;
      // Same discriminator the webhook uses: tagged as the roadmap, or a one-off payment (a
      // SlickChart subscription checkout is always mode='subscription' and must not match here).
      const isBuild = String((s.metadata && s.metadata.product) || '') === 'build' || String(s.mode || '') === 'payment';
      if (!isBuild) continue;
      out.push(s);
    }
  }
  // Newest first, so a buyer who somehow paid twice gets their most recent access page at the top.
  out.sort((a, b) => (b.created || 0) - (a.created || 0));
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  // Identical whether or not the email bought. Never branch this.
  const generic = { ok: true, message: 'If that email bought Build Your Own App, your access links are on their way. Check your inbox (and spam).' };
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) { res.status(200).json(generic); return; }

    const realIp = String(req.headers['x-real-ip'] || '').trim();
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = realIp || xff || (req.socket && req.socket.remoteAddress) || 'anon';
    if (!burstOk('ip:' + ip, 6, 60000)) { res.status(200).json(generic); return; }
    if (!burstOk('em:' + email, 1, 45000)) { res.status(200).json(generic); return; }

    const key = process.env.STRIPE_SECRET_KEY || '';
    const videoUrl = String(process.env.BUILD_VIDEO_URL || '').trim();
    const artifactUrl = String(process.env.BUILD_ARTIFACT_URL || '').trim();
    // Missing config is our problem, not theirs, and saying so here would leak whether they bought.
    if (!key || !videoUrl || !artifactUrl) {
      console.error('[build-access] not configured: stripe=' + !!key + ' video=' + !!videoUrl + ' artifact=' + !!artifactUrl);
      res.status(200).json(generic);
      return;
    }

    let sessions = [];
    try { sessions = await paidSessionsFor(key, email); }
    catch (e) { console.error('[build-access] stripe lookup failed:', e && e.message || e); res.status(200).json(generic); return; }

    if (sessions.length) {
      const s = sessions[0];
      // Send to the address ON THE RECEIPT, not the one typed in, so a typo'd or guessed address
      // can never be used to have someone else's links delivered to it.
      const onFile = String((s.customer_details && s.customer_details.email) || s.customer_email || '').trim();
      const to = onFile || email;
      try { await sendAccessEmail(to, s.id, { videoUrl, artifactUrl }); }
      catch (e) { console.error('[build-access] resend failed:', e && e.message || e); }
      // Backfill every purchase we found, silently — this is an old sale, not a new one.
      for (const found of sessions) {
        try {
          await recordBuildSale({
            sessionId: found.id,
            email: String((found.customer_details && found.customer_details.email) || found.customer_email || '').trim(),
            amountCents: Number.isFinite(found.amount_total) ? found.amount_total : null,
            currency: found.currency || null,
            notify: false
          });
        } catch (e) {}
      }
    }
    res.status(200).json(generic);
  } catch (e) {
    console.error('[build-access] failed:', e && e.stack || e);
    res.status(200).json(generic);
  }
}
