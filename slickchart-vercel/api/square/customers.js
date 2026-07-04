// GET  /api/square/customers  → list customers (normalized) for import
// POST /api/square/customers  → create a customer (or return an existing match by email)
//   Body: { name, email?, phone?, birthday?, note? }
//   Requires the token to have "Customers (write)".
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  if (req.method === 'POST') {
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const phone = String(body.phone || '').trim();
      const birthday = String(body.birthday || '').trim(); // expects YYYY-MM-DD if provided
      const note = String(body.note || '').trim();
      if (!name && !email) { res.status(400).json({ error: 'A name or email is required.' }); return; }

      // Avoid duplicates: if we have an email, look for an existing customer first.
      if (email) {
        try {
          const found = await sf('/v2/customers/search', {
            method: 'POST',
            body: { limit: 1, query: { filter: { email_address: { exact: email } } } }
          });
          if (found.customers && found.customers[0]) {
            res.status(200).json({ ok: true, existing: true, customer: normalize(found.customers[0]) });
            return;
          }
        } catch (e) { /* fall through to create */ }
      }

      const parts = name.split(/\s+/).filter(Boolean);
      const payload = {
        given_name: parts[0] || name || 'Client',
        family_name: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
        email_address: email || undefined,
        phone_number: phone || undefined,
        note: note || undefined
      };
      // Square wants birthday as an RFC3339 date (YYYY-MM-DD is accepted).
      if (/^\d{4}-\d{2}-\d{2}$/.test(birthday)) payload.birthday = birthday;

      const created = await sf('/v2/customers', { method: 'POST', body: payload });
      if (!created.customer || !created.customer.id) { res.status(502).json({ error: 'Square did not return a customer.' }); return; }
      res.status(200).json({ ok: true, existing: false, customer: normalize(created.customer) });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null });
    }
    return;
  }

  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

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
