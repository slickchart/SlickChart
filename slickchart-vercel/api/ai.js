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
import { getClientByToken } from '../lib/clients.js';

// Only a signed-in provider OR a real client (via their link token) may use this metered proxy — it's
// billed to our Anthropic key. Without this the endpoint was an open, unauthenticated LLM for the whole
// internet to run up the bill on. Provider tokens verify offline (HMAC); a client link token is looked up
// in the DB (the aftercare helper in the client app sends it as X-Client-Token).
async function isAuthorized(req) {
  const secret = process.env.SESSION_SECRET || '';
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (secret && token) { const body = verifyToken(token, secret); if (body && body.u) return true; }
  const ct = String(req.headers['x-client-token'] || '').trim();
  if (ct && dbEnabled()) { try { if (await getClientByToken(ct)) return true; } catch (e) { /* DB trouble → not authorized via this path */ } }
  return false;
}

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
  // Prefer the platform-set real IP (Vercel's x-real-ip, not spoofable) over the leftmost
  // X-Forwarded-For entry (client-supplied and spoofable — otherwise an attacker rotates it to
  // get a fresh rate-limit bucket per request and run up the AI bill).
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return 'ip:' + (realIp || xff || (req.socket && req.socket.remoteAddress) || 'anon');
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

  // Require a valid credential before doing any billable upstream work.
  if (!(await isAuthorized(req))) { res.status(401).json({ enabled: true, error: 'Please sign in.' }); return; }

  const who = callerKey(req);

  // 1) Burst limit — always on, no database needed.
  const burstLimit = Math.max(parseInt(process.env.AI_BURST_LIMIT, 10) || 20, 1);
  if (!burstOk(who, burstLimit, 60000)) {
    res.status(429).json({ enabled: true, error: 'Too many AI requests in a row — give it a moment.' });
    return;
  }

  // 2) Daily quota — default ON (500/caller/day) whenever a database is connected, so a compromised or
  //    shared token can't run up an unbounded bill. Set AI_DAILY_LIMIT to override, or 0 to disable.
  const _envLimit = parseInt(process.env.AI_DAILY_LIMIT, 10);
  const dailyLimit = Number.isFinite(_envLimit) ? _envLimit : 500;
  let dailyKey = null;
  if (dbEnabled() && dailyLimit > 0) {
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
    // Bound INPUT cost. The output cap (max_tokens) does nothing about input/vision tokens, which are
    // billed too — so cap message count, total serialized size, and image blocks. The app sends a handful
    // of short messages and at most 4 downscaled images; a direct caller can't pack a max-size payload.
    if (messages.length > 50) { res.status(413).json({ error: 'Request too large.' }); return; }
    let _imgCount = 0;
    try { for (const m of messages) { const c = m && m.content; if (Array.isArray(c)) for (const blk of c) { if (blk && blk.type === 'image') _imgCount++; } } } catch (e) {}
    if (_imgCount > 8) { res.status(413).json({ error: 'Too many images in one request.' }); return; }
    if (JSON.stringify(messages).length > 2000000) { res.status(413).json({ error: 'Request too large.' }); return; }

    // Allow-list the model so an anonymous caller can't point this key at an
    // arbitrary/pricier model to run up the bill. The app only ever requests the
    // default; anything not on the list quietly falls back to it (never errors,
    // so a legit call is never broken). Extend ALLOWED_MODELS to add models on purpose.
    const DEFAULT_MODEL = 'claude-sonnet-4-6';
    const ALLOWED_MODELS = new Set([DEFAULT_MODEL, 'claude-haiku-4-5-20251001']);
    const reqModel = (typeof body.model === 'string' && body.model) ? body.model : DEFAULT_MODEL;
    const model = ALLOWED_MODELS.has(reqModel) ? reqModel : DEFAULT_MODEL;
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
      // Redact the upstream provider's raw error (model names, billing/quota wording, auth specifics) —
      // log it server-side and return a generic message, matching /api/transcribe. The client degrades to
      // its on-device fallback on any error, so a generic string is enough.
      try { console.error('[ai] upstream error', r.status, (data && data.error && data.error.message) || ''); } catch (e) {}
      res.status(r.status === 429 ? 429 : 502).json({ enabled: true, error: r.status === 429 ? 'The AI is busy right now — please try again in a moment.' : 'AI request failed. Please try again.' });
      return;
    }

    if (dailyKey) { try { await bumpDaily(who, dailyKey); } catch (e) { /* ignore */ } }
    res.status(200).json({ enabled: true, content: data.content || [] });
  } catch (e) {
    res.status(500).json({ enabled: true, error: 'AI proxy error' });
  }
}
