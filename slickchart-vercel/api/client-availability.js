// TOKEN-AUTHED: GET /api/client-availability?t=<client link token>&date=YYYY-MM-DD&service=<name>
// The free times on one day, for a client asking from their own private link.
//
// Why this exists: the client app had no route to real availability at all, so its "Preferred time"
// list was a grid generated from the provider's weekday hours. It offered times she was already
// booked for — Ashley saw it offer 11/5 10:00 AM, which was taken. SESSION-HANDOFF 2au.
//
// It deliberately reuses lib/booking.js, the SAME engine behind the public booking page
// (api/book-slots.js). One implementation of "what is actually free": it already understands her
// hours, the length of the chosen service, her buffer between visits, her notice window, and
// everything already booked BOTH in the app and in Square. A second implementation would drift, and
// the copy clients rely on would be the one nobody notices is wrong.
//
// ISOLATION (CLAUDE.md §0.1, §0.3):
//   - The provider is resolved from the TOKEN'S OWN ROW (getClientByToken -> provider_id). There is
//     no provider id in the request and none in the response. A different token reaches a different
//     provider or nothing at all; it can never be pointed at someone else's calendar.
//   - The response is a list of free times and which weekdays she opens. Never what she is booked
//     with, never who with, never how many, never a client, a note or an id. A caller learns exactly
//     what her own booking page already shows any stranger.
//   - `null` from openSlots means her calendar could not be fully read. That is reported as
//     unknown:true rather than guessed at, so the app falls back to asking for a request instead of
//     showing times that may already be gone.
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, getClientByToken } from '../lib/clients.js';
import { getBookingConfig, getHours, openSlots, openDayKeys, isoDay } from '../lib/booking.js';

const _hits = new Map();
function burstOk(key, limit, windowMs) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { _hits.set(key, arr); return false; }
  arr.push(now); _hits.set(key, arr);
  if (_hits.size > 5000) { for (const k of _hits.keys()) { if (k !== key) _hits.delete(k); if (_hits.size <= 4000) break; } }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  // No database means no client rows to authorise against, so there is nothing safe to answer.
  if (!dbEnabled()) { res.status(200).json({ ok: false, unknown: true, slots: [] }); return; }

  const token = String((req.query && req.query.t) || '').trim();
  const date = isoDay(req.query && req.query.date);
  const service = String((req.query && req.query.service) || '').trim();
  if (!token || !date) { res.status(400).json({ error: 'Bad request' }); return; }

  // Per IP and per token. A link holder refreshing a month of dates is normal; hammering is not.
  const ip = String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim() || 'ip';
  if (!burstOk('ca-ip:' + ip, 120, 60000)) { res.status(429).json({ error: 'Slow down a moment.' }); return; }
  if (!burstOk('ca-t:' + token, 90, 60000)) { res.status(429).json({ error: 'Slow down a moment.' }); return; }

  try {
    await ensureClientTables();
    const c = await getClientByToken(token);
    // Same generic answer for a token that never existed and one that was removed: a caller must not
    // be able to tell live links from dead ones by probing.
    if (!c || !c.provider_id) { res.status(404).json({ error: 'This link is not valid or has been removed.' }); return; }

    const providerId = c.provider_id;      // from the token's row, never from the request
    const cfg = await getBookingConfig(providerId);
    const hours = await getHours(providerId);
    if (!hours) { res.status(200).json({ ok: true, unknown: true, slots: [], openDays: [] }); return; }

    // NOTE the difference from api/book-slots.js on purpose: that one serves the PUBLIC page and so
    // honours cfg.on / cfg.mode, which decide whether strangers may see live times at all. This is
    // her own client, already invited, in her own app. The config is still used for its timing —
    // slot length, buffer, notice window — but it does not gate whether they may look.
    const slots = await openSlots(providerId, date, cfg, hours, service || undefined);
    res.setHeader('Cache-Control', 'no-store');
    if (slots === null) { res.status(200).json({ ok: true, unknown: true, slots: [], openDays: openDayKeys(hours) }); return; }
    res.status(200).json({ ok: true, slots, openDays: openDayKeys(hours) });
  } catch (e) {
    console.error('[client-availability] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
