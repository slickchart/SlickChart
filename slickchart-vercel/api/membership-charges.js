// /api/membership-charges — the ONE record of which membership periods were charged, shared by the
// provider's devices and the hourly server job (api/cron-memberships.js), so a period is never charged
// twice however many of them try at once (2026-11-20).
//
//   GET                                   -> { rows: [...] } this account's charges, last 120 days
//   POST { action:'charge', jid, per, amount, customerId, note, cid, force }
//        claims the period, charges the client's saved card with THIS account's own Square token, and
//        records the result. Already paid -> { ok, already:true }. Being charged right now -> 409.
//        A recent decline is not retried unless `force` (her own "Charge card on file" tap).
//   POST { action:'mark', jid, per, amount, cid, method } -> records a payment taken another way.
//
// Isolation (CLAUDE.md §0.1): the account is the VERIFIED session's (providerFromReqChecked /
// sqContext), every query in lib/perks-billing.js has that owner in its WHERE, and the Square token is
// that account's own connection. Nothing in the body chooses whose rows or whose Square is used.
import { dbEnabled, sql } from '../lib/db.js';
import { providerFromReqChecked, sqContext, squareFetch, resolveLocationId, resolveLocationCurrency } from '../lib/square.js';
import { getFounderSettings } from '../lib/founder-settings.js';
import { ensureMembershipTables, claimCharge, finishCharge, markPaid, listCharges, chargeOnSquare, chargeKey } from '../lib/perks-billing.js';

const cleanId = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(503).json({ error: 'Not available right now.' }); return; }
  const q = sql();
  try {
    await ensureMembershipTables(q);
    if (req.method === 'GET') {
      const owner = await providerFromReqChecked(req);
      if (!owner) { res.status(401).json({ error: 'Please sign in.' }); return; }
      const rows = await listCharges(q, owner, 120);
      let live = false; try { live = (await getFounderSettings(q)).membership_autobill_live === 1; } catch (e) {}
      res.status(200).json({ ok: true, live, rows: rows.map(r => ({ jid: r.jid, per: Number(r.per), status: r.status, amount: r.amount == null ? null : Number(r.amount), method: r.method || '', cid: r.client_id || '', paymentId: r.payment_id || '', error: r.error || '', attempts: Number(r.attempts) || 1, at: r.at ? new Date(r.at).toISOString() : null })) });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const b = req.body || {};
    const jid = cleanId(b.jid), per = Math.round(Number(b.per)), amount = Math.round(Number(b.amount) * 100) / 100;
    if (!jid || !Number.isFinite(per) || per < 0 || per > 100000) { res.status(400).json({ error: 'Missing membership or period.' }); return; }
    const cid = cleanId(b.cid) || null;

    if (b.action === 'mark') {
      const owner = await providerFromReqChecked(req);
      if (!owner) { res.status(401).json({ error: 'Please sign in.' }); return; }
      const r = await markPaid(q, owner, { jid, per, amount: Number.isFinite(amount) ? amount : null, cid, method: String(b.method || 'other').replace(/[^a-z]/gi, '').slice(0, 20) || 'other' });
      if (r.busy) { res.status(409).json({ error: 'This payment is being charged to their card right now. Check again in a minute.', code: 'busy' }); return; }
      res.status(200).json(r);
      return;
    }
    if (b.action !== 'charge') { res.status(400).json({ error: 'Unknown action.' }); return; }
    if (!(amount > 0)) { res.status(400).json({ error: 'No price set' }); return; }
    const customerId = String(b.customerId || '').slice(0, 80);
    if (!customerId) { res.status(400).json({ error: 'Not linked to Square' }); return; }
    // Her own Square, or 401 nosquare: never a shared token (§0.2).
    const ctx = await sqContext(req, res); if (!ctx) return;
    const owner = ctx.providerId;
    const settings = await getFounderSettings(q);
    const cl = await claimCharge(q, owner, { jid, per, amount, cid, by: 'device' }, { retryMs: settings.membership_autobill_retry_hours * 3600e3, staleMs: 10 * 60e3, force: !!b.force });
    if (!cl.claimed) {
      const row = cl.row || {};
      if (row.status === 'paid') { res.status(200).json({ ok: true, already: true, method: row.method || '', paymentId: row.payment_id || '' }); return; }
      if (row.status === 'failed') { res.status(402).json({ error: row.error || 'The last try did not go through.', code: 'recentfail', failedAt: row.at }); return; }
      res.status(409).json({ error: 'This payment is being charged right now. Check again in a minute.', code: 'busy' });
      return;
    }
    const sq = (path, opts) => squareFetch(path, opts || {}, ctx.token);
    try {
      const locationId = await resolveLocationId(ctx.token, ctx.locationId);
      const currency = await resolveLocationCurrency(ctx.token, locationId);
      const r = await chargeOnSquare(sq, { customerId, amount, note: String(b.note || 'SlickChart membership').slice(0, 300), key: chargeKey(jid, per, cl.attempt), locationId, currency });
      await finishCharge(q, owner, jid, per, { status: 'paid', paymentId: r.paymentId, method: 'square' });
      res.status(200).json({ ok: true, paymentId: r.paymentId, last4: r.last4 });
    } catch (e) {
      const why = e && e.status === 401 ? 'Square needs you to sign in again' : String((e && e.message) || 'The charge did not go through.').slice(0, 160);
      await finishCharge(q, owner, jid, per, { status: 'failed', error: why });
      res.status(e && e.status === 401 ? 401 : 402).json({ error: why, code: e && e.status === 401 ? 'reconnect' : 'declined' });
    }
  } catch (e) {
    console.error('[membership-charges]', e);
    res.status(500).json({ error: 'Something went wrong. Try again in a minute.' });
  }
}
