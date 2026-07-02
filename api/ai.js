// POST /api/ai   body: { messages, max_tokens?, model? }
// Server-side proxy to the Anthropic API. The browser can't call Anthropic
// directly (no key in the browser, and CORS blocks it), so AI features in the
// app post here instead. The API key stays server-side in an env var.
//
// If ANTHROPIC_API_KEY isn't set in Vercel, this returns { enabled: false }
// (HTTP 200) so the app can quietly fall back to a non-AI, chart-based brief.
//
// USAGE CAPS (protect your API bill as you add paying customers):
//   AI_BURST_LIMIT  – max AI calls per caller per minute (default 20). Always
//                     on, in-memory. Stops runaway loops / a user spamming.
//   AI_DAILY_LIMIT  – max AI calls per caller per day. Only enforced when a
//                     database is connected (uses the kv table). Unset/0 = off.
// A "caller" is the logged-in user (from their session token) when available,
// otherwise their IP address.

import { verifyToken } from '../lib/auth.js';
import { dbEnabled, sql, ensureTable } from '../lib/db.js';

// ── In-memory burst limiter (best-effort, per function instance) ──
const _hits = new Map();
function burstOk(key, limit, windowMs) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { _hits.set(key, arr); return false; }
  arr.push(now);
  _hits.set(key, arr);
  if (_hits.size > 5000) { // keep the map from growing forever
    for (const k of _hits.keys()) { if (k !== key) _hits.delete(k); if (_hits.size <= 4000) break; }
  }
  return true;
}

// Identify the caller: signed-in user if we can verify their token, else IP.
function callerKey(req) {
  const secret = process.env.SESSION_SECRET || '';
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (secret && token) {
    const body = verifyToken(token, secret);
    if (body && body.u) return 'u:' + body.u;
  }
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return 'ip:' + (xff || (req.socket && req.socket.remoteAddress) || 'anon');
}

// ── Optional DB-backed daily quota (fails open if the DB hiccups) ──
async function dailyCount(key) {
  await ensureTable();
  const q = sql();
  const day = new Date().toISOString().slice(0, 10);
  const k = 'aiusage:' + day;
  const rows = await q`SELECT v FROM kv WHERE owner = ${key} AND k = ${k}`;
  const count = (rows && rows[0]) ? (parseInt(rows[0].v, 10) || 0) : 0;
  return { count, k };
}
async function bumpDaily(key, k) {
  const q = sql();
  await q`INSERT INTO kv (owner, k, v) VALUES (${key}, ${k}, '1')
    ON CONFLICT (owner, k) DO UPDATE SET v = ((COALESCE(kv.v,'0'))::int + 1)::text, updated_at = now()`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) { res.status(200).json({ enabled: false }); return; }

  const who = callerKey(req);

  // 1) Burst limit — always on, no database needed.
  const burstLimit = Math.max(parseInt(process.env.AI_BURST_LIMIT, 10) || 20, 1);
  if (!burstOk(who, burstLimit, 60000)) {
    res.status(429).json({ enabled: true, error: 'Too many AI requests in a row — give it a moment.' });
    return;
  }

  // 2) Daily quota — only when a database is connected and a limit is set.
  const dailyLimit = parseInt(process.env.AI_DAILY_LIMIT, 10);
  let dailyKey = null;
  if (dbEnabled() && Number.isFinite(dailyLimit) && dailyLimit > 0) {
    try {
      const d = await dailyCount(who);
      if (d.count >= dailyLimit) {
        res.status(429).json({ enabled: true, error: 'Daily AI limit reached for this account.' });
        return;
      }
      dailyKey = d.k;
    } catch (e) { /* DB trouble: fail open, burst limit still applies */ }
  }

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) { res.status(400).json({ error: 'messages required' }); return; }

    const model = (typeof body.model === 'string' && body.model) ? body.model : 'claude-sonnet-4-6';
    const max_tokens = Math.min(Math.max(parseInt(body.max_tokens, 10) || 1000, 1), 2000);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model, max_tokens, messages })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || 'AI request failed';
      res.status(r.status).json({ enabled: true, error: msg });
      return;
    }

    if (dailyKey) { try { await bumpDaily(who, dailyKey); } catch (e) { /* ignore */ } }
    res.status(200).json({ enabled: true, content: data.content || [] });
  } catch (e) {
    res.status(500).json({ enabled: true, error: 'AI proxy error' });
  }
}
