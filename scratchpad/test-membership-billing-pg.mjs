// Server membership billing (2026-11-20) against a real PostgreSQL 16 with a fake Square:
//   * the server's rules match the app's own _pkMemState (extracted from slickchart.html),
//   * report-only charges nobody, lists initials only, and alerts Ashley once a day,
//   * live charges each due membership ONCE, with that account's own token, inside her hours,
//   * a decline is retried only after the retry wait, with a fresh Square key,
//   * the device endpoint and the job share one claim: a period is never charged twice, even at once,
//   * accounts never see or touch each other's rows.
import { execFileSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path'; import vm from 'vm';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const APP = path.join(HERE, '..', 'slickchart-vercel');
const src = fs.readFileSync(path.join(HERE, 'sweep-dup-server-pg.mjs'), 'utf8');
const PGBIN = '/usr/lib/postgresql/16/bin';
if (!fs.existsSync(PGBIN)) { console.log('SKIP: no PostgreSQL 16'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-')), sock = fs.mkdtempSync(path.join(os.tmpdir(), 'mbsock-'));
const PORT = '55497', asRoot = process.getuid() === 0, USER = asRoot ? 'pgtest' : os.userInfo().username;
const sh = c => execFileSync('/bin/sh', ['-c', c], { encoding: 'utf8' });
const pg = c => sh(asRoot ? "su " + USER + " -c '" + c.replace(/'/g, "'\\''") + "'" : c);
if (asRoot) { try { sh('id ' + USER); } catch (e) { sh('useradd -m ' + USER); } sh('chown -R ' + USER + ' ' + root + ' ' + sock + ' && chmod 777 ' + sock); }
let started = false;
process.on('exit', () => { if (started) { try { pg(PGBIN + '/pg_ctl -D ' + root + '/data stop -m immediate'); } catch (e) {} } });
pg(PGBIN + '/initdb -D ' + root + '/data -U ' + USER + ' --auth=trust >/dev/null');
pg(PGBIN + "/pg_ctl -D " + root + "/data -o '-k " + sock + " -p " + PORT + " -c listen_addresses=' -l " + root + "/log start -w >/dev/null");
started = true;
const stub = src.slice(src.indexOf('const DBSTUB = `') + 16, src.indexOf('`;\nconst AUTHSTUB')).replace(/\$\{PGBIN\}/g, PGBIN).replace(/\$\{sock\}/g, sock).replace(/\$\{PORT\}/g, PORT).replace(/\$\{USER\}/g, USER).replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
for (const d of ['lib', 'api']) fs.mkdirSync(path.join(root, d), { recursive: true });
fs.writeFileSync(path.join(root, 'lib', 'db.js'), stub);
for (const f of ['perks-billing.js', 'founder-settings.js']) fs.copyFileSync(path.join(APP, 'lib', f), path.join(root, 'lib', f));
for (const f of ['cron-memberships.js', 'membership-charges.js']) fs.copyFileSync(path.join(APP, 'api', f), path.join(root, 'api', f));
// Fake Square, one directory per token; and a session = the test header.
fs.writeFileSync(path.join(root, 'lib', 'square.js'), `
export const SQ = globalThis.__SQ;
export async function getConnection(owner) { return SQ.conns[owner] || null; }
export async function squareFetch(p, o, token) { return SQ.fetch(p, o || {}, token); }
export async function resolveLocationTz() { return 'America/Los_Angeles'; }
export async function resolveLocationId(t, s) { return s || 'LOC'; }
export async function resolveLocationCurrency() { return 'USD'; }
export async function providerFromReqChecked(req) { return req.headers['x-owner'] || null; }
export async function sqContext(req, res) { const o = req.headers['x-owner']; const c = o && SQ.conns[o]; if (!c) { res.status(401).json({ code: 'nosquare' }); return null; } return { token: c.token, locationId: 'LOC', providerId: o }; }
`);
fs.writeFileSync(path.join(root, 'lib', 'clients.js'), `import { sql } from './db.js';
export async function ensureClientTables() { await sql()\`CREATE TABLE IF NOT EXISTS reminder_log (client_id text, rkey text, sent_at bigint, PRIMARY KEY (client_id, rkey))\`; }
export async function claimReminder(c, k) { const r = await sql()\`INSERT INTO reminder_log VALUES (\${String(c)}, \${String(k)}, \${Date.now()}) ON CONFLICT DO NOTHING RETURNING rkey\`; return r.length > 0; }
export async function releaseReminder(c, k) { await sql()\`DELETE FROM reminder_log WHERE client_id=\${String(c)} AND rkey=\${String(k)}\`; }`);
fs.writeFileSync(path.join(root, 'lib', 'push.js'), 'export const pushConfigured=()=>false; export const sendPushToAll=async()=>0;');
fs.writeFileSync(path.join(root, 'lib', 'fcm.js'), 'export const nativePushConfigured=()=>false; export const sendNativeToProvider=async()=>0; export const pushFoundersReport=async()=>({sent:1});');
fs.writeFileSync(path.join(root, 'lib', 'provider-push.js'), 'export const listProviderPushSubs=async()=>[]; export const deleteProviderPushSubById=async()=>{};');
fs.writeFileSync(path.join(root, 'lib', 'cron-runs.js'), 'export const withCronRun=(n,h)=>h;');

// ── fake Square ──
const SQ = globalThis.__SQ = {
  conns: { pA: { token: 'tokA' }, pB: { token: 'tokB' } },
  // customer -> owning token, and whether a card is saved
  customers: { SQ_A1: { tok: 'tokA', card: true }, SQ_A2: { tok: 'tokA', card: false }, SQ_A3: { tok: 'tokA', card: true }, SQ_B1: { tok: 'tokB', card: true } },
  decline: new Set(), payments: {}, calls: [], slow: 0,
  async fetch(p, o, token) {
    SQ.calls.push({ p, token, body: o.body });
    if (p.startsWith('/v2/cards')) { const cid = decodeURIComponent(p.split('customer_id=')[1]); const c = SQ.customers[cid]; if (!c || c.tok !== token) return { cards: [] }; return { cards: c.card ? [{ id: 'card_' + cid, last_4: '4242', enabled: true }] : [] }; }
    if (p === '/v2/payments' && o.method === 'POST') {
      const b = o.body; const c = SQ.customers[b.customer_id];
      if (!c || c.tok !== token) { const e = new Error('Customer not found'); e.status = 404; throw e; }
      if (SQ.slow) await new Promise(r => setTimeout(r, SQ.slow));
      const ik = token + '|' + b.idempotency_key;
      if (SQ.payments[ik]) return { payment: SQ.payments[ik] };
      if (SQ.decline.has(b.customer_id)) { const e = new Error('Card declined'); e.status = 400; throw e; }
      return { payment: (SQ.payments[ik] = { id: 'PAY' + Object.keys(SQ.payments).length, status: 'COMPLETED', amount: b.amount_money.amount, key: b.idempotency_key, customer: b.customer_id, token }) };
    }
    throw new Error('unexpected ' + p);
  }
};
const made = () => Object.values(SQ.payments);

const D = await import(path.join(root, 'lib', 'db.js'));
const q = D.sql(); await D.ensureTable(); await D.ensureProvidersTable();
const PB = await import(path.join(root, 'lib', 'perks-billing.js'));
const CRON = await import(path.join(root, 'api', 'cron-memberships.js'));
const EP = (await import(path.join(root, 'api', 'membership-charges.js'))).default;
const FS = await import(path.join(root, 'lib', 'founder-settings.js'));
let pass = 0, fail = 0; const ok = (c, n, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c || d === undefined ? '' : '  — ' + JSON.stringify(d))); c ? pass++ : fail++; };

// ── 1. the server's rules are the app's rules ──
{
  const html = fs.readFileSync(path.join(APP, 'slickchart.html'), 'utf8');
  const grab = name => { const i = html.indexOf('function ' + name + '('); let d = 0, j = html.indexOf('{', i); for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); } } };
  let TODAY = '2026-12-01';
  const ctx = { Math, String, Number, Array, Object, Infinity, isFinite, parseInt, parseFloat, Date };
  vm.createContext(ctx);
  vm.runInContext(['_pkNum', '_pkInt', '_pkAddPeriods', '_pkLedger', '_pkLive', '_pkMemState', '_money', '_todayISOOf'].map(grab).join('\n') + '\nfunction _todayISO(){return globalThis.__T;}', ctx);
  const app = (perks, join, today) => { ctx.__T = today; ctx.globalThis = ctx; return vm.runInContext('_pkMemState(__c,__j)', Object.assign(ctx, { __c: { perks }, __j: join })); };
  const J = (o) => Object.assign({ id: 'j1', t: 'join', p: 'P', ts: 1, d: '2026-01-31', start: '2026-01-31', snap: { price: '49.5', interval: 'month', every: 1 } }, o);
  const cases = [
    ['new, due on its start day', [J()], '2026-01-31'],
    ['Jan 31 + 1 month = Feb 28', [J(), { id: 'r0', t: 'renew', m: 'j1', per: 0, ts: 2 }], '2026-02-28'],
    ['leap year Feb 29', [J({ start: '2028-01-31', d: '2028-01-31' }), { id: 'r0', t: 'renew', m: 'j1', per: 0, ts: 2 }], '2028-02-29'],
    ['weekly every 2', [J({ snap: { price: 20, interval: 'week', every: 2 } }), { id: 'r0', t: 'renew', m: 'j1', per: 0, ts: 2 }, { id: 'r1', t: 'renew', m: 'j1', per: 1, ts: 3 }], '2026-03-01'],
    ['yearly', [J({ snap: { price: 300, interval: 'year', every: 1 } }), { id: 'r0', t: 'renew', m: 'j1', per: 0, ts: 2 }], '2027-01-31'],
    ['paused', [J(), { id: 'r0', t: 'renew', m: 'j1', per: 0, ts: 2 }, { id: 'pz', t: 'pause', m: 'j1', ts: 3 }], '2026-03-15'],
    ['resumed with a new anchor', [J(), { id: 'r0', t: 'renew', m: 'j1', per: 0, ts: 2 }, { id: 'pz', t: 'pause', m: 'j1', ts: 3 }, { id: 'rs', t: 'resume', m: 'j1', anchor: '2026-05-10', ts: 4 }], '2026-05-10'],
    ['cancelling (future end)', [J(), { id: 'r0', t: 'renew', m: 'j1', per: 0, ts: 2 }, { id: 'cx', t: 'cancel', m: 'j1', end: '2026-06-01', ts: 3 }], '2026-03-01'],
    ['ended', [J(), { id: 'cx', t: 'cancel', m: 'j1', end: '2026-02-01', ts: 3 }], '2026-03-01'],
    ['uncancelled', [J(), { id: 'cx', t: 'cancel', m: 'j1', end: '2026-02-01', ts: 3 }, { id: 'ux', t: 'uncancel', m: 'j1', ts: 4 }], '2026-03-01'],
    ['new terms, new price', [J(), { id: 'tm', t: 'terms', m: 'j1', snap: { price: '$79.00', interval: 'month', every: 1 }, ts: 2 }], '2026-02-01'],
    ['agreed later, then off', [J(), { id: 'a1', t: 'autopay', m: 'j1', on: 1, ts: 2 }, { id: 'a2', t: 'autopay', m: 'j1', on: 0, ts: 3 }], '2026-02-01'],
    ['agreed at join', [J({ auto: 1 })], '2026-02-01'],
    ['voided renewal', [J(), { id: 'r0', t: 'renew', m: 'j1', per: 0, ts: 2 }, { id: 'v', t: 'void', x: 'r0', ts: 3 }], '2026-02-01'],
    ['out of order timestamps', [{ id: 'r0', t: 'renew', m: 'j1', per: 0, ts: 5 }, J({ ts: 1 })], '2026-02-27'],
  ];
  const diffs = [];
  for (const [name, perks, today] of cases) {
    const a = app(perks, perks.find(e => e.t === 'join'), today);
    const evs = PB.liveEvents(perks); const s = PB.memState(evs, evs.find(e => e.t === 'join'), today);
    for (const k of ['status', 'per', 'nextPer', 'nextDue', 'due', 'price', 'autopay']) if (JSON.stringify(a[k]) !== JSON.stringify(s[k])) diffs.push(name + ': ' + k + ' app=' + JSON.stringify(a[k]) + ' server=' + JSON.stringify(s[k]));
  }
  ok(!diffs.length, 'server membership state matches the app for ' + cases.length + ' cases', diffs);
  ok(PB.chargeKey('j1', 3) === 'sc-mb-j1-3' && PB.chargeKey('j1', 3, 2) === 'sc-mb-j1-3-a2' && PB.chargeKey('x'.repeat(60), 12, 3).endsWith('-a3') && PB.chargeKey('x'.repeat(60), 12, 3).length === 45, 'Square keys: the app\'s key first, a fresh one after a decline, never over 45');
  ok(PB.todayIn('America/Los_Angeles', Date.UTC(2026, 11, 2, 6)) === '2026-12-01' && PB.hourIn('America/Los_Angeles', Date.UTC(2026, 11, 2, 6)) === 22, 'today and the hour are the provider\'s own time zone');
}

