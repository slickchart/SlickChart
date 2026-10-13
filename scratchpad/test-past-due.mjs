// pastDueForEmail decides TWO things, and both can hurt a paying provider if they go wrong:
//
//   1. IS SHE LET IN. api/login.js grants grace while Stripe is retrying a failed card. Before this,
//      one bounced charge locked a provider out of her client list, her notes and her calendar on
//      day one, and she could not even reach billing, because billing is behind that login.
//   2. WHERE SHE PAYS. Her OWN open invoice, never the generic STRIPE_PAYMENT_LINK. The generic link
//      creates a SECOND Stripe customer on the same email, and lib/stripe-subs.js opens by describing
//      how that ends: cancelling the duplicate later stamps 'canceled' over the subscription she is
//      paying for, and locks her out.
//
// These come apart. If Stripe will not hand over the invoice, she must STILL be let in — the grace
// cannot hinge on a second lookup succeeding — she just gets pointed at the billing screen instead.
//
// lib/db.js imports @neondatabase/serverless, which is not installed in this scratch env (CLAUDE.md
// §3), so the module is loaded with that one import stubbed; the logic under test is the real file's
// text, unmodified. Stripe is stubbed through globalThis.fetch.
//
//   node scratchpad/test-past-due.mjs
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
const { pastDueForEmail } = await import('file://' + OUT);

// stripeGet() no-ops without a key, so every lookup would return null and most cases would "pass"
// for the wrong reason.
process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key';

const CUST = 'cus_TEST';
const HOSTED = 'https://invoice.stripe.com/i/acct_test/open_one';

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

const OPEN_INV = {id:'in_1', status:'open', hosted_invoice_url:HOSTED};

// letIn: is she allowed into the app? payTo: where the banner sends her ('' = the billing screen).
const CASES = [
  { name:'past_due, invoice open',        letIn:true,  payTo:HOSTED,
    world:{subs:[{id:'s',status:'past_due',latest_invoice:'in_1'}], invoice:OPEN_INV},
    why:'in, and straight to the invoice that takes a new card' },

  { name:'unpaid, invoice open',          letIn:true,  payTo:HOSTED,
    world:{subs:[{id:'s',status:'unpaid',latest_invoice:'in_1'}], invoice:OPEN_INV},
    why:'Stripe stopped retrying, the invoice is still payable' },

  { name:'latest_invoice expanded',       letIn:true,  payTo:HOSTED,
    world:{subs:[{id:'s',status:'past_due',latest_invoice:{id:'in_1'}}], invoice:OPEN_INV},
    why:'Stripe may send the object instead of an id' },

  { name:'past_due, invoice already paid',letIn:true,  payTo:'',
    world:{subs:[{id:'s',status:'past_due',latest_invoice:'in_1'}],
           invoice:{id:'in_1',status:'paid',hosted_invoice_url:HOSTED}},
    why:'still in; a paid invoice is a dead end so no link' },

  { name:'past_due, invoice voided',      letIn:true,  payTo:'',
    world:{subs:[{id:'s',status:'past_due',latest_invoice:'in_1'}],
           invoice:{id:'in_1',status:'void',hosted_invoice_url:HOSTED}},
    why:'still in; nothing to pay there' },

  { name:'past_due, invoice fetch fails', letIn:true,  payTo:'',
    world:{subs:[{id:'s',status:'past_due',latest_invoice:'in_1'}], invoiceMissing:true},
    why:'THE ONE THAT MATTERS: grace must not hinge on a second lookup' },

  { name:'past_due, no invoice on record',letIn:true,  payTo:'',
    world:{subs:[{id:'s',status:'past_due'}]},
    why:'still in' },

  { name:'active',                        letIn:false,
    world:{subs:[{id:'s',status:'active',latest_invoice:'in_1'}], invoice:OPEN_INV},
    why:'not behind; nothing to show her' },

  { name:'trialing',                      letIn:false,
    world:{subs:[{id:'s',status:'trialing'}]},
    why:'not behind' },

  { name:'canceled outright',             letIn:false,
    world:{subs:[{id:'s',status:'canceled'}]},
    why:'grace has ENDED — login refuses, checkout link is right' },

  { name:'no subscriptions',              letIn:false, world:{subs:[]},
    why:'never a customer' },

  { name:'no customer with that email',   letIn:false, world:{customers:[],subs:[]},
    why:'nothing to look up' },

  { name:'Stripe unreachable',            letIn:false, world:{networkError:true},
    why:'must never throw — login would 500' },

  { name:'no STRIPE_SECRET_KEY',          letIn:false, noKey:true,
    world:{subs:[{id:'s',status:'past_due',latest_invoice:'in_1'}], invoice:OPEN_INV},
    why:'no key, no lookup, and still no throw' },
];

let bad = 0;
for (const c of CASES) {
  stub(c.world);
  const key = process.env.STRIPE_SECRET_KEY;
  if (c.noKey) delete process.env.STRIPE_SECRET_KEY;
  let got, threw = null;
  try { got = await pastDueForEmail('jaimie@example.com'); }
  catch (e) { threw = String(e && e.message || e); }
  if (c.noKey) process.env.STRIPE_SECRET_KEY = key;

  const letIn = !!got;
  const payTo = (got && got.url) || '';
  const ok = !threw && letIn === c.letIn && (!c.letIn || payTo === c.payTo)
             && (!payTo || got.label === 'Update card');
  if (!ok) bad++;

  const outcome = threw ? ('THREW ' + threw)
                : !letIn ? 'not behind, no grace'
                : payTo  ? 'let in -> her invoice'
                         : 'let in -> billing screen';
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + c.name.padEnd(26) + outcome.padEnd(24) + c.why);
}

// The two failures that would do real damage, each stated on its own.
stub({subs:[{id:'s',status:'past_due',latest_invoice:'in_1'}], invoice:OPEN_INV});
const due = await pastDueForEmail('jaimie@example.com');
if (!due)            { console.log('\n  FAIL  a past-due provider would be locked out of her own account'); bad++; }
if (due && !due.url) { console.log('\n  FAIL  she would be sent somewhere other than her own invoice'); bad++; }

console.log(bad ? '\n' + bad + ' case(s) wrong'
  : '\na provider behind on payment is let in while Stripe retries, and sent to her OWN\n'
  + 'invoice; grace survives Stripe refusing the invoice, ends when Stripe cancels, and\n'
  + 'Stripe being down never throws into the login path');
process.exit(bad ? 1 : 0);
