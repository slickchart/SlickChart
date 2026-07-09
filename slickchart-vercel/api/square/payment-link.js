// POST /api/square/payment-link  { amount, name, email?, phone? }
// Creates a Square hosted checkout link (client pays on Square's secure page).
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const b = req.body || {};
  const amount = Math.round(parseFloat(b.amount) * 100);
  const name = String(b.name || 'Service').slice(0, 255);
  if (!amount || amount <= 0) { res.status(400).json({ error: 'Enter a valid amount.' }); return; }
  try {
    const locationId = await resolveLocationId(ctx.token, ctx.locationId);
    const body = {
      idempotency_key: 'sc-pl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
      quick_pay: { name, price_money: { amount, currency: 'USD' }, location_id: locationId }
    };
    if (b.email || b.phone) {
      body.pre_populated_data = {};
      if (b.email) body.pre_populated_data.buyer_email = b.email;
      if (b.phone) body.pre_populated_data.buyer_phone_number = b.phone;
    }
    const data = await sf('/v2/online-checkout/payment-links', { method: 'POST', body });
    res.status(200).json({ url: data.payment_link && data.payment_link.url, id: data.payment_link && data.payment_link.id });
  } catch (e) { res.status(e.status || 500).json({ error: e.message, code: e.status === 403 ? 'reconnect' : undefined }); }
}