// ── data: two accounts ──
const plan = (o) => Object.assign({ id: 'MP', kind: 'membership', name: 'Glow Club', price: 99, interval: 'month', every: 1, autoCharge: true }, o);
const join = (id, o) => Object.assign({ id, t: 'join', p: 'MP', ts: 1, d: '2026-10-01', start: '2026-10-01', snap: { name: 'Glow Club', price: 99, interval: 'month', every: 1 }, auto: 1 }, o);
const renew = (j, per) => ({ id: 'rn_' + j + '_' + per, t: 'renew', m: j, per, ts: 10 + per });
const clientsA = {
  a1: { id: 'a1', name: 'Krys Test', squareId: 'SQ_A1', notes: 'SECRET NOTE', perks: [join('jA1'), renew('jA1', 0), renew('jA1', 1)] },          // due Dec 1, card saved
  a2: { id: 'a2', name: 'Bea Moss', squareId: 'SQ_A2', perks: [join('jA2'), renew('jA2', 0), renew('jA2', 1)] },                             // due, NO card
  a3: { id: 'a3', name: 'Cora Reed', squareId: 'SQ_A3', perks: [join('jA3', { auto: 0 }), renew('jA3', 0), renew('jA3', 1)] },               // did not agree
  a4: { id: 'a4', name: 'Dee Paused', squareId: 'SQ_A3', perks: [join('jA4'), renew('jA4', 0), { id: 'pz', t: 'pause', m: 'jA4', ts: 20 }] }, // paused
  a5: { id: 'a5', name: 'Eve Link', squareId: 'SQ_A3', perks: [join('jA5'), renew('jA5', 0), renew('jA5', 1)] },                            // a payment link is out
  a6: { id: 'a6', name: 'Fay Other', squareId: 'SQ_A3', perks: [join('jA6', { p: 'NOAUTO' }), renew('jA6', 0), renew('jA6', 1)] },          // plan without automatic billing
  a7: { id: 'a7', name: 'Gia Notyet', squareId: 'SQ_A3', perks: [join('jA7', { start: '2026-10-15' }), renew('jA7', 0), renew('jA7', 1)] }, // due Dec 15
  a8: { id: 'a8', name: 'No Ledger', squareId: 'SQ_A3' },
};
const paymentsA = [{ id: 'L1', status: 'unpaid', amount: 99, perkActs: [{ kind: 'renew', m: 'jA5', per: 2 }] }, { id: 'x', status: 'paid', amount: 5 }];
const clientsB = { b1: { id: 'b1', name: 'Hana Bee', squareId: 'SQ_B1', perks: [join('jB1'), renew('jB1', 0), renew('jB1', 1)] } };
const put = (o, k, v) => q`INSERT INTO kv (owner, k, v) VALUES (${o}, ${k}, ${JSON.stringify(v)}) ON CONFLICT (owner, k) DO UPDATE SET v = EXCLUDED.v`;
await put('pA', 'sc_perk_plans', [plan(), plan({ id: 'NOAUTO', autoCharge: false })]);
await put('pA', 'sc_clients', clientsA); await put('pA', 'sc_payments', paymentsA);
await put('pB', 'sc_perk_plans', [plan()]); await put('pB', 'sc_clients', clientsB);
await put('pC', 'sc_perk_plans', [plan({ autoCharge: false })]); await put('pC', 'sc_clients', { c1: { id: 'c1', name: 'Zed', squareId: 'SQ_A1', perks: [join('jC1')] } });
await q`INSERT INTO providers (id, email) VALUES ('pA', 'glow@ex.com'), ('pB', 'bee@ex.com')`;

