// POST /api/square/refund  { paymentId, amount?, reason? }
// Refunds a Square payment (full amount by default, or a partial `amount`). Requires PAYMENTS_WRITE
// (already in scope). Returns the refund status. Idempotent per (paymentId + amount).
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const b = req.body || {};
  const paymentId = String(b.paymentId || '').trim();
  if (!paymentId) { res.status(400).json({ error: 'Missing paymentId' }); return; }

  try {
    // If no amount is given, look up the payment and refund the full amount.
    let amount = (b.amount != null) ? Math.round(parseFloat(b.amount) * 100) : null;
    let currency = 'USD';
    if (!amount || amount <= 0) {
      const pd = await sf('/v2/payments/' + encodeURIComponent(paymentId));
      const am = pd && pd.payment && pd.payment.amount_money;
      if (!am || !am.amount) { res.status(400).json({ error: 'Could not determine the payment amount to refund.' }); return; }
      amount = am.amount; currency = am.currency || 'USD';
    }
    // Stable idempotency key so a retried refund doesn't double-refund. Square caps it at 45 chars.
    const idem = ('sc-rf-' + paymentId + '-' + amount).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 45);
    const r = await sf('/v2/refunds', {
      method: 'POST',
      body: {
        idempotency_key: idem,
        payment_id: paymentId,
        amount_money: { amount, currency },
        reason: String(b.reason || 'Refund').slice(0, 192)
      }
    });
    const refund = r && r.refund;
    res.status(200).json({ ok: true, status: (refund && refund.status) || 'PENDING', refundId: refund && refund.id, amount: amount / 100 });
  } catch (e) {
    const scopeErr = /PAYMENTS_WRITE|scope|permission|unauthorized|forbidden/i.test(String((e && e.message) || '')) || e.status === 403;
    res.status(e.status || 500).json({ error: (e && e.message) || 'Refund failed', code: scopeErr ? 'scope' : undefined });
  }
}
