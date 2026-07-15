// POST /api/square/save-card  { customerId, sourceId, verificationToken? }
// Saves a client's card on file in Square from a Web Payments SDK card token (sourceId), so the
// provider can later charge a no-show fee or deposit without re-entering the card. The raw card
// number is tokenized in the browser by Square's SDK — we only ever receive the one-time token.
// Requires PAYMENTS_WRITE (already in scope).
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const b = req.body || {};
  const customerId = String(b.customerId || '').trim();
  const sourceId = String(b.sourceId || '').trim();
  if (!customerId) { res.status(400).json({ error: 'This client isn’t linked to Square.' }); return; }
  if (!sourceId) { res.status(400).json({ error: 'Missing card token.' }); return; }

  try {
    const body = {
      idempotency_key: 'sc-card-' + crypto.randomBytes(8).toString('hex'),
      source_id: sourceId,
      card: { customer_id: customerId }
    };
    if (b.verificationToken) body.verification_token = String(b.verificationToken);
    const d = await sf('/v2/cards', { method: 'POST', body });
    const card = d && d.card;
    if (!card) { res.status(500).json({ error: 'Card was not saved.' }); return; }
    res.status(200).json({ ok: true, card: { id: card.id, last4: card.last_4, brand: card.card_brand, exp: (card.exp_month && card.exp_year) ? (card.exp_month + '/' + card.exp_year) : '' } });
  } catch (e) {
    const scopeErr = /PAYMENTS_WRITE|scope|permission|unauthorized|forbidden/i.test(String((e && e.message) || '')) || e.status === 403;
    res.status(e.status || 500).json({ error: (e && e.message) || 'Could not save the card', code: scopeErr ? 'scope' : undefined });
  }
}