const DEC1_10AM = Date.UTC(2026, 11, 1, 18);   // 10 AM in Los Angeles
const notes = [], alerts = [];
const deps = { getConnection: async o => SQ.conns[o] || null, squareFetch: (p, o, t) => SQ.fetch(p, o, t), resolveLocationTz: async () => 'America/Los_Angeles', resolveLocationId: async () => 'LOC', resolveLocationCurrency: async () => 'USD', notifyProvider: async (o, p) => { notes.push({ o, p }); return 1; } };
const run = (now) => CRON.runMembershipBilling(q, { now, deps, founderAlert: async p => { alerts.push(p); return { sent: 1 }; } });

// ── 2. report only (the default) ──
let s = await run(DEC1_10AM);
ok(s.live === false && made().length === 0, 'report-only by default: nothing is charged', s);
ok(s.wouldCharge === 2 && s.noCard === 1 && s.accountsDue === 2, 'it would charge Krys (A) and Hana (B), and Bea has no saved card', s);
let reps = await q`SELECT owner, summary FROM membership_billing_reports ORDER BY owner`;
const repTxt = JSON.stringify(reps);
ok(reps.length === 2 && !/Krys|Bea|Hana|SECRET|SQ_A|tokA/.test(repTxt) && /K\.T\./.test(repTxt), 'the report holds initials, plan and amount only', reps);
ok(!reps.some(r => r.owner === 'pC'), 'an account without automatic billing is not touched');
ok(alerts.length === 1 && /would charge 2 memberships across 2 accounts, and 1 have no saved card/.test(alerts[0].body) && /Nothing was charged/.test(alerts[0].body), 'Ashley gets one alert with the totals', alerts);
await run(DEC1_10AM + 3600e3);
ok(alerts.length === 1, 'and only one a day');
ok(!SQ.calls.some(c => c.p === '/v2/payments') && SQ.calls.filter(c => c.p.startsWith('/v2/cards')).every(c => SQ.customers[decodeURIComponent(c.p.split('customer_id=')[1])].tok === c.token), 'report mode only reads saved cards, each with its own account\'s token');

