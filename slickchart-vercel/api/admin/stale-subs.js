// GET /api/admin/stale-subs — FOUNDER-ONLY, READ-ONLY. Lists subscription rows that look like they
// were created by a Build Your Own App roadmap sale rather than a real SlickChart subscription.
//
// Why these matter, beyond tidiness:
//   1. `subscriptions` is the source of truth for who is allowed a paid account, so a stray 'active'
//      row is a free subscription nobody paid for.
//   2. Until now it also silenced that person's signup alert, because api/signup.js skipped the
//      founder email and push whenever hasActiveSubscription() was true. That is fixed, but the rows
//      are still there and still granting access.
//
// The signature: a roadmap purchase is a one-time Stripe payment (mode='payment'), so it has NO
// stripe_subscription_id. A genuine subscriber always has one. Combine that with "this email also
// appears in build_purchases" and the match is about as tight as it gets without reading Stripe.
//
// This endpoint only SELECTs. Nothing here deletes, downgrades or modifies a billing row — that is
// Ashley's call to make with the list in front of her, not something to do on her behalf.
import { dbEnabled, sql, ensureProvidersTable, ensureBuildPurchasesTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }
function mask(e) {
  const s = String(e || ''); const at = s.indexOf('@');
  if (at < 1) return s;
  return s.slice(0, Math.min(3, at)) + '…' + s.slice(at);
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(500).json({ error: 'No database configured.' }); return; }
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && tok ? verifyToken(tok, secret) : null;
  if (!payload || !payload.u) { res.status(401).json({ error: 'Not logged in.' }); return; }
  try { if (payload.sid && !(await isSessionValid(sql(), payload.sid))) { res.status(401).json({ error: 'Session expired.' }); return; } } catch (e) {}
  // Owner-only, resolved from the VERIFIED token's email — never from anything in the request.
  const email = norm(payload.e);
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '')
    .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!email || !founders.includes(email)) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }

  try {
    await ensureProvidersTable();
    await ensureBuildPurchasesTable();
    const q = sql();

    // Roadmap buyers carrying a subscription row with no Stripe subscription behind it.
    const fromRoadmap = await q`
      SELECT s.email, s.status, s.plan_amount, s.updated_at,
             (SELECT count(*)::int FROM providers p WHERE lower(p.email) = lower(s.email)) AS has_account
        FROM subscriptions s
       WHERE s.stripe_subscription_id IS NULL
         AND EXISTS (SELECT 1 FROM build_purchases b WHERE lower(b.email) = lower(s.email))
       ORDER BY s.updated_at DESC NULLS LAST
       LIMIT 200`;

    // Anything else active with no Stripe subscription behind it. Not necessarily wrong (a manual
    // comp, an old import), but worth Ashley's eyes since it grants the same access.
    const otherNoSubId = await q`
      SELECT s.email, s.status, s.plan_amount, s.updated_at,
             (SELECT count(*)::int FROM providers p WHERE lower(p.email) = lower(s.email)) AS has_account
        FROM subscriptions s
       WHERE s.stripe_subscription_id IS NULL
         AND s.status IN ('active','trialing')
         AND NOT EXISTS (SELECT 1 FROM build_purchases b WHERE lower(b.email) = lower(s.email))
       ORDER BY s.updated_at DESC NULLS LAST
       LIMIT 200`;

    const shape = r => ({
      email: mask(r.email),
      status: r.status,
      planAmount: r.plan_amount,
      updatedAt: r.updated_at,
      hasSlickChartAccount: !!r.has_account,
      // Before today's fix this row is what swallowed their signup alert.
      wouldHaveSilencedSignup: r.status === 'active' || r.status === 'trialing'
    });

    const roadmap = (fromRoadmap || []).map(shape);
    const other = (otherNoSubId || []).map(shape);
    const silenced = roadmap.filter(r => r.wouldHaveSilencedSignup).length;

    let message;
    if (!roadmap.length && !other.length) {
      message = 'Nothing to clean up. No subscription row looks like it came from a roadmap sale, so that was not what swallowed your signup alerts.';
    } else {
      message = roadmap.length + ' roadmap buyer' + (roadmap.length === 1 ? '' : 's') + ' also carry a subscription row with no Stripe subscription behind it'
        + (silenced ? ', and ' + silenced + ' of those read as active — which is exactly what was silencing their signup alerts, and is giving them a paid account they did not pay for' : '')
        + '.' + (other.length ? ' Plus ' + other.length + ' other active row' + (other.length === 1 ? '' : 's') + ' with no Stripe subscription — check those are deliberate.' : '');
    }

    res.status(200).json({ ok: true, roadmap, other, silenced, message, readOnly: true });
  } catch (e) {
    console.error('[admin/stale-subs] failed:', e && e.message || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
