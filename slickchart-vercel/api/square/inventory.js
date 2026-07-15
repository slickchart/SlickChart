// GET /api/square/inventory
// Returns live stock counts from the seller's Square inventory for every retail variation Square is
// tracking, so the app's Inventory screen can show real numbers instead of manually-kept ones.
// Requires the INVENTORY_READ scope (added to SQUARE_SCOPES) — a provider connected before that was
// added must reconnect Square to grant it (we surface a 'scope' code so the UI can say so).
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    // 1) Pull catalog ITEMs so we can map each variation id → item/variation name, SKU, price.
    const objects = [];
    let cursor = '', guard = 0;
    do {
      const qs = new URLSearchParams({ types: 'ITEM' });
      if (cursor) qs.set('cursor', cursor);
      const data = await sf('/v2/catalog/list?' + qs.toString());
      (data.objects || []).forEach(o => objects.push(o));
      cursor = data.cursor || ''; guard++;
    } while (cursor && guard < 25);

    const varMap = {};
    objects
      .filter(o => o.type === 'ITEM' && !o.is_deleted && ((o.item_data && o.item_data.product_type) || 'REGULAR') !== 'APPOINTMENTS_SERVICE')
      .forEach(o => {
        const d = o.item_data || {};
        (d.variations || []).filter(v => !v.is_deleted).forEach(v => {
          const vd = v.item_variation_data || {};
          varMap[v.id] = {
            item: d.name || '(unnamed)',
            variation: vd.name || '',
            sku: vd.sku || '',
            price: (vd.price_money && typeof vd.price_money.amount === 'number') ? vd.price_money.amount / 100 : null
          };
        });
      });

    const varIds = Object.keys(varMap);
    if (!varIds.length) { res.status(200).json({ ok: true, items: [] }); return; }

    // 2) Batch-retrieve inventory counts (Square caps the batch, so chunk it). A variation only comes
    // back with a count when Square is actually tracking its stock — that's how we filter to trackables.
    const counts = {};
    for (let i = 0; i < varIds.length; i += 400) {
      const chunk = varIds.slice(i, i + 400);
      const body = { catalog_object_ids: chunk, states: ['IN_STOCK'] };
      if (ctx.locationId) body.location_ids = [ctx.locationId];
      const data = await sf('/v2/inventory/counts/batch-retrieve', { method: 'POST', body });
      (data.counts || []).forEach(c => {
        if (c.state === 'IN_STOCK') counts[c.catalog_object_id] = Number(c.quantity) || 0;
      });
    }

    // 3) Merge into a clean list of the retail items Square tracks stock for.
    const items = varIds
      .filter(vid => Object.prototype.hasOwnProperty.call(counts, vid))
      .map(vid => {
        const m = varMap[vid];
        const label = m.item + (m.variation && !/^regular$/i.test(m.variation) ? ' · ' + m.variation : '');
        return { variationId: vid, name: label, sku: m.sku, price: m.price, quantity: counts[vid] };
      });
    items.sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ ok: true, items, syncedAt: Date.now() });
  } catch (e) {
    const scopeErr = /INVENTORY_READ|scope|permission|unauthorized|forbidden/i.test(String((e && e.message) || '')) || e.status === 403;
    res.status(e.status || 500).json({ error: (e && e.message) || 'Could not read inventory', code: scopeErr ? 'scope' : undefined });
  }
}