// ── 3. live ──
await FS.setFounderSetting(q, 'membership_autobill_live', 1);
s = await run(Date.UTC(2026, 11, 1, 15));   // 7 AM Los Angeles: before her start hour
ok(made().length === 0 && s.live, 'live, but before the start hour: nothing yet');
s = await run(DEC1_10AM);
let P = made();
ok(s.charged === 2 && s.failed === 1 && P.length === 2, 'live: two charged, one failed (no saved card)', s);
ok(P.every(p => (p.customer === 'SQ_A1' && p.token === 'tokA' && p.key === 'sc-mb-jA1-2') || (p.customer === 'SQ_B1' && p.token === 'tokB' && p.key === 'sc-mb-jB1-2')), 'each with its own account\'s token and the app\'s key for that month', P);
ok(P.every(p => p.amount === 9900), 'for the membership price');
let rows = await q`SELECT owner, jid, per, status, method, error FROM membership_charges ORDER BY owner, jid`;
ok(rows.length === 3 && rows.find(r => r.jid === 'jA2').status === 'failed' && /No saved card/.test(rows.find(r => r.jid === 'jA2').error), 'the shared record has paid, paid and failed (no saved card)', rows);
ok(notes.length === 2 && notes.find(n => n.o === 'pA').p.body.includes('Krys') && !notes.find(n => n.o === 'pA').p.body.includes('Hana') && notes.find(n => n.o === 'pB').p.body.includes('Hana') && !notes.find(n => n.o === 'pB').p.body.includes('Krys'), 'each provider is told about her own clients only', notes);
s = await run(DEC1_10AM + 3600e3);
ok(made().length === 2 && s.charged === 0 && s.failed === 0, 'the next hour charges nothing again and does not retry the failure yet', s);
// The provider saves a card; a day later it is tried again with a fresh key.
SQ.customers.SQ_A2.card = true;
await q`UPDATE membership_charges SET at = now() - interval '25 hours' WHERE owner = 'pA' AND jid = 'jA2'`;
s = await run(DEC1_10AM + 3600e3 * 2);
P = made();
ok(s.charged === 1 && P.length === 3 && P[2].key === 'sc-mb-jA2-2-a2', 'after the retry wait a declined month is tried again, with a new Square key', P[2]);
// The ledger has not heard yet (app closed), so the job must use its own record: still nothing new.
s = await run(DEC1_10AM + 3600e3 * 3);
ok(made().length === 3 && s.due === 0, 'a period paid on the server is not due again while the app is closed', s);
// A decline: recorded, retried once the wait passes.
await put('pA', 'sc_clients', Object.assign({}, clientsA, { a1: Object.assign({}, clientsA.a1, { perks: clientsA.a1.perks.concat([renew('jA1', 2)]) }) }));
SQ.decline.add('SQ_A1');
s = await run(Date.UTC(2027, 0, 1, 18));
ok(s.failed >= 1 && (await q`SELECT status, error, attempts FROM membership_charges WHERE owner = 'pA' AND jid = 'jA1' AND per = 3`)[0].status === 'failed', 'a declined card is recorded as failed', s);
s = await run(Date.UTC(2027, 0, 1, 20));
ok(!made().some(p => p.key.startsWith('sc-mb-jA1-3')), 'and not retried within the wait');
ok(((await run(Date.UTC(2027, 0, 2, 7))).blocked === undefined) && !made().some(p => p.key.startsWith('sc-mb-jA1-3')), 'nothing runs at 11 PM her time');

