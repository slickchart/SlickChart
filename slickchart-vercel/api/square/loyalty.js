// GET /api/square/loyalty?phone=CLIENT_PHONE
// Looks up a client's Square Loyalty account by phone number and returns their current points balance
// and lifetime points, so the provider (and, once synced, the client) can see loyalty status.
// Requires the LOYALTY_READ scope.
import { squareFetch as _sqf, sqContext } from '../../lib/square.js';

// Best-effort E.164 for a US phone (Square loyalty maps on E.164). Leaves an already-+ number alone.
function toE164(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s[0] === '+') return s.replace(/[^\d+]/g, '');
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return d ? '+' + d : '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);
  const phone = toE164((req.query && req.query.phone) || '');
  if (!phone) { res.status(200).json({ ok: true, found: false, note: 'no-phone' }); return; }

  try {
    const data = await sf('/v2/loyalty/accounts/search', {
      method: 'POST',
      body: { query: { mappings: [{ phone_number: phone }] }, limit: 1 }
    });
    const acct = (data.loyalty_accounts || [])[0];
    if (!acct) { res.status(200).json({ ok: true, found: false }); return; }
    res.status(200).json({
      ok: true,
      found: true,
      balance: Number(acct.balance) || 0,
      lifetimePoints: Number(acct.lifetime_points) || 0,
      accountId: acct.id || '',
      programId: acct.program_id || '',
      syncedAt: Date.now()
    });
  } catch (e) {
    const scopeErr = /LOYALTY_READ|scope|permission|unauthorized|forbidden/i.test(String((e && e.message) || '')) || e.status === 403;
    // A seller with no loyalty program returns an error too — treat "no program" as simply not found.
    const noProgram = /no loyalty program|not found|program/i.test(String((e && e.message) || ''));
    if (noProgram && !scopeErr) { res.status(200).json({ ok: true, found: false, note: 'no-program' }); return; }
    res.status(e.status || 500).json({ error: (e && e.message) || 'Could not read loyalty', code: scopeErr ? 'scope' : undefined });
  }
}
