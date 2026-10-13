// openInvoiceForEmail decides whether a locked-out provider is sent to her OWN open invoice or to a
// brand new subscription. Getting that backwards is not cosmetic: the generic payment link creates a
// SECOND Stripe customer on the same email, and lib/stripe-subs.js opens by describing how that ends
// (cancelling the duplicate stamps 'canceled' over the one she is paying for, and locks her out).
//
// lib/db.js imports @neondatabase/serverless, which is not installed in this scratch env (CLAUDE.md
// §3), so the module is loaded with that one import stubbed - the logic under test is the real file's
// text, unmodified. Stripe is stubbed through globalThis.fetch.
//
//   node scratchpad/test-open-invoice.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SRC = new URL('../slickchart-vercel/lib/stripe-subs.js', import.meta.url).pathname;
const OUT = join(process.env.TMPDIR || '/tmp', 'sc-stripe-subs-undertest.mjs');
let src = readFileSync(SRC, 'utf8');
const IMPORT = "import { sql } from './db.js';";
if (!src.includes(IMPORT)) { console.error('the db import moved; update this test'); process.exit(1); }
src = src.replace(IMPORT, "const sql = () => { throw new Error('db is not exercised by this test'); };");
mkdirSync(dirname(OUT), {recursive:true});
writeFileSync(OUT, src);
const { openInvoiceForEmail } = await import('file://' + OUT);

// stripeGet() no-ops without a key, so every lookup would return null and every case would "pass"
// for the wrong reason.
process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key';

const CUST = 'cus_TEST';
const HOSTED = 'https://invoice.stripe.com/i/acct_test/open_one';

// A tiny Stripe. `world` describes what this fake account holds.
function stub(world){
  globalThis.fetch = async (url) => {
    const u = String(url);
    const ok = (body) => ({ok:true, json: async () => body});
    if (world.networkError) throw new Error('socket hang up');
    if (u.includes('/v1/customers')) return ok({data: world.customers ?? [{id:CUST}]});
    if (u.includes('/v1/subscriptions')) return ok({data: world.subs ?? []});
    if (u.includes('/v1/invoices/')) {
      if (world.invoiceMissing) return {ok:false, json: async () => ({})};
      return ok(world.invoice);
    }
    return ok({});
  };
}

const CASES = [
  { name: 'past_due with an open invoice',
    world: {subs:[{id:'sub_1',status:'past_due',latest_invoice:'in_1'}],
            invoice:{id:'in_1',status:'open',hosted_invoice_url:HOSTED}},
    want: HOSTED, why: 'she tops up the subscription she already has' },

  { name: 'unpaid with an open invoice',
    world: {subs:[{id:'sub_1',status:'unpaid',latest_invoice:'in_1'}],
            invoice:{id:'in_1',status:'open',hosted_invoice_url:HOSTED}},
    want: HOSTED, why: 'Stripe gave up retrying but the invoice is still payable' },

  { name: 'latest_invoice came back expanded',
    world: {subs:[{id:'sub_1',status:'past_due',latest_invoice:{id:'in_1'}}],
            invoice:{id:'in_1',status:'open',hosted_invoice_url:HOSTED}},
    want: HOSTED, why: 'Stripe may expand the object instead of sending an id' },

  { name: 'past_due but the invoice is already paid',
    world: {subs:[{id:'sub_1',status:'past_due',latest_invoice:'in_1'}],
            invoice:{id:'in_1',status:'paid',hosted_invoice_url:HOSTED}},
    want: null, why: 'a paid invoice is a dead end — fall back to checkout' },

  { name: 'past_due but the invoice was voided',
    world: {subs:[{id:'sub_1',status:'past_due',latest_invoice:'in_1'}],
            invoice:{id:'in_1',status:'void',hosted_invoice_url:HOSTED}},
    want: null, why: 'nothing to pay there' },

  { name: 'subscription is active',
    world: {subs:[{id:'sub_1',status:'active',latest_invoice:'in_1'}],
            invoice:{id:'in_1',status:'open',hosted_invoice_url:HOSTED}},
    want: null, why: 'not locked out for billing; nothing owed' },

  { name: 'subscription was cancelled outright',
    world: {subs:[{id:'sub_1',status:'canceled'}]},
    want: null, why: 'genuinely ended — a new subscription IS the right answer' },

  { name: 'no subscriptions at all',
    world: {subs:[]}, want: null, why: 'new customer; generic checkout link' },

  { name: 'no customer with that email',
    world: {customers:[], subs:[]}, want: null, why: 'nothing to look up' },

  { name: 'invoice fetch fails',
    world: {subs:[{id:'sub_1',status:'past_due',latest_invoice:'in_1'}], invoiceMissing:true},
    want: null, why: 'degrade to the checkout link rather than a broken link' },

  { name: 'Stripe is unreachable',
    world: {networkError:true}, want: null, why: 'must never throw — login would 500' },

  { name: 'no STRIPE_SECRET_KEY configured',
    world: {subs:[{id:'sub_1',status:'past_due',latest_invoice:'in_1'}],
            invoice:{id:'in_1',status:'open',hosted_invoice_url:HOSTED}},
    noKey: true, want: null, why: 'no key, no lookup — and still no throw' },
];

let bad = 0;
for (const c of CASES) {
  stub(c.world);
  const key = process.env.STRIPE_SECRET_KEY;
  if (c.noKey) delete process.env.STRIPE_SECRET_KEY;
  let got, threw = null;
  try { got = await openInvoiceForEmail('jaimie@example.com'); }
  catch (e) { threw = String(e && e.message || e); }
  if (c.noKey) process.env.STRIPE_SECRET_KEY = key;
  const url = got && got.url || null;
  const ok = !threw && url === c.want && (!c.want || got.label === 'Pay now');
  if (!ok) bad++;
  const outcome = threw ? ('THREW ' + threw)
                : url   ? ('-> her invoice ("' + (got.label || '') + '")')
                        : '-> null, caller uses the checkout link';
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + c.name.padEnd(34) + outcome.padEnd(42) + c.why);
}

// The one that would do real damage, stated as its own assertion.
stub({subs:[{id:'sub_1',status:'past_due',latest_invoice:'in_1'}],
      invoice:{id:'in_1',status:'open',hosted_invoice_url:HOSTED}});
const r = await openInvoiceForEmail('jaimie@example.com');
if (!r || r.url !== HOSTED) { console.log('\n  FAIL  a past-due provider would be sent to a NEW subscription'); bad++; }

console.log(bad ? '\n' + bad + ' case(s) wrong'
  : '\na past-due provider is sent to her own open invoice; everyone else falls back to\nthe ordinary checkout link, and Stripe being down never throws into the login path');
process.exit(bad ? 1 : 0);
