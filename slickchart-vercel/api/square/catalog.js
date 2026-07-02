// GET /api/square/catalog
// Lists your Square item library (products + services), resolves category names
// and image URLs, splits retail vs services, and returns a clean payload for
// SlickChart to import. Requires the token to have the "Items (read)" permission.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    const objects = [];
    let cursor = '';
    let guard = 0; // safety stop so we never loop forever
    do {
      const qs = new URLSearchParams({ types: 'ITEM,CATEGORY,IMAGE' });
      if (cursor) qs.set('cursor', cursor);
      const data = await sf('/v2/catalog/list?' + qs.toString());
      (data.objects || []).forEach(o => objects.push(o));
      cursor = data.cursor || '';
      guard++;
    } while (cursor && guard < 25);

    // Build lookups so items can show their category name and image.
    const catNames = {};
    const imgUrls = {};
    objects.forEach(o => {
      if (o.type === 'CATEGORY' && o.category_data) catNames[o.id] = o.category_data.name || '';
      if (o.type === 'IMAGE' && o.image_data) imgUrls[o.id] = o.image_data.url || '';
    });

    const items = objects
      .filter(o => o.type === 'ITEM' && !o.is_deleted)
      .map(o => normalizeItem(o, catNames, imgUrls));

    const retail = items.filter(i => !i.isService);
    const services = items.filter(i => i.isService);
    retail.sort((a, b) => a.name.localeCompare(b.name));
    services.sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ count: items.length, retail, services });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null });
  }
}

function money(m) {
  if (!m || typeof m.amount !== 'number') return null;
  return { amount: m.amount / 100, currency: m.currency || 'USD' };
}

function normalizeItem(o, catNames, imgUrls) {
  const d = o.item_data || {};
  const vars = (d.variations || []).filter(v => !v.is_deleted).map(v => {
    const vd = v.item_variation_data || {};
    const p = money(vd.price_money);
    return {
      id: v.id,
      name: vd.name || '',
      sku: vd.sku || '',
      price: p ? p.amount : null,
      currency: p ? p.currency : 'USD'
    };
  });
  const prices = vars.map(v => v.price).filter(p => p != null);
  const catId = (d.categories && d.categories[0] && d.categories[0].id) || d.category_id || '';
  const imgId = (d.image_ids && d.image_ids[0]) || '';
  const pt = d.product_type || 'REGULAR';
  return {
    id: o.id,
    name: d.name || '(unnamed)',
    description: d.description_plaintext || d.description || '',
    category: catNames[catId] || '',
    productType: pt,
    isService: pt === 'APPOINTMENTS_SERVICE',
    image: imgUrls[imgId] || '',
    variations: vars,
    price: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    currency: (vars[0] && vars[0].currency) || 'USD'
  };
}
