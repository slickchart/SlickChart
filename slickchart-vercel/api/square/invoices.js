// GET /api/square/invoices → { invoices:[{id,status,total,client,publicUrl,createdAt}] }
// Lists the provider's Square invoices so SlickChart's Payments hub can show real paid/unpaid status.
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';

function simpleStatus(s) {
  s = String(s || '').toUpperCase();
  if (s === 'PAID') return 'paid';
  if (s === 'PARTIALLY_PAID') return 'partial';
  if (s === 'DRAFT') return 'draft';
  if (s === 'CANCELED' || s === 'FAILED') return 'canceled';
  if (s === 'REFUNDED' || s === 'PARTIALLY_REFUNDED') return 'refunded';
  return 'unpaid'; // UNPAID, SCHEDULED, PAYMENT_PENDING
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  try {
    const locationId = await resolveLocationId(ctx.token, ctx.locationId);
    const data = await sf('/v2/invoices/search', { method: 'POST', body: { query: { filter: { location_ids: [locationId] }, sort: { field: 'INVOICE_SORT_DATE', order: 'DESC' } }, limit: 100 } });
    const invoices = (data.invoices || []).map(inv => {
      let total = null;
      try {
        const sum = (inv.payment_requests || []).reduce((a, r) => a + ((r.computed_amount_money && r.computed_amount_money.amount) || 0), 0);
        if (sum) total = sum / 100;
      } catch (e) {}
      // Amount actually collected so far (sum of completed payments across the invoice's payment
      // requests). Without this, a PARTIALLY_PAID invoice reported $0 collected + the FULL amount owed,
      // so revenue reports understated and outstanding balances overstated.
      let amountPaid = null;
      try {
        const paid = (inv.payment_requests || []).reduce((a, r) => a + ((r.total_completed_amount_money && r.total_completed_amount_money.amount) || 0), 0);
        amountPaid = paid / 100;
      } catch (e) {}
      const r = inv.primary_recipient || {};
      const client = [r.given_name, r.family_name].filter(Boolean).join(' ') || r.email_address || '';
      // email + customerId let the app reliably match a paid invoice to a client record (e.g. to
      // auto-onboard on a paid deposit) instead of relying on name alone.
      return { id: inv.id, status: simpleStatus(inv.status), total, client, email: r.email_address || '', customerId: r.customer_id || '', publicUrl: inv.public_url || '', createdAt: inv.created_at || '' };
    });
    res.status(200).json({ invoices });
  } catch (e) { res.status(e.status || 500).json({ error: e.message, code: e.status === 403 ? 'reconnect' : undefined }); }
}
