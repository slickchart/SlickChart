// Referral metrics progress (2026-11-11): MRR fills a blank price from Stripe and a provider still on her
// free trial is counted apart, not as paid. Real SQL (PGlite), Stripe stubbed.
//   PGLITE=<dir with @electric-sql/pglite> node scratchpad/test-referral-mrr.mjs
import fs from 'fs'; import os from 'os'; import path from 'path'; import { pathToFileURL } from 'url';
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../slickchart-vercel');
const { PGlite } = await import(pathToFileURL(path.join(process.env.PGLITE || '/tmp/claude-0/pgl', 'node_modules/@electric-sql/pglite/dist/index.js')));
const db = new PGlite(); globalThis.__db = db;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refmrr-')); fs.mkdirSync(dir + '/lib');
fs.writeFileSync(dir + '/package.json', '{"type":"module"}');
for (const f of ['referral.js', 'founder-settings.js', 'stripe-safe.js']) fs.copyFileSync(SRC + '/lib/' + f, dir + '/lib/' + f);
fs.writeFileSync(dir + '/lib/db.js', `export function dbEnabled(){return true;} export async function ensureProvidersTable(){}
export function sql(){ return async (strs, ...v) => { let t=''; strs.forEach((s,i)=>{t+=s+(i<v.length?'$'+(i+1):'');}); return (await globalThis.__db.query(t, v)).rows; }; }`);
process.env.STRIPE_SECRET_KEY = 'sk_test';
const calls = [];
globalThis.fetch = async (url) => { calls.push(String(url)); const id = String(url).split('/subscriptions/')[1];
  if (id === 'sub_old') return { ok: true, json: async () => ({ items: { data: [{ quantity: 1, price: { unit_amount: 1000, recurring: { interval: 'month' } } }] } }) };
  return { ok: false, status: 404, json: async () => ({ error: { message: 'No such subscription' } }) }; };
await db.exec(`CREATE TABLE providers (id text PRIMARY KEY, email text, name text);
CREATE TABLE subscriptions (email text PRIMARY KEY, stripe_customer_id text, stripe_subscription_id text, status text, plan_amount int, plan_interval text, updated_at timestamptz);
CREATE TABLE trial_outcomes (sub_id text PRIMARY KEY, email text, outcome text);
INSERT INTO subscriptions VALUES ('a@x.com','c1','sub_a','active',1700,'month',now()),('y@x.com','c2','sub_y','active',17000,'year',now()),
 ('old@x.com','c3','sub_old','active',NULL,NULL,now()),('gone@x.com','c4','sub_gone','active',NULL,NULL,now()),
 ('trial@x.com','c5','sub_t','active',1700,'month',now()),('off@x.com','c6','sub_o','canceled',1700,'month',now());
INSERT INTO trial_outcomes VALUES ('sub_t','trial@x.com','trialing'),('sub_a','a@x.com','converted');`);
const { referralMetrics } = await import(pathToFileURL(dir + '/lib/referral.js'));
const q = (await import(pathToFileURL(dir + '/lib/db.js'))).sql();
const m = await referralMetrics(q); const p = m.progress;
let fail = 0; const ok = (c, n, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' :: ' + d)); if (!c) fail++; };
ok(p.paidTotal === 4 && p.onTrialNow === 1, 'a provider on her free trial is counted apart, not as paid', JSON.stringify(p));
ok(p.mrrCents === 1700 + 1417 + 1000, 'MRR: monthly + yearly/12 + a blank price filled from Stripe', p.mrrCents);
ok(p.mrrUnknown === 1, 'a price Stripe could not give is counted as unknown, not hidden', p.mrrUnknown);
const row = (await db.query("SELECT plan_amount, plan_interval FROM subscriptions WHERE email='old@x.com'")).rows[0];
ok(row.plan_amount === 1000 && row.plan_interval === 'month', 'the blank price is saved so the next read needs no Stripe call', JSON.stringify(row));
const before = calls.length; await referralMetrics(q);
ok(calls.filter(u => /sub_old/.test(u)).length === 1 && calls.length - before === 1, 'only still-blank prices are asked of Stripe again', calls.slice(before).join(' '));
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
