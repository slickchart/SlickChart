// POST /api/transcribe   body: { audio: <base64>, mime?, prompt?, language? }
//   -> { enabled:true, text }   (or { enabled:false } if GROQ_API_KEY isn't set)
// GET  /api/transcribe          -> { enabled: <bool> }   (cheap capability probe for the client)
//
// Server-side proxy to Groq's OpenAI-compatible Whisper transcription. The browser records a short
// audio clip (MediaRecorder), base64-encodes it, and posts it here; we forward it to Groq and return
// the transcript. The client then runs its existing "clean up & file into sections" (Claude) step.
// The API key stays server-side in GROQ_API_KEY. If it's unset we return { enabled:false } (HTTP 200)
// so the app quietly falls back to the phone's live dictation engine.
//
// Cost guard: same caller-keyed burst limiter as /api/ai (audio calls are pricier, so the default is
// lower). A "caller" is the signed-in provider (session token) when available, else their IP.
import { verifyToken } from '../lib/auth.js';

const _hits = new Map();
function burstOk(key, limit, windowMs) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { _hits.set(key, arr); return false; }
  arr.push(now);
  _hits.set(key, arr);
  if (_hits.size > 5000) { for (const k of _hits.keys()) { if (k !== key) _hits.delete(k); if (_hits.size <= 4000) break; } }
  return true;
}
function callerKey(req) {
  const secret = process.env.SESSION_SECRET || '';
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (secret && token) { const b = verifyToken(token, secret); if (b && b.u) return 'u:' + b.u; }
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return 'ip:' + (realIp || xff || (req.socket && req.socket.remoteAddress) || 'anon');
}

export default async function handler(req, res) {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (req.method === 'GET') { res.status(200).json({ enabled: !!apiKey }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!apiKey) { res.status(200).json({ enabled: false }); return; }

  // Require a signed-in provider — this is a proxy to a metered third-party (Groq) billed to our key,
  // and voice notes are a provider-only feature. Without this, anyone could drive unbounded transcription
  // spend anonymously (the burst limiter is per-instance and IP-keyed, so it fails open when distributed).
  {
    const secret = process.env.SESSION_SECRET || '';
    const auth = req.headers['authorization'] || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const payload = (secret && token) ? verifyToken(token, secret) : null;
    if (!payload || !payload.u) { res.status(401).json({ error: 'Please sign in.' }); return; }
  }

  const limit = Math.max(parseInt(process.env.TRANSCRIBE_BURST_LIMIT, 10) || 12, 1);
  if (!burstOk(callerKey(req), limit, 60000)) {
    res.status(429).json({ enabled: true, error: 'Too many recordings in a row — give it a moment.' });
    return;
  }

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const b64 = String(body.audio || '');
    if (!b64) { res.status(400).json({ error: 'No audio' }); return; }
    // ~6M base64 chars ≈ 4.5MB binary — the platform request cap. The client records at a low bitrate
    // and caps the length so a normal note is far smaller; reject anything that slipped past.
    if (b64.length > 6000000) { res.status(413).json({ error: 'That recording is too long. Please record a shorter note.' }); return; }
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) { res.status(400).json({ error: 'Bad audio' }); return; }

    const mime = (typeof body.mime === 'string' && body.mime) ? body.mime.split(';')[0] : 'audio/webm';
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('mpeg') ? 'mp3' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
    const model = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';

    // Node 18+ (Vercel runtime) has global FormData / Blob / fetch — build the multipart Groq expects.
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), 'note.' + ext);
    form.append('model', model);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    // An optional prompt biases the model toward the provider's vocabulary (product/ingredient names).
    if (typeof body.prompt === 'string' && body.prompt.trim()) form.append('prompt', body.prompt.slice(0, 800));
    form.append('language', (typeof body.language === 'string' && body.language) ? body.language : 'en');

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey },
      body: form
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Don't pass Groq's raw error text (model names, quota/billing wording) back to the caller.
      console.error('[transcribe] upstream error', r.status, (data && data.error && (data.error.message || data.error)) || '');
      res.status(r.status >= 500 ? 502 : r.status).json({ enabled: true, error: 'Transcription failed. Please try again.' });
      return;
    }
    res.status(200).json({ enabled: true, text: String((data && data.text) || '').trim() });
  } catch (e) {
    console.error('[transcribe] failed:', e && e.stack || e);
    res.status(500).json({ enabled: true, error: 'Transcription proxy error' });
  }
}