// ── 4. the device endpoint shares the same claim ──
const call = async (owner, method, body) => { const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; await EP({ method, headers: owner ? { 'x-owner': owner } : {}, body, query: {} }, res); return res; };
const m0 = made().length;
let r = await call('pB', 'POST', { action: 'charge', jid: 'jB1', per: 2, amount: 99, customerId: 'SQ_B1', cid: 'b1' });
ok(r.code === 200 && r.body.already === true && made().length === m0, 'a device asking to charge a month the server already charged gets "already paid"', r.body);
const before = made().length;
SQ.slow = 150;
const [x1, x2, x3] = await Promise.all([1, 2, 3].map(() => call('pB', 'POST', { action: 'charge', jid: 'jB1', per: 5, amount: 99, customerId: 'SQ_B1', cid: 'b1' })));
SQ.slow = 0;
ok(made().length === before + 1 && [x1, x2, x3].filter(x => x.code === 200 && x.body.paymentId).length === 1 && [x1, x2, x3].filter(x => x.code === 409).length === 2, 'three devices tapping at once: exactly one charge, the others are told it is in progress', [x1.code, x2.code, x3.code]);
r = await call('pB', 'POST', { action: 'mark', jid: 'jB1', per: 5, amount: 99, cid: 'b1', method: 'cash' });
ok(r.body.already === 'square', 'marking cash on a month charged to the card says it was already charged', r.body);
r = await call('pB', 'POST', { action: 'mark', jid: 'jB1', per: 6, amount: 99, cid: 'b1', method: 'cash' });
ok(r.body.ok && !r.body.already, 'cash for a new month is recorded');
r = await call('pB', 'POST', { action: 'charge', jid: 'jB1', per: 6, amount: 99, customerId: 'SQ_B1', cid: 'b1' });
ok(r.body.already === true && r.body.method === 'cash' && made().length === before + 1, 'and that month can then never be charged to the card');
// A run that died mid-charge: the claim is taken over after 10 minutes with the SAME key, so Square
// answers with the payment it already made.
await q`INSERT INTO membership_charges (owner, jid, per, status, amount, attempts, at) VALUES ('pB', 'jB1', 7, 'claimed', 99, 1, now() - interval '20 minutes')`;
SQ.payments['tokB|sc-mb-jB1-7'] = { id: 'PAYDONE', status: 'COMPLETED', amount: 9900, key: 'sc-mb-jB1-7', customer: 'SQ_B1', token: 'tokB' };
const n7 = made().length;
r = await call('pB', 'POST', { action: 'charge', jid: 'jB1', per: 7, amount: 99, customerId: 'SQ_B1', cid: 'b1' });
ok(r.body.paymentId === 'PAYDONE' && made().length === n7, 'a stuck claim is finished with the same key, never a second charge', r.body);
// A decline from a device; her own tap (force) may retry right away, the automatic one may not.
SQ.decline.add('SQ_B1');
r = await call('pB', 'POST', { action: 'charge', jid: 'jB1', per: 8, amount: 99, customerId: 'SQ_B1', cid: 'b1' });
ok(r.code === 402 && /declined/i.test(r.body.error), 'a declined device charge is reported', r.body);
SQ.decline.delete('SQ_B1');
r = await call('pB', 'POST', { action: 'charge', jid: 'jB1', per: 8, amount: 99, customerId: 'SQ_B1', cid: 'b1' });
ok(r.code === 402 && r.body.code === 'recentfail', 'an automatic retry right after a decline waits');
r = await call('pB', 'POST', { action: 'charge', jid: 'jB1', per: 8, amount: 99, customerId: 'SQ_B1', cid: 'b1', force: true });
ok(r.code === 200 && r.body.paymentId && made().slice(-1)[0].key === 'sc-mb-jB1-8-a2', 'her own tap retries now, with a fresh key', r.body);

