// Hourly MEMBERSHIP BILLING (2026-11-20), invoked by Vercel Cron (see vercel.json).
//
// Charges a membership on its due day, on the client's card saved in the provider's OWN Square, even
// when none of the provider's devices are open. Only for a plan where she turned automatic billing on
// AND a client she ticked as having agreed (lib/perks-billing.js has the full rule list).
//
// Ashley's choice: report-only first. While the founder setting membership_autobill_live is 0 this
// charges NOBODY: it writes the list of who it would charge (initials, plan, amount, whether a card is
// saved) to membership_billing_reports and sends her one alert a day with the totals. She turns real
// charging on from Loyalty & memberships (api/admin/membership-billing.js).
//
// Isolation (CLAUDE.md §0): accounts are worked one at a time, each with its own Square token from
// getConnection(owner) and its own rows; nothing read for one account is used for another.
import { dbEnabled, sql } from '../lib/db.js';
import { ensureClientTables, claimReminder, releaseReminder } from '../lib/clients.js';
import { getConnection, squareFetch, resolveLocationTz, resolveLocationId, resolveLocationCurrency } from '../lib/square.js';
import { pushConfigured, sendPushToAll } from '../lib/push.js';
import { nativePushConfigured, sendNativeToProvider, pushFoundersReport } from '../lib/fcm.js';
import { listProviderPushSubs, deleteProviderPushSubById } from '../lib/provider-push.js';
import { getFounderSettings } from '../lib/founder-settings.js';
import { withCronRun } from '../lib/cron-runs.js';
import {
  ensureMembershipTables, ownersWithAutoBilling, readAccount, dueMemberships, todayIn, hourIn,
  claimCharge, finishCharge, chargeOnSquare, hasSavedCard, chargeKey, memNote, initials
} from '../lib/perks-billing.js';

const HOUR = 3600e3;
const FOUNDER_TZ = 'America/Los_Angeles';   // Ashley's day, for her once-a-day report alert only

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;                                  // fail closed: never publicly invokable
  const h = req.headers['authorization'] || '';
  if (h === 'Bearer ' + secret) return true;                 // Vercel Cron sends this
  if ((req.query && req.query.key) === secret) return true;   // manual test trigger
  return false;
}

const money = n => '$' + (Math.round(Number(n) * 100) / 100).toFixed(2);

