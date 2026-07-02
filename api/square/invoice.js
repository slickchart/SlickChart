// POST /api/square/invoice
// Body: { name, email, customerId?, dueDate?, requestTip?, lineItems?:[{name,price,quantity,variationId?,taxable?}], amount?, title? }
// Builds a Square customer (if needed), an itemized order (auto-applying the seller's taxes,
// but blocking taxes on lines marked taxable:false), an invoice (tip prompt optional), and publishes it.
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const b = req.body || {};
  const email = String(b.email || '').trim();

  const items = Array.isArray(b.lineItems) ? b.lineItems.filter(li => li && (li.variationId || (li.name && parseFloat(li.price) > 0))) : [];

  try {
    const locationId = await resolveLocationId(ctx.token, ctx.locationId);

    // If any line is tax-exempt, fetch the seller's tax IDs so we can block them per-line.
    let taxIds = [];
    if (items.some(li => li.taxable === false)) {
      try {
        const cat = await sf('/v2/catalog/list?types=TAX');
        taxIds = (cat.objects || []).filter(o => o.type === 'TAX' && !o.is_deleted).map(o => o.id);
      } catch (e) { taxIds = []; }
    }

    // Build order line items — itemized (preferred) or a single amount (fallback).
    let orderLineItems;
    if (items.length) {
      orderLineItems = items.map((li, idx) => {
        const qty = String(Math.max(1, parseInt(li.quantity, 10) || 1));
        const line = li.variationId
          ? { catalog_object_id: li.variationId, quantity: qty }
          : { name: String(li.name || 'Item').slice(0, 500), quantity: qty, base_price_money: { amount: Math.round(parseFloat(li.price) * 100), currency: 'USD' } };
        if (li.taxable === false && taxIds.length) {
          line.pricing_blocklists = { blocked_taxes: taxIds.map((tid, i) => ({ uid: 'blk-' + idx + '-' + i, tax_catalog_object_id: tid })) };
        }
        return line;
      });
    } else {
      const amount = Math.round(parseFloat(b.amount) * 100);
      if (!amount || amount <= 0) { res.status(400).json({ error: 'Add at least one line item or an amount.' }); return; }
      orderLineItems = [{ name: String(b.title || 'Service'), quantity: '1', base_price_money: { amount, currency: 'USD' } }];
    }

    // resolve/create the Square customer
    let customerId = b.customerId;
    if (!customerId && email) {
      const f = await sf('/v2/customers/search', { method: 'POST', body: { query: { filter: { email_address: { exact: email } } } } });
      customerId = f.customers && f.customers[0] && f.customers[0].id;
    }
    if (!customerId) {
      if (!email) { res.status(400).json({ error: 'A client email is required to send an invoice.' }); return; }
      const parts = String(b.name || 'Client').trim().split(/\s+/);
      const c = await sf('/v2/customers', { method: 'POST', body: { given_name: parts[0] || 'Client', family_name: parts.slice(1).join(' ') || undefined, email_address: email } });
      customerId = c.customer && c.customer.id;
    }

    // itemized order (Square auto-applies the seller's catalog taxes to taxable lines)
    const order = await sf('/v2/orders', { method: 'POST', body: { idempotency_key: 'sc-o-' + Date.now(), order: { location_id: locationId, customer_id: customerId, line_items: orderLineItems, pricing_options: { auto_apply_taxes: true } } } });
    const orderId = order.order && order.order.id;
    const total = order.order && order.order.total_money ? order.order.total_money.amount / 100 : null;

    // invoice (tip prompt only when requested)
    const pr = { request_type: 'BALANCE', tipping_enabled: !!b.requestTip };
    if (b.dueDate) pr.due_date = b.dueDate;
    const inv = await sf('/v2/invoices', { method: 'POST', body: { idempotency_key: 'sc-i-' + Date.now(), invoice: { location_id: locationId, order_id: orderId, primary_recipient: { customer_id: customerId }, delivery_method: 'EMAIL', accepted_payment_methods: { card: true }, payment_requests: [pr] } } });
    const invoice = inv.invoice;
    const pub = await sf('/v2/invoices/' + invoice.id + '/publish', { method: 'POST', body: { version: invoice.version, idempotency_key: 'sc-pub-' + Date.now() } });
    res.status(200).json({ ok: true, invoiceId: invoice.id, url: (pub.invoice && pub.invoice.public_url) || '', total });
  } catch (e) { res.status(e.status || 500).json({ error: e.message, code: e.status === 403 ? 'reconnect' : undefined }); }
}
