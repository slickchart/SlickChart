// Paying MAKES the account (2026-11-23). Ashley: "make sure they instantly are able to create an
// account when they pay and its as easy as possible for them. they should get the 'get set up' email
// right away".
//
// Until now paying (Stripe) and creating the account (api/signup.js) were two separate steps, and since
// the 2026-11-07 price change the new payment links ended on Stripe's own "thanks" page with no way back
// into SlickChart. So the provider paid, closed that page, and had no account: 5 people in 30 days,
// several of them trying Sign in up to 6 times with a password that had never been set.
//
// Now the Stripe webhook makes the provider row the moment checkout completes, marked `needs_setup`
// (no password she knows yet: pass_hash is a random one nobody has). Her "Get set up" email carries a
// one-time link (/slickchart?setup=<token>) that opens a "pick a password" screen and signs her in.
// Coming back from Stripe (/slickchart?paid=<checkout session id>) does the same without the email.
//
// Rules this keeps:
//   - Identity only ever from something she holds: the token emailed to the address she paid with, or
//     the Stripe checkout session id Stripe itself redirected her with (checked against Stripe, must be
//     complete, a subscription, and recent). Never from an email typed into a request.
//   - A `needs_setup` account has never been signed in to and holds no data. It is the same thing as
//     "paid but no account" everywhere that question is asked (orphans, rescue emails, sign-up), via
//     READY_SQL / isReadyAccount below.
//   - Never throws to a caller that must not fail (the webhook): ensurePaidAccount returns null.
import crypto from 'crypto';
import { hashPassword, makeToken } from './auth.js';
import { trustedOrigin } from './email.js';

export const SETUP_TOKEN_DAYS = 14;

// The account is created by the webhook; the column is added by ensureProvidersTable (lib/db.js).
export async function ensureNeedsSetupColumn(q) {
  await q`ALTER TABLE providers ADD COLUMN IF NOT EXISTS needs_setup boolean DEFAULT false`;
}

// Does this address have an account she can sign in to (not one still waiting for its password)?
export async function hasReadyAccount(q, email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return false;
  const r = await q`SELECT 1 FROM providers WHERE lower(email) = ${em} AND NOT coalesce(needs_setup, false) LIMIT 1`;
  return r.length > 0;
}

// Make (or find) the account for someone who just paid. Returns { id, email, needsSetup, created } or
// null. Founders are never made this way (they have their own accounts).
export async function ensurePaidAccount(q, rawEmail, rawName) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (founders.includes(email)) return null;
  const name = String(rawName || '').trim().slice(0, 120);
  try {
    await ensureNeedsSetupColumn(q);
    const found = await q`SELECT id, email, name, coalesce(needs_setup, false) AS needs_setup FROM providers WHERE lower(email) = ${email} LIMIT 1`;
    if (found.length) {
      if (found[0].needs_setup && name && !found[0].name) { try { await q`UPDATE providers SET name = ${name} WHERE id = ${found[0].id} AND coalesce(needs_setup, false)`; } catch (e) {} }
      return { id: found[0].id, email: found[0].email, needsSetup: !!found[0].needs_setup, created: false };
    }
    const id = 'p_' + crypto.randomBytes(8).toString('hex');
    // A random password nobody knows, so the row is valid and Sign in can never match it.
    const ins = await q`INSERT INTO providers (id, email, name, pass_hash, verified, needs_setup)
      VALUES (${id}, ${email}, ${name}, ${hashPassword(crypto.randomBytes(32).toString('hex'))}, false, true)
      ON CONFLICT (email) DO NOTHING RETURNING id`;
    if (ins.length) return { id, email, needsSetup: true, created: true };
    const again = await q`SELECT id, email, coalesce(needs_setup, false) AS needs_setup FROM providers WHERE lower(email) = ${email} LIMIT 1`;
    return again.length ? { id: again[0].id, email: again[0].email, needsSetup: !!again[0].needs_setup, created: false } : null;
  } catch (e) {
    console.error('[account-setup] could not make the account for a payment:', (e && e.message) || e);
    return null;
  }
}

// A fresh one-time "pick your password" token for a waiting account. `via` is 'email' (it went to the
// address on file, so using it proves she owns that address) or 'stripe' (handed back after checkout).
export async function issueSetupToken(q, providerId, via = 'email') {
  try { await q`DELETE FROM auth_tokens WHERE provider_id = ${providerId} AND kind = 'setup' AND expires_at < now()`; } catch (e) {}
  const token = makeToken();
  await q`INSERT INTO auth_tokens (token, provider_id, kind, expires_at, data)
    VALUES (${token}, ${providerId}, 'setup', now() + (${SETUP_TOKEN_DAYS} * interval '1 day'), ${via === 'stripe' ? 'stripe' : 'email'})`;
  return token;
}

export function setupTokenLink(token) {
  return trustedOrigin() + '/slickchart?setup=' + encodeURIComponent(token);
}

// The link for her "Get set up" email: makes the account if the payment has none yet. Returns
// { link, ready:false } for a waiting account, { link:null, ready:true } when she already has a real
// account, or null on failure (callers fall back to the old Create-account link).
export async function setupLinkForEmail(q, email, name) {
  const acct = await ensurePaidAccount(q, email, name);
  if (!acct) return null;
  if (!acct.needsSetup) return { link: null, ready: true };
  try { return { link: setupTokenLink(await issueSetupToken(q, acct.id, 'email')), ready: false, id: acct.id }; }
  catch (e) { console.error('[account-setup] token failed:', (e && e.message) || e); return null; }
}

// Look a setup token up. Returns { providerId, email, name, via } or null.
export async function readSetupToken(q, token) {
  const t = String(token || '');
  if (!t || t.length > 200) return null;
  const r = await q`SELECT a.provider_id, a.data, p.email, p.name, coalesce(p.needs_setup, false) AS needs_setup
    FROM auth_tokens a JOIN providers p ON p.id = a.provider_id
    WHERE a.token = ${t} AND a.kind = 'setup' AND a.expires_at > now() LIMIT 1`;
  if (!r.length) return null;
  return { providerId: r[0].provider_id, email: r[0].email, name: r[0].name || '', via: r[0].data === 'stripe' ? 'stripe' : 'email', needsSetup: !!r[0].needs_setup };
}

// Stripe checkout session -> who paid. Checked against Stripe itself: complete, a subscription (never the
// one-off Build sale), and recent. Returns { email, name, customerId, subscriptionId } or null.
export async function paidCheckoutSession(sessionId, { maxAgeHours = 72 } = {}) {
  const id = String(sessionId || '');
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(id)) return null;
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return null;
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) return null;
    const s = await r.json();
    if (!s || s.status !== 'complete' || s.mode !== 'subscription') return null;
    if (String((s.metadata && s.metadata.product) || '') === 'build') return null;
    if (!s.created || (Date.now() / 1000 - s.created) > maxAgeHours * 3600) return null;
    const email = String((s.customer_details && s.customer_details.email) || s.customer_email || '').trim().toLowerCase();
    if (!email) return null;
    const name = String((s.customer_details && (s.customer_details.individual_name || s.customer_details.name)) || '').trim();
    return { email, name, customerId: s.customer || null, subscriptionId: s.subscription || null };
  } catch (e) { return null; }
}
