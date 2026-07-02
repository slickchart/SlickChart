// GET /api/square/customers
// Lists customers from your Square account (handles pagination) and returns a
// clean, normalized array for SlickChart to import.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    const customers = [];
    let cursor = '';
    let guard = 0; // safety stop so we never loop forever

    do {
      const qs = new URLSearchParams({ limit: '100' });
      if (cursor) qs.set('cursor', cursor);
      const data = await sf('/v2/customers?' + qs.toString());
      (data.customers || []).forEach(c => customers.push(normalize(c)));
      cursor = data.cursor || '';
      guard++;
    } while (cursor && guard < 25);

    customers.sort((a, b) => a.name.localeCompare(b.name));
    res.status(200).json({ count: customers.length, customers });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null });
  }
}

function normalize(c) {
  const name = [c.given_name, c.family_name].filter(Boolean).join(' ').trim();
  return {
    id: c.id,
    name: name || c.company_name || '(no name)',
    firstName: c.given_name || '',
    lastName: c.family_name || '',
    email: c.email_address || '',
    phone: c.phone_number || '',
    note: c.note || '',
    birthday: c.birthday || '',
    createdAt: c.created_at || ''
  };
}
