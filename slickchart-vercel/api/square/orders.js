// GET /api/square/orders?customerId=SQUARE_CUSTOMER_ID
// Returns a client's recent Square purchases (retail history) — what they bought, when, and the
// total — so the provider can see a client's buying history right on their chart. Uses ORDERS_READ.
//
// GET /api/square/orders?recentPaid=1
// Returns recent COMPLETED orders with their payment/tender info, used to reconcile app payment
// records (mark an invoice/charge paid when Square shows it paid). Uses ORDERS_READ / PAYMENTS_READ.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

function money(m) { return (m && typeof m.amount === 'number') ? m.amount / 100 : null; }

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const customerId = String((req.query && req.query.customerId) || '').trim();
  const recentPaid = String((req.query && req.query.recentPaid) || '') === '1';

  if (!ctx.locationId) { res.status(200).json({ ok: true, orders: [], note: 'no-location' }); return; }

  try {
    const filter = {};
    if (customerId) filter.customer_filter = { customer_ids: [customerId] };
    // Completed (paid) orders are what count as a purchase/for reconciliation.
    filter.state_filter = { states: ['COMPLETED'] };
    const body = {
      location_ids: [ctx.locationId],
      query: { filter, sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' } },
      limit: recentPaid ? 50 : 25
    };
    const data = await sf('/v2/orders/search', { method: 'POST', body });
    const orders = (data.orders || []).map(o => ({
      id: o.id,
      createdAt: o.created_at || o.closed_at || '',
      total: money(o.total_money),
      currency: (o.total_money && o.total_money.currency) || 'USD',
      customerId: o.customer_id || '',
      items: (o.line_items || []).map(li => ({
        name: li.name || '(item)',
        quantity: li.quantity || '1',
        total: money(li.total_money)
      })),
      // Tender/payment ids let the caller match this to an app payment record for reconciliation.
      tenders: (o.tenders || []).map(t => ({ id: t.id, type: t.type, paymentId: (t.card_details && t.card_details.card && t.id) || t.payment_id || t.id, total: money(t.amount_money) })),
      state: o.state || ''
    }));
    res.status(200).json({ ok: true, orders, syncedAt: Date.now() });
  } catch (e) {
    const scopeErr = /ORDERS_READ|PAYMENTS_READ|scope|permission|unauthorized|forbidden/i.test(String((e && e.message) || '')) || e.status === 403;
    res.status(e.status || 500).json({ error: (e && e.message) || 'Could not read Square orders', code: scopeErr ? 'scope' : undefined });
  }
}
