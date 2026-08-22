// POST /api/client-code
//   { email }          -> SEND: email the client a one-time 6-digit sign-in code (generic response).
//   { email, code }    -> VERIFY: on match, return { ok:true, token } for the client's care space.
//
// Passwordless IN-APP sign-in for clients. The native app is the provider app shell; before this a
// client who downloaded it had no way in (no personal link stored yet) and just saw the front door.
// Now: open app -> "I'm a client" -> enter email -> get a code -> enter it -> land in THEIR care space,
// and the app remembers them (it stores the returned token as sc_client_token).
//
// SEND is always generic (never reveals whether an email is on file) and only actually emails a code
// when a matching client exists. VERIFY returns a specific (but safe) message so the client knows if a
// code was wrong/expired. Codes are scrypt-hashed at rest, single-use, short-lived, and attempt-capped.
import crypto from 'crypto';
import { dbEnabled, sql } from '../lib/db.js';
import { ensureClientTables } from '../lib/clients.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { sendEmail } from '../lib/email.js';

const CODE_TTL_MS = 10 * 60 * 1000;   // a code is valid for 10 minutes
const MAX_ATTEMPTS = 6;               // wrong guesses allowed before a code is burned

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
  const generic = { ok: true, message: 'If that email is on file, we just sent your 6-digit code. Check your inbox (and spam).' };
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').replace(/\D/g, '');

    const realIp = String(req.headers['x-real-ip'] || '').trim();
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = realIp || xff || (req.socket && req.socket.remoteAddress) || 'anon';
    // One IP limiter covers both sending and verifying — also caps brute-forcing a code.
    if (!burstOk('cc:ip:' + ip, 12, 60000)) { res.status(429).json({ ok: false, error: 'Too many tries. Please wait a minute and try again.' }); return; }

    if (!email || !/.+@.+\..+/.test(email)) {
      // No usable email: stay generic for a send; explicit for a verify (can't verify without an email).
      res.status(200).json(code ? { ok: false, error: 'Something went wrong — start again from your email.' } : generic);
      return;
    }
    if (!dbEnabled()) { res.status(200).json(code ? { ok: false, error: 'Sign-in is unavailable right now.' } : generic); return; }
    await ensureClientTables();
    const q = sql();

    // ── VERIFY ─────────────────────────────────────────────────────────────────
    if (code) {
      if (code.length !== 6) { res.status(200).json({ ok: false, error: 'Enter the 6-digit code.' }); return; }
      const rows = await q`SELECT code_hash, expires_at, attempts FROM client_login_codes WHERE email = ${email}`;
      const row = rows[0];
      if (!row) { res.status(200).json({ ok: false, error: 'That code has expired — request a new one.' }); return; }
      if (Number(row.expires_at) < Date.now()) {
        try { await q`DELETE FROM client_login_codes WHERE email = ${email}`; } catch (e) {}
        res.status(200).json({ ok: false, error: 'That code has expired — request a new one.' });
        return;
      }
      if (Number(row.attempts) >= MAX_ATTEMPTS) {
        try { await q`DELETE FROM client_login_codes WHERE email = ${email}`; } catch (e) {}
        res.status(200).json({ ok: false, error: 'Too many tries — request a new code.' });
        return;
      }
      if (!verifyPassword(code, row.code_hash)) {
        try { await q`UPDATE client_login_codes SET attempts = attempts + 1 WHERE email = ${email}`; } catch (e) {}
        res.status(200).json({ ok: false, error: 'That code didn’t match. Check it and try again.' });
        return;
      }
      // Correct — burn the code and hand back the best care-space token for this person.
      try { await q`DELETE FROM client_login_codes WHERE email = ${email}`; } catch (e) {}
      const tks = await q`SELECT token FROM clients
        WHERE lower(email) = ${email} AND deleted_at IS NULL
        ORDER BY (opened_at IS NOT NULL) DESC,
          length(coalesce(data::text, '')) DESC,
          updated_at DESC NULLS LAST,
          created_at DESC NULLS LAST
        LIMIT 1`;
      if (!tks[0] || !tks[0].token) { res.status(200).json({ ok: false, error: 'We couldn’t find your care space. Ask your provider to send your link.' }); return; }
      res.status(200).json({ ok: true, token: tks[0].token });
      return;
    }

    // ── SEND ───────────────────────────────────────────────────────────────────
    // Per-email cooldown so a double-tap / impatient retry can't fan out into a pile of code emails.
    if (!burstOk('cc:em:' + email, 1, 45000)) { res.status(200).json(generic); return; }

    // Only mint + email a code when a real client exists for this address. Response is identical either way.
    const exists = await q`SELECT 1 FROM clients WHERE lower(email) = ${email} AND deleted_at IS NULL LIMIT 1`;
    if (exists.length) {
      const code6 = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const hash = hashPassword(code6);
      const now = Date.now();
      await q`INSERT INTO client_login_codes (email, code_hash, expires_at, attempts, created_at)
        VALUES (${email}, ${hash}, ${now + CODE_TTL_MS}, 0, ${now})
        ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = EXCLUDED.created_at`;
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;padding:8px;color:#1a1a1a;">
        <p style="font-size:15px;line-height:1.6;">Here's your sign-in code for your SlickChart care space:</p>
        <p style="font-size:34px;font-weight:700;letter-spacing:.18em;margin:18px 0;color:#0f8a7e;">${esc(code6)}</p>
        <p style="font-size:13px;color:#777;line-height:1.6;">Enter it in the app to open your care space. It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>`;
      const text = 'Your SlickChart care space sign-in code is ' + code6 + '. It expires in 10 minutes. If you didn’t request this, you can ignore this email.';
      try { await sendEmail({ to: email, subject: 'Your SlickChart sign-in code: ' + code6, html, text }); } catch (e) { /* keep response generic */ }
    }
    res.status(200).json(generic);
  } catch (e) {
    console.error('[client-code] failed:', e && e.stack || e);
    res.status(200).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
