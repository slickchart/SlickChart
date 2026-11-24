// 2026-11-17: a new provider gets her "create your account" email the moment Stripe checkout completes
// (lib/setup-email.js), not only after the 3 h rescue wait. Once ever, only with no account yet, never
// to a founder or an unsubscribed address, and a failed send never costs Stripe its 200.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel', import.meta.url).pathname;
process.env.DATABASE_URL = 'postgres://x'; process.env.FOUNDER_EMAILS = 'ashley@x.com'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.RESEND_API_KEY = 're_test'; process.env.APP_ORIGIN = 'https://slickchart.app';
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.APNS_KEY_P8; delete process.env.VAPID_PUBLIC_KEY;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const mails = []; let failMail = false;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com/emails')) {
    const b = JSON.parse(init.body); if (failMail && !/ashley@x\.com/.test(JSON.stringify(b.to))) return { ok: false, status: 500, text: async () => 'down' };
    mails.push(b); return { ok: true, json: async () => ({ id: 'm' + mails.length }) };
  }
  return { ok: true, json: async () => ({}), text: async () => '' };
};
const claims = new Set(); const accounts = new Set(['has@acct.com', 'ashley@x.com']); const made = new Set(); const optout = new Set(['no@thanks.com']);
globalThis.__sqlHandler = (t, v) => {
  if (/UPDATE subscriptions SET paid_notified_at/.test(t)) return [{ email: v[0] }];
  if (/SELECT 1 FROM providers WHERE lower\(email\)/.test(t)) return accounts.has(v[0]) ? [{ '?column?': 1 }] : [];
  // Since 2026-11-23 the webhook makes the account (lib/account-setup.js): a waiting row per payer.
  if (/SELECT id, email, name, coalesce\(needs_setup/.test(t) || /SELECT id, email, coalesce\(needs_setup/.test(t)) return accounts.has(v[0]) ? [{ id: 'p_has', email: v[0], name: '', needs_setup: false }] : (made.has(v[0]) ? [{ id: 'p_' + v[0], email: v[0], name: '', needs_setup: true }] : []);
  if (/INSERT INTO providers/.test(t)) { made.add(v[1]); return [{ id: v[0] }]; }
  if (/SELECT 1 FROM nurture_optout/.test(t)) return optout.has(v[0]) ? [{}] : [];
  if (/INSERT INTO nurture_sends/.test(t) && /'setup'/.test(t)) { const k = v[0]; if (claims.has(k)) return []; claims.add(k); return [{ email: k }]; }
  if (/DELETE FROM nurture_sends/.test(t) && /'setup'/.test(t)) { claims.delete(v[0]); return []; }
  if (/count\(\*\)::int AS n FROM subscriptions/.test(t)) return [{ n: 3 }];
  return [];
};
const { default: handler } = await import(APP + '/api/stripe-webhook.js');
const crypto = await import('crypto'); const { Readable } = await import('stream');
async function checkout(email) {
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer_details: { email }, customer: 'cus_1', subscription: 'sub_1' } } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(ts + '.' + body).digest('hex');
  const req = Readable.from([Buffer.from(body)]); req.method = 'POST'; req.headers = { 'stripe-signature': `t=${ts},v1=${sig}` };
  let status = 0; const res = { status(s) { status = s; return this; }, json() { return this; }, setHeader() {} };
  await handler(req, res); return status;
}
const toHer = e => mails.filter(m => JSON.stringify(m.to).includes(e));

let s = await checkout('Jenna.New@Gmail.com');
const m = toHer('jenna.new@gmail.com');
ok(s === 200, 'webhook answers 200');
ok(m.length === 1, 'the new provider gets exactly one email right away (' + m.length + ')');
ok(m[0] && /Get set up/i.test(m[0].subject), 'subject says Get set up (' + (m[0] && m[0].subject) + ')');
ok(made.has('jenna.new@gmail.com'), 'paying made her account (waiting for a password)');
ok(m[0] && /https:\/\/slickchart\.app\/slickchart\?setup=[A-Za-z0-9_-]{20,}/.test(m[0].html) && /slickchart\?setup=/.test(m[0].text) && !/signup=1/.test(m[0].html), 'its button is the one-tap set-up link');
ok(m[0] && !/That is on me|never made/.test(m[0].text), 'the right-away email does not apologise as if something went wrong');
s = await checkout('jenna.new@gmail.com');
ok(s === 200 && toHer('jenna.new@gmail.com').length === 1, 'a repeat event (retry/renewal) does not email her again');
await checkout('has@acct.com'); ok(toHer('has@acct.com').length === 0, 'someone who already has an account is not emailed');
await checkout('ashley@x.com'); ok(!mails.some(x => /Get set up|create your account/i.test(x.subject) && JSON.stringify(x.to).includes('ashley@x.com')), 'a founder address is not sent a setup email');
await checkout('no@thanks.com'); ok(toHer('no@thanks.com').length === 0, 'an unsubscribed address is not emailed');
failMail = true; s = await checkout('flaky@mail.com'); failMail = false;
ok(s === 200 && toHer('flaky@mail.com').length === 0 && !claims.has('flaky@mail.com'), 'a failed send still answers 200 and releases the claim so it can go later');
s = await checkout('flaky@mail.com'); ok(toHer('flaky@mail.com').length === 1, 'the next delivery sends it');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
