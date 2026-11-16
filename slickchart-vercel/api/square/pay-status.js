// GET /api/square/pay-status?orderId=ORDER_ID
//   Has the client paid the payment link (or on-screen QR) for this order yet? The link's order is
//   read from THIS provider's own Square (sqContext: her own OAuth token, never a shared one), so an
//   order id from another account simply is not found.
//   -> { ok, paid, total, tip, paymentId }
//
// GET /api/square/pay-status?since=ISO_TIME&cents=AMOUNT
//   After "Charge in person" hands off to the Square app (Tap to Pay or a reader), find the payment
//   it took: a COMPLETED payment at her location since the hand-off, for that amount (before tip).
//   -> { ok, found, matches, paymentId, total, tip, card }
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';

const money = m => (m && typeof m.amount === 'number') ? m.amount / 100 : 0;

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const q = req.query || {};
  res.setHeader('Cache-Control', 'no-store');
  try {
    const orderId = String(q.orderId || '').trim();
    if (orderId) {
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(orderId)) { res.status(400).json({ error: 'Bad order id.' }); return; }
      const d = await sf('/v2/orders/' + encodeURIComponent(orderId));
      const o = d.order || {};
      const tenders = o.tenders || [];
      const due = o.net_amount_due_money && typeof o.net_amount_due_money.amount === 'number' ? o.net_amount_due_money.amount : null;
      const paid = o.state === 'COMPLETED' || (tenders.length > 0 && (due === null || due <= 0));
      res.status(200).json({ ok: true, paid, total: money(o.total_money), tip: money(o.total_tip_money),
        paymentId: (tenders[0] && (tenders[0].payment_id || tenders[0].id)) || '' });
      return;
    }
    const since = Date.parse(String(q.since || ''));
    const cents = parseInt(q.cents, 10);
    if (!since || !(cents > 0)) { res.status(400).json({ error: 'Need orderId, or since and cents.' }); return; }
    // Never look further back than a day: this answers "the payment I just took", nothing older.
    const begin = new Date(Math.max(since - 60000, Date.now() - 86400000)).toISOString();
    const locationId = await resolveLocationId(ctx.token, ctx.locationId);
    const qs = new URLSearchParams({ begin_time: begin, sort_order: 'DESC', limit: '50' });
    if (locationId) qs.set('location_id', locationId);
    const d = await sf('/v2/payments?' + qs.toString());
    const hits = (d.payments || []).filter(p => p.status === 'COMPLETED' && p.amount_money && p.amount_money.amount === cents);
    const p = hits[0];
    res.status(200).json({ ok: true, found: !!p, matches: hits.length, paymentId: p ? p.id : '',
      total: p ? money(p.total_money) : 0, tip: p ? money(p.tip_money) : 0,
      card: p && p.card_details && p.card_details.card ? ((p.card_details.card.card_brand || '') + ' ' + (p.card_details.card.last_4 || '')).trim() : '' });
  } catch (e) {
    res.status(e.status && e.status < 500 ? e.status : 500).json({ error: e.message || 'Could not check Square.', code: e.status === 403 ? 'reconnect' : undefined });
  }
}