// Everything one account needs, injectable so the test can run it against a real database with a
// fake Square. `deps` = { getConnection, squareFetch, resolveLocationTz, resolveLocationId,
// resolveLocationCurrency, notifyProvider }.
export async function billOneAccount(q, owner, { live, now, settings, deps }) {
  const out = { owner, due: 0, charged: 0, failed: 0, wouldCharge: 0, noCard: 0, amount: 0, items: [], blocked: '' };
  const acct = await readAccount(q, owner);
  if (!acct.plans.some(p => p && p.kind === 'membership' && p.autoCharge)) return out;
  out.hasPlans = true;
  const conn = await deps.getConnection(owner).catch(() => null);
  if (!conn || !conn.token) {
    out.blocked = 'nosquare';
    // Still count who is waiting, with her own calendar day, so the report can say so.
    const r = dueMemberships(Object.assign({}, acct, { today: todayIn(FOUNDER_TZ, now) }));
    out.due = r.due.length;
    return out;
  }
  const sq = (path, opts) => deps.squareFetch(path, opts || {}, conn.token);
  const tz = await deps.resolveLocationTz(conn.token, conn.locationId);
  if (!tz) { out.blocked = 'notz'; return out; }
  const today = todayIn(tz, now), hour = hourIn(tz, now);
  const retryMs = (settings.membership_autobill_retry_hours || 24) * HOUR;
  const { due, skipped } = dueMemberships(Object.assign({}, acct, { today }));
  out.skipped = skipped;
  const ready = due.filter(d => !d.lastFailAt || (now - new Date(d.lastFailAt).getTime()) >= retryMs);
  out.due = ready.length;
  if (!ready.length) return out;

  if (!live) {
    for (const d of ready) {
      const card = await hasSavedCard(sq, d.squareId);
      if (card === false) out.noCard++; else out.wouldCharge++;
      if (card !== false) out.amount += d.amount;
      out.items.push({ who: initials(d.name), plan: d.plan, amount: d.amount, due: d.nextDue, card: card === null ? 'unknown' : (card ? 'saved' : 'none'), retry: d.attempts > 0 });
    }
    return out;
  }

  if (hour < settings.membership_autobill_start_hour || hour >= settings.membership_autobill_end_hour) { out.blocked = 'hours'; return out; }
  let locationId = null, currency = 'USD';
  try { locationId = await deps.resolveLocationId(conn.token, conn.locationId); currency = await deps.resolveLocationCurrency(conn.token, locationId); } catch (e) {}
  const results = [];
  for (const d of ready) {
    const cl = await claimCharge(q, owner, { jid: d.jid, per: d.per, amount: d.amount, cid: d.cid, by: 'server' }, { retryMs, staleMs: 10 * 60e3 });
    if (!cl.claimed) continue;
    try {
      const r = await chargeOnSquare(sq, { customerId: d.squareId, amount: d.amount, note: memNote(d.plan, d.nextDue), key: chargeKey(d.jid, d.per, cl.attempt), locationId, currency });
      await finishCharge(q, owner, d.jid, d.per, { status: 'paid', paymentId: r.paymentId, method: 'square' });
      out.charged++; out.amount += d.amount;
      results.push({ ok: true, name: d.name, amount: d.amount });
      out.items.push({ who: initials(d.name), plan: d.plan, amount: d.amount, due: d.nextDue, result: 'charged' });
    } catch (e) {
      const why = e && e.status === 401 ? 'Square needs you to sign in again' : String((e && e.message) || 'did not go through').slice(0, 120);
      await finishCharge(q, owner, d.jid, d.per, { status: 'failed', error: why });
      out.failed++;
      results.push({ ok: false, name: d.name, amount: d.amount, why });
      out.items.push({ who: initials(d.name), plan: d.plan, amount: d.amount, due: d.nextDue, result: 'failed', why });
      if (e && e.status === 401) break;   // her sign-in is the problem: stop, every other charge would fail the same way
    }
  }
  if (results.length && deps.notifyProvider) {
    const ok = results.filter(r => r.ok), bad = results.filter(r => !r.ok);
    const title = ok.length ? ('Charged ' + ok.length + ' membership' + (ok.length === 1 ? '' : 's') + ' automatically') : 'A membership charge did not go through';
    const body = [ok.length ? ok.map(r => String(r.name || '').split(' ')[0] + ' ' + money(r.amount)).join(', ') : '',
      bad.length ? (bad.length + ' could not be charged (' + bad.map(r => String(r.name || '').split(' ')[0] + ': ' + r.why).join('; ') + ')') : ''].filter(Boolean).join('. ');
    try { await deps.notifyProvider(owner, { title, body: body.slice(0, 300), url: '/slickchart', tag: 'mbill:' + owner + ':' + today }); } catch (e) {}
  }
  return out;
}

async function notifyProvider(owner, payload) {
  let delivered = 0;
  if (pushConfigured()) {
    try { const subs = await listProviderPushSubs(owner); if (subs.length) delivered += (await sendPushToAll(subs, payload, (id) => deleteProviderPushSubById(id))) || 0; } catch (e) {}
  }
  if (nativePushConfigured()) { try { delivered += (await sendNativeToProvider(owner, payload)) || 0; } catch (e) {} }
  return delivered;
}