// ── 5. isolation ──
r = await call('pB', 'GET');
ok(r.body.rows.length && r.body.rows.every(x => /^jB/.test(x.jid)), 'an account lists only its own charges');
r = await call('pA', 'GET');
ok(r.body.rows.every(x => /^jA/.test(x.jid)), 'and so does the other');
r = await call(null, 'GET');
ok(r.code === 401, 'no session, no list');
r = await call('pB', 'POST', { action: 'charge', jid: 'jA1', per: 4, amount: 99, customerId: 'SQ_A1', cid: 'a1' });
ok(r.code === 402 && !made().some(p => p.key === 'sc-mb-jA1-4') && !(await q`SELECT 1 FROM membership_charges WHERE owner = 'pA' AND per = 4`).length, 'another account\'s customer and membership id reach nothing: its own Square has no such card and the other account\'s record is untouched', r.body);
r = await call('pB', 'POST', { action: 'mark', jid: 'jA1', per: 9, amount: 1, method: 'cash' });
ok(!(await q`SELECT 1 FROM membership_charges WHERE owner = 'pA' AND jid = 'jA1' AND per = 9`).length, 'marking paid writes only the caller\'s own record');
const tokens = new Set(SQ.calls.filter(c => c.p === '/v2/payments').map(c => c.token + ':' + SQ.customers[c.body.customer_id].tok));
ok([...tokens].every(t => t.split(':')[0] === t.split(':')[1]), 'every charge used the token that owns the customer');

console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
