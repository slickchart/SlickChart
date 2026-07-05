// GET /api/square/tax-rate
// Reads the provider's ENABLED Square catalog sales-tax rate (for display only).
// Square still calculates the authoritative tax on the invoice; this is just so the
// app can show a tax line in the preview. Returns { rate, name } (rate is a number, e.g. 8.75).
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  try {
    const cat = await sf('/v2/catalog/list?types=TAX');
    const taxes = (cat.objects || [])
      .filter(o => o.type === 'TAX' && !o.is_deleted && o.tax_data && o.tax_data.enabled)
      .map(o => ({ name: o.tax_data.name || 'Sales tax', pct: parseFloat(o.tax_data.percentage) || 0 }))
      .filter(t => t.pct > 0);
    // Use the highest enabled additive tax as the display estimate (most sellers have one).
    taxes.sort((a, b) => b.pct - a.pct);
    const top = taxes[0];
    res.status(200).json({ ok: true, rate: top ? top.pct : 0, name: top ? top.name : '', count: taxes.length });
  } catch (e) {
    res.status(200).json({ ok: false, rate: 0, name: '', error: e.message });
  }
}
