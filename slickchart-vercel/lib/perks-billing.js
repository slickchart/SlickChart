// Membership billing on the SERVER (2026-11-20). Ashley chose this so a membership a client agreed to
// have charged automatically is charged on its due day even when every one of the provider's devices
// is closed. Her choice was "Yes, with a report-only first night": until she turns real charging on
// (founder setting membership_autobill_live), the hourly job only lists who it WOULD charge.
//
// The rules the app follows are the same ones here (slickchart.html _pkMemState / _pkAutoEligible):
//   * the provider turned "Charge saved cards automatically" on for that membership plan,
//   * the client agreed (join `auto:1`, or an `autopay` event with on=1 after it),
//   * the client is linked to the provider's OWN Square and has a card saved there,
//   * a payment is due today in the provider's own time zone, the membership is active (not paused,
//     not cancelled), it has a price, and no payment link / QR / invoice for that period is still out.
//
// ONE record per (provider, membership, period) in membership_charges, shared by the app and this job:
// whichever gets there first claims it, so a month can never be charged twice, even with the job and
// two devices all running at once. The Square idempotency key is the same one the app has always used
// for that period (`sc-mb-<membership>-<period>`), with an attempt suffix only after a recorded decline.
//
// Isolation (CLAUDE.md §0): every read and write here takes the owner explicitly and has it in its
// WHERE; the job reads one account at a time, charges with that account's own Square token, and never
// sees another account's rows. Nothing here writes sc_clients: the app reads the paid rows and adds
// the renewal to its own ledger with the same derived ids it uses itself.

const DAY = 864e5;

// ── dates, as pure calendar days ('YYYY-MM-DD') ──
function ymd(y, m, d) { const t = new Date(Date.UTC(y, m, d)); return t.toISOString().slice(0, 10); }
function parts(iso) { const p = String(iso || '').slice(0, 10).split('-').map(Number); return (p.length === 3 && p.every(Number.isFinite)) ? p : null; }
// Same as the app's _pkAddPeriods: a month keeps its day where it can (Jan 31 + 1 month = Feb 28).
export function addPeriods(iso, interval, every, k) {
  const p = parts(iso); if (!p) return '';
  every = Math.max(1, every || 1);
  if (interval === 'week') return ymd(p[0], p[1] - 1, p[2] + 7 * every * k);
  const months = (interval === 'year' ? 12 : 1) * every * k;
  const first = new Date(Date.UTC(p[0], p[1] - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return ymd(first.getUTCFullYear(), first.getUTCMonth(), Math.min(p[2], last));
}
export function todayIn(tz, now) {
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(new Date(now || Date.now()));
  } catch (e) { return ''; }
}
export function hourIn(tz, now) {
  try { const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(now || Date.now()))); return Number.isFinite(h) ? h % 24 : -1; } catch (e) { return -1; }
}

const num = (v, d) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : (d || 0); };
const int = (v, d) => { const n = parseInt(String(v == null ? '' : v).replace(/[^0-9\-]/g, ''), 10); return Number.isFinite(n) ? n : (d || 0); };
const money = n => { const r = Math.round((Number(n) || 0) * 100 + (Number(n) >= 0 ? 1e-6 : -1e-6)) / 100; return r === 0 ? 0 : r; };
const safeId = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '');

// The app's ids and keys, byte for byte, so either side recognises the other's work.
export function chargeKey(jid, per, attempt) {
  const base = 'sc-mb-' + safeId(jid) + '-' + per;
  if (!(attempt > 1)) return base.slice(0, 45);
  const suf = '-a' + attempt;
  return base.slice(0, 45 - suf.length) + suf;
}
export const payId = (jid, per) => 'pay_mb_' + safeId(jid) + '_' + per;
export const renewId = (jid, per) => 'rn_' + jid + '_' + per;