export async function runMembershipBilling(q, { now, deps, founderAlert }) {
  await ensureMembershipTables(q);
  try { await ensureClientTables(); } catch (e) {}   // reminder_log, for her once-a-day alert
  const settings = await getFounderSettings(q);
  const live = settings.membership_autobill_live === 1;
  const summary = { live, accounts: 0, accountsDue: 0, due: 0, charged: 0, failed: 0, wouldCharge: 0, noCard: 0, noSquare: 0, errors: 0 };
  const owners = await ownersWithAutoBilling(q);
  const day = todayIn(FOUNDER_TZ, now);
  for (const owner of owners) {
    try {
      const r = await billOneAccount(q, owner, { live, now, settings, deps });
      if (!r.hasPlans) continue;
      summary.accounts++; if (r.due) summary.accountsDue++; summary.due += r.due; summary.charged += r.charged; summary.failed += r.failed;
      summary.wouldCharge += r.wouldCharge; summary.noCard += r.noCard; if (r.blocked === 'nosquare') summary.noSquare++;
      // The day's report for this account: the latest run replaces the earlier one in report mode;
      // in live mode the charges made through the day are kept and added to.
      const rep = { mode: live ? 'live' : 'report', due: r.due, wouldCharge: r.wouldCharge, noCard: r.noCard, charged: r.charged, failed: r.failed, amount: Math.round(r.amount * 100) / 100, blocked: r.blocked, items: r.items.slice(0, 200), at: new Date(now).toISOString() };
      if (live) {
        const prev = await q`SELECT mode, summary FROM membership_billing_reports WHERE day = ${day} AND owner = ${owner}`;
        const p = (prev[0] && prev[0].mode === 'live' && prev[0].summary) ? (typeof prev[0].summary === 'string' ? JSON.parse(prev[0].summary) : prev[0].summary) : null;
        if (p) { rep.charged += p.charged || 0; rep.failed += p.failed || 0; rep.amount = Math.round(((p.amount || 0) + rep.amount) * 100) / 100; rep.items = (p.items || []).concat(rep.items).slice(-200); }
        await q`INSERT INTO membership_billing_reports (day, owner, mode, summary, updated_at) VALUES (${day}, ${owner}, 'live', ${JSON.stringify(rep)}::jsonb, now())
          ON CONFLICT (day, owner) DO UPDATE SET mode = 'live', summary = EXCLUDED.summary, updated_at = now()`;
      } else {
        await q`INSERT INTO membership_billing_reports (day, owner, mode, summary, updated_at) VALUES (${day}, ${owner}, 'report', ${JSON.stringify(rep)}::jsonb, now())
          ON CONFLICT (day, owner) DO UPDATE SET mode = 'report', summary = EXCLUDED.summary, updated_at = now()`;
      }
    } catch (e) { summary.errors++; console.error('[cron-memberships] account failed', String((e && e.message) || e).slice(0, 200)); }
  }
  // Ashley's once-a-day alert while it is report-only, so she sees the list without going looking.
  if (!live && founderAlert && summary.due > 0 && hourIn(FOUNDER_TZ, now) >= settings.membership_autobill_start_hour) {
    const key = 'mbreport:' + day;
    let fresh = false;
    try { fresh = await claimReminder('founder', key); } catch (e) {}
    if (fresh) {
      let sent = 0;
      try {
        const r = await founderAlert({ title: 'Membership billing, report only', body: 'Today it would charge ' + summary.wouldCharge + ' membership' + (summary.wouldCharge === 1 ? '' : 's') + ' across ' + summary.accountsDue + ' account' + (summary.accountsDue === 1 ? '' : 's') + (summary.noCard ? (', and ' + summary.noCard + ' have no saved card') : '') + '. Nothing was charged. Open Loyalty & memberships to see the list.', url: '/slickchart', tag: key });
        sent = (r && r.sent) || 0;
      } catch (e) {}
      if (!sent) { try { await releaseReminder('founder', key); } catch (e) {} }
      summary.founderAlerted = sent > 0;
    }
  }
  return summary;
}

async function handler(req, res) {
  if (!authorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'db disabled' }); return; }
  try {
    const q = sql();
    const summary = await runMembershipBilling(q, { now: Date.now(), founderAlert: pushFoundersReport,
      deps: { getConnection, squareFetch, resolveLocationTz, resolveLocationId, resolveLocationCurrency, notifyProvider } });
    res.status(200).json(Object.assign({ ok: true }, summary));
  } catch (e) {
    console.error('[cron-memberships]', e);
    res.status(500).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
}
export default withCronRun('cron-memberships', handler);
