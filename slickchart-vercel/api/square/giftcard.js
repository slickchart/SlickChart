// GET /api/square/giftcard?gan=GIFT_CARD_NUMBER
// Looks up a Square gift card by its number (GAN) and returns the current balance + state, so the
// provider can check what's left on a client's gift card. Requires GIFTCARDS_READ.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const gan = String((req.query && req.query.gan) || '').replace(/\s/g, '').trim();
  if (!gan) { res.status(400).json({ error: 'Enter a gift card number.' }); return; }

  try {
    const data = await sf('/v2/gift-cards/from-gan', { method: 'POST', body: { gan } });
    const gc = data && data.gift_card;
    if (!gc) { res.status(200).json({ ok: true, found: false }); return; }
    const bal = gc.balance_money;
    res.status(200).json({
      ok: true,
      found: true,
      balance: (bal && typeof bal.amount === 'number') ? bal.amount / 100 : 0,
      currency: (bal && bal.currency) || 'USD',
      state: gc.state || '',
      gan: gc.gan || gan
    });
  } catch (e) {
    const scopeErr = /GIFTCARDS_READ|scope|permission|unauthorized|forbidden/i.test(String((e && e.message) || '')) || e.status === 403;
    const notFound = /not.?found|invalid/i.test(String((e && e.message) || ''));
    if (notFound && !scopeErr) { res.status(200).json({ ok: true, found: false }); return; }
    res.status(e.status || 500).json({ error: (e && e.message) || 'Could not look up gift card', code: scopeErr ? 'scope' : undefined });
  }
}
