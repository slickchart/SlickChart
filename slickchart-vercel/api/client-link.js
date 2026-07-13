// POST /api/client-link  { email, origin? }
// Passwordless "get my link" for the unified app's client path: emails the client(s) matching this
// address their personal magic link (origin + /client?c=<token>). ALWAYS returns a generic success
// so it can't be used to probe whether an email is on file, and to the email ON FILE only (the link
// is never shown on screen). Rate-limited per IP.
import { dbEnabled, sql } from '../lib/db.js';
import { ensureClientTables } from '../lib/clients.js';
import { sendEmail, trustedOrigin } from '../lib/email.js';

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
function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m])); }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  // Generic response — identical whether or not the email matches, so it leaks nothing.
  const generic = { ok: true, message: 'If that email is on file, we just sent your secure link. Check your inbox (and spam).' };
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) { res.status(200).json(generic); return; }

    const realIp = String(req.headers['x-real-ip'] || '').trim();
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = realIp || xff || (req.socket && req.socket.remoteAddress) || 'anon';
    if (!burstOk('ip:' + ip, 6, 60000)) { res.status(200).json(generic); return; }   // stay generic even when limited

    if (!dbEnabled()) { res.status(200).json(generic); return; }
    await ensureClientTables();

    // The app passes its own origin so the link points at the domain they use; validate it's a clean
    // http(s) origin and otherwise fall back to our controlled origin (never a request header).
    const _bodyOrigin = String(body.origin || '').trim().replace(/\/+$/, '');
    const origin = /^https?:\/\/[^/\s]+$/i.test(_bodyOrigin) ? _bodyOrigin : trustedOrigin();

    const q = sql();
    // A person could be a client of more than one provider with the same email — send each their link.
    const rows = await q`SELECT token, name, email FROM clients
      WHERE lower(email) = ${email} AND deleted_at IS NULL
      ORDER BY updated_at DESC NULLS LAST LIMIT 5`;

    for (const c of (rows || [])) {
      if (!c || !c.token) continue;
      const link = origin + '/client?c=' + encodeURIComponent(c.token);
      const first = esc(String(c.name || 'there').split(' ')[0]);
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px;color:#1a1a1a;">
        <p style="font-size:16px;">Hi ${first},</p>
        <p style="font-size:15px;line-height:1.6;">Here's your secure link to your care space — visit summaries, aftercare, forms, and rebooking, all in one place.</p>
        <p style="margin:22px 0;"><a href="${esc(link)}" style="background:#c8a882;color:#1a1206;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">Open my care space</a></p>
        <p style="font-size:12px;color:#888;line-height:1.5;">This link is personal to you — please don't share it. If you didn't request this, you can safely ignore this email.</p>
      </div>`;
      const text = 'Hi ' + String(c.name || 'there').split(' ')[0] + ',\n\nHere is your secure link to your care space:\n' + link + '\n\nThis link is personal to you — please do not share it. If you didn’t request this, you can ignore this email.';
      try { await sendEmail({ to: c.email || email, subject: 'Your SlickChart care space', html, text }); } catch (e) { /* keep response generic */ }
    }
    res.status(200).json(generic);
  } catch (e) {
    console.error('[client-link] failed:', e && e.stack || e);
    res.status(200).json(generic);
  }
}