// The ledger with voided events dropped, oldest first (the app's _pkLive).
export function liveEvents(perks) {
  const L = Array.isArray(perks) ? perks : [];
  const gone = {};
  for (const e of L) if (e && e.t === 'void' && e.x) gone[e.x] = 1;
  return L.filter(e => e && e.id && e.t !== 'void' && !gone[e.id]).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

// The app's _pkMemState, reduced to what billing needs. `paidPers` are periods paid somewhere the
// ledger has not heard about yet (a server charge, a paid payment still syncing).
export function memState(evsAll, join, today, paidPers) {
  const evs = evsAll.filter(e => e.m === join.id);
  let s = join.snap || {};
  for (const e of evs) if (e.t === 'terms' && e.snap) s = e.snap;
  let per = -1, paused = null, anchor = String(join.start || join.d || today).slice(0, 10), fromPer = 0, cancel = null, autopay = !!join.auto;
  for (const e of evs) {
    if (e.t === 'renew') { if (int(e.per, 0) > per) per = int(e.per, 0); }
    else if (e.t === 'pause') paused = e;
    else if (e.t === 'resume') { paused = null; anchor = String(e.anchor || e.d || today).slice(0, 10); fromPer = per + 1; }
    else if (e.t === 'cancel') cancel = e;
    else if (e.t === 'uncancel') cancel = null;
    else if (e.t === 'autopay') autopay = !!e.on;
  }
  // A paid period the ledger has not caught up with counts as renewed, and so does every period
  // before it (they were paid in order).
  if (paidPers) for (const p of paidPers) if (p > per) per = p;
  const nextPer = per + 1;
  const nextDue = addPeriods(anchor, s.interval || 'month', int(s.every, 1), nextPer - fromPer);
  const end = cancel ? String(cancel.end || cancel.d || '').slice(0, 10) : '';
  let status = 'active';
  if (cancel && today >= end) status = 'ended'; else if (cancel) status = 'cancelling'; else if (paused) status = 'paused';
  return { s, status, per, nextPer, nextDue, due: status === 'active' && !!nextDue && today >= nextDue, price: money(num(s.price, 0)), autopay };
}

// Who is due for an automatic charge today, from one account's own data. Pure: no database, no Square.
//   plans    sc_perk_plans (array)
//   clients  [{id, name, squareId, perks}] (only clients that have a ledger)
//   payments sc_payments rows that carry perkActs
//   rows     this account's membership_charges rows
export function dueMemberships({ plans, clients, payments, rows, today }) {
  const planById = {};
  for (const p of (Array.isArray(plans) ? plans : [])) if (p && p.id) planById[p.id] = p;
  const pending = new Set(), paidByPay = {};
  for (const p of (Array.isArray(payments) ? payments : [])) {
    if (!p || !Array.isArray(p.perkActs)) continue;
    for (const a of p.perkActs) {
      if (!a || a.kind !== 'renew' || !a.m) continue;
      const k = a.m + '|' + int(a.per, -1);
      if (p.status === 'unpaid') pending.add(k);
      else if (p.status === 'paid') (paidByPay[a.m] = paidByPay[a.m] || []).push(int(a.per, -1));
    }
  }
  const rowBy = {}, paidByRow = {};
  for (const r of (Array.isArray(rows) ? rows : [])) {
    rowBy[r.jid + '|' + r.per] = r;
    if (r.status === 'paid') (paidByRow[r.jid] = paidByRow[r.jid] || []).push(Number(r.per));
  }
  const out = [], skipped = { pending: 0, noSquare: 0, noPrice: 0, alreadyHandled: 0 };
  for (const c of (Array.isArray(clients) ? clients : [])) {
    if (!c || !c.id || c.deleted) continue;
    const evs = liveEvents(c.perks);
    for (const j of evs) {
      if (j.t !== 'join') continue;
      const pl = planById[j.p];
      if (!pl || pl.kind !== 'membership' || !pl.autoCharge) continue;
      const ms = memState(evs, j, today, [].concat(paidByPay[j.id] || [], paidByRow[j.id] || []));
      if (!ms.autopay || !ms.due) continue;
      if (evs.some(e => e.id === renewId(j.id, ms.nextPer))) continue;
      const row = rowBy[j.id + '|' + ms.nextPer];
      if (row && row.status !== 'failed') { skipped.alreadyHandled++; continue; }
      if (pending.has(j.id + '|' + ms.nextPer)) { skipped.pending++; continue; }
      if (!(ms.price > 0)) { skipped.noPrice++; continue; }
      if (!c.squareId) { skipped.noSquare++; continue; }
      out.push({ cid: String(c.id), name: String(c.name || ''), squareId: String(c.squareId), jid: String(j.id), per: ms.nextPer,
        amount: ms.price, plan: String(ms.s.name || pl.name || 'Membership'), nextDue: ms.nextDue,
        lastFailAt: row && row.status === 'failed' ? row.at : null, attempts: row ? Number(row.attempts) || 0 : 0 });
    }
  }
  return { due: out, skipped };
}
// The app's _pkMemNote, so the Square receipt reads the same whoever charged it.
export function memNote(plan, nextDue) {
  let d = nextDue;
  try { const p = parts(nextDue); d = new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) {}
  return 'Membership · ' + (plan || '') + ' · ' + d;
}

// ── the shared record ──
let _ready = false;
export async function ensureMembershipTables(q) {
  if (_ready) return;
  await q`CREATE TABLE IF NOT EXISTS membership_charges (
    owner text NOT NULL,
    jid text NOT NULL,
    per int NOT NULL,
    status text NOT NULL,
    amount numeric,
    method text,
    by_who text,
    client_id text,
    payment_id text,
    error text,
    attempts int DEFAULT 1,
    at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (owner, jid, per)
  )`;
  await q`CREATE TABLE IF NOT EXISTS membership_billing_reports (
    day text NOT NULL,
    owner text NOT NULL,
    mode text,
    summary jsonb,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (day, owner)
  )`;
  _ready = true;
}

// Claim (owner, jid, per) for a charge. Returns { claimed, attempt, row }.
//   A new period: claimed, attempt 1.
//   A 'failed' one: claimed again once retryMs has passed since the failure (or right away with
//     force, for her own "Charge card on file" tap), with the next attempt number.
//   A 'claimed' one older than staleMs (a run that died mid-charge): claimed again with the SAME
//     attempt, so Square answers with the payment it already made if it did.
//   Anything else (paid, or being charged right now): not claimed.
export async function claimCharge(q, owner, { jid, per, amount, cid, by }, { retryMs, staleMs, force } = {}) {
  owner = String(owner); jid = String(jid); per = Number(per);
  const ins = await q`INSERT INTO membership_charges (owner, jid, per, status, amount, client_id, by_who, attempts, at)
    VALUES (${owner}, ${jid}, ${per}, 'claimed', ${amount}, ${cid || null}, ${by || null}, 1, now())
    ON CONFLICT (owner, jid, per) DO NOTHING RETURNING attempts`;
  if (ins.length) return { claimed: true, attempt: 1 };
  const retrySec = Math.max(0, Math.round((force ? 0 : (retryMs || 0)) / 1000));
  const staleSec = Math.max(60, Math.round((staleMs || 10 * 60e3) / 1000));
  const up = await q`UPDATE membership_charges SET
      attempts = CASE WHEN status = 'failed' THEN attempts + 1 ELSE attempts END,
      status = 'claimed', at = now(), amount = ${amount}, by_who = ${by || null}, error = NULL
    WHERE owner = ${owner} AND jid = ${jid} AND per = ${per}
      AND ((status = 'failed' AND at <= now() - make_interval(secs => ${retrySec}))
        OR (status = 'claimed' AND at <= now() - make_interval(secs => ${staleSec})))
    RETURNING attempts`;
  if (up.length) return { claimed: true, attempt: Number(up[0].attempts) || 1 };
  const cur = await q`SELECT status, method, payment_id, error, at, attempts FROM membership_charges WHERE owner = ${owner} AND jid = ${jid} AND per = ${per}`;
  return { claimed: false, row: cur[0] || null };
}
export async function finishCharge(q, owner, jid, per, { status, paymentId, error, method }) {
  await q`UPDATE membership_charges SET status = ${status}, payment_id = ${paymentId || null}, error = ${error ? String(error).slice(0, 200) : null},
      method = ${method || null}, at = now()
    WHERE owner = ${String(owner)} AND jid = ${String(jid)} AND per = ${Number(per)}`;
}
// A payment taken another way (cash, Venmo, a link marked paid). Records the period as paid so the
// job never charges it, unless it was already paid or is being charged right now.
export async function markPaid(q, owner, { jid, per, amount, cid, method }) {
  owner = String(owner); jid = String(jid); per = Number(per);
  const ins = await q`INSERT INTO membership_charges (owner, jid, per, status, amount, method, client_id, by_who, at)
    VALUES (${owner}, ${jid}, ${per}, 'paid', ${amount}, ${method || 'other'}, ${cid || null}, 'mark', now())
    ON CONFLICT (owner, jid, per) DO NOTHING RETURNING per`;
  if (ins.length) return { ok: true };
  const up = await q`UPDATE membership_charges SET status = 'paid', method = ${method || 'other'}, amount = ${amount}, by_who = 'mark', error = NULL, at = now()
    WHERE owner = ${owner} AND jid = ${jid} AND per = ${per} AND status = 'failed' RETURNING per`;
  if (up.length) return { ok: true };
  const cur = await q`SELECT status, method, payment_id, at FROM membership_charges WHERE owner = ${owner} AND jid = ${jid} AND per = ${per}`;
  const r = cur[0] || {};
  if (r.status === 'paid') return { ok: true, already: r.method || 'paid', paymentId: r.payment_id || null };
  return { ok: false, busy: true };
}
export async function listCharges(q, owner, days) {
  const d = Math.max(1, Math.min(400, Number(days) || 120));
  return await q`SELECT jid, per, status, amount, method, client_id, payment_id, error, attempts, at FROM membership_charges
    WHERE owner = ${String(owner)} AND at > now() - make_interval(days => ${d}) ORDER BY at DESC LIMIT 2000`;
}

// ── charging, with the account's OWN token ──
// sq(path, opts) is squareFetch bound to that token. Returns { ok, paymentId } or throws with a reason
// a provider can read.
export async function chargeOnSquare(sq, { customerId, amount, note, key, locationId, currency }) {
  const d = await sq('/v2/cards?customer_id=' + encodeURIComponent(customerId));
  const card = (d.cards || []).find(c => c && c.enabled !== false);
  if (!card) { const e = new Error('No saved card in Square'); e.reason = 'nocard'; throw e; }
  const cents = Math.round(Number(amount) * 100);
  if (!(cents > 0)) throw new Error('No price set');
  const p = await sq('/v2/payments', { method: 'POST', body: {
    idempotency_key: key, source_id: card.id, customer_id: customerId,
    amount_money: { amount: cents, currency: currency || 'USD' }, location_id: locationId,
    note: String(note || 'SlickChart').slice(0, 500)
  } });
  const pay = p && p.payment;
  if (!pay || !pay.id) throw new Error('Square did not confirm the payment');
  if (pay.status === 'FAILED' || pay.status === 'CANCELED') throw new Error('The card was declined');
  return { ok: true, paymentId: pay.id, status: pay.status, last4: card.last_4 || '' };
}
export async function hasSavedCard(sq, customerId) {
  try { const d = await sq('/v2/cards?customer_id=' + encodeURIComponent(customerId)); return (d.cards || []).some(c => c && c.enabled !== false); } catch (e) { return null; }
}

// One account's due list, read from that account's own rows only.
export async function readAccount(q, owner) {
  owner = String(owner);
  let plans = [];
  try { const r = await q`SELECT v FROM kv WHERE owner = ${owner} AND k = 'sc_perk_plans'`; if (r[0]) { const v = JSON.parse(r[0].v); plans = Array.isArray(v) ? v : []; } } catch (e) {}
  // Only clients that have a rewards ledger, and only the fields billing reads.
  const cr = await q`SELECT e.key AS id, e.value->>'name' AS name, e.value->>'squareId' AS square_id,
      (e.value->>'deleted') AS deleted, e.value->'perks' AS perks
    FROM kv, jsonb_each(CASE WHEN jsonb_typeof(kv.v::jsonb) = 'object' THEN kv.v::jsonb ELSE '{}'::jsonb END) e
    WHERE kv.owner = ${owner} AND kv.k = 'sc_clients'
      AND jsonb_typeof(e.value) = 'object' AND jsonb_typeof(e.value->'perks') = 'array' AND jsonb_array_length(e.value->'perks') > 0`;
  const clients = cr.map(r => ({ id: r.id, name: r.name, squareId: r.square_id, deleted: r.deleted && r.deleted !== 'false', perks: typeof r.perks === 'string' ? JSON.parse(r.perks) : r.perks }));
  let payments = [];
  try {
    const pr = await q`SELECT x AS p FROM kv, jsonb_array_elements(CASE WHEN jsonb_typeof(kv.v::jsonb) = 'array' THEN kv.v::jsonb ELSE '[]'::jsonb END) x
      WHERE kv.owner = ${owner} AND kv.k = 'sc_payments' AND jsonb_typeof(x) = 'object' AND x ? 'perkActs'`;
    payments = pr.map(r => typeof r.p === 'string' ? JSON.parse(r.p) : r.p);
  } catch (e) {}
  const rows = await q`SELECT jid, per, status, at, attempts FROM membership_charges WHERE owner = ${owner}`;
  return { plans, clients, payments, rows };
}

export async function ownersWithAutoBilling(q) {
  // A cheap text match picks the candidates; readAccount re-reads each one's plans properly.
  return (await q`SELECT owner FROM kv WHERE k = 'sc_perk_plans' AND v LIKE '%"autoCharge":true%'`).map(r => String(r.owner));
}

// "J.S." for the founder's report: she sees counts, plans and amounts, never another provider's
// client's name.
export function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return w.length ? w.slice(0, 2).map(x => x[0].toUpperCase() + '.').join('') : '?';
}

export const _DAY = DAY;
