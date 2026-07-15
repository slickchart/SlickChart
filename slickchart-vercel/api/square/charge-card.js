// GET  /api/square/charge-card?customerId=... → { cards:[{id,last4,brand,exp}] }
// POST /api/square/charge-card  { customerId, cardId, amount, note? } → charges the saved card
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';

export default async function handler(req, res) {
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  try {
    if (req.method === 'GET') {
      const cid = (req.query && req.query.customerId) || '';
      if (!cid) { res.status(400).json({ error: 'Missing customerId' }); return; }
      const d = await sf('/v2/cards?customer_id=' + encodeURIComponent(cid));
      const cards = (d.cards || []).filter(c => c.enabled !== false).map(c => ({ id: c.id, last4: c.last_4, brand: c.card_brand, exp: (c.exp_month && c.exp_year) ? (c.exp_month + '/' + c.exp_year) : '' }));
      res.status(200).json({ cards });
      return;
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const amount = Math.round(parseFloat(b.amount) * 100);
      if (!amount || amount <= 0) { res.status(400).json({ error: 'Enter a valid amount.' }); return; }
      if (!b.cardId) { res.status(400).json({ error: 'Pick a saved card.' }); return; }
      const locationId = await resolveLocationId(ctx.token, ctx.locationId);
      // Prefer the client's stable idempotency key so a retried/duplicated request (lost response,
      // double-tap after a timeout) resolves to the SAME Square payment instead of charging twice.
      // Only fall back to a generated key if the client didn't send one. Square caps the key at 45 chars.
      const clientKey = String(b.idempotencyKey || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 45);
      const idemKey = clientKey || ('sc-pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
      const p = await sf('/v2/payments', { method: 'POST', body: {
        idempotency_key: idemKey,
        source_id: b.cardId, customer_id: b.customerId || undefined,
        amount_money: { amount, currency: 'USD' }, location_id: locationId,
        note: String(b.note || 'SlickChart').slice(0, 500)
      } });
      res.status(200).json({ ok: true, status: p.payment && p.payment.status, paymentId: p.payment && p.payment.id, receiptUrl: p.payment && p.payment.receipt_url });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { res.status(e.status || 500).json({ error: e.message, code: e.status === 403 ? 'reconnect' : undefined }); }
}
