// Lightweight signed-token auth (no external dependencies).
// A token is "<payload>.<signature>" where signature is an HMAC of the payload
// using SESSION_SECRET. This lets the server verify a login without a session store.
import crypto from 'crypto';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function signToken(payload, secret, ttlSeconds = 60 * 60 * 24 * 30) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return data + '.' + sig;
}

export function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [data, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  // constant-time compare
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null; // expired
    return body;
  } catch (e) {
    return null;
  }
}

// Password hashing (scrypt) for provider accounts.
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return salt + ':' + hash;
}
export function verifyPassword(pw, stored) {
  if (!stored || String(stored).indexOf(':') < 0) return false;
  const [salt, hash] = String(stored).split(':');
  let test;
  try { test = crypto.scryptSync(String(pw), salt, 64).toString('hex'); } catch (e) { return false; }
  const a = Buffer.from(hash), b = Buffer.from(test);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// One-time token (verification / reset): random, URL-safe.
export function makeToken() { return crypto.randomBytes(24).toString('base64url'); }

// Rate limiting for logins, backed by the login_attempts table.
// Blocks after `max` failures within `windowMin` minutes for a given email.
export async function tooManyAttempts(q, email, max = 7, windowMin = 15) {
  const rows = await q`SELECT count(*)::int AS n FROM login_attempts
    WHERE email = ${email} AND ts > now() - (${windowMin} * interval '1 minute')`;
  return (rows[0] && rows[0].n) >= max;
}
export async function recordAttempt(q, email, ip) {
  await q`INSERT INTO login_attempts (email, ip) VALUES (${email}, ${ip || ''})`;
}
// Per-IP cap (defends against password spraying — one guess each across many emails from one IP,
// which the per-email limiter never catches). Higher threshold than per-email since an IP can be a
// shared network. Fails open when no trustworthy IP is available.
export async function tooManyAttemptsByIp(q, ip, max = 30, windowMin = 15) {
  if (!ip) return false;
  const rows = await q`SELECT count(*)::int AS n FROM login_attempts
    WHERE ip = ${ip} AND ts > now() - (${windowMin} * interval '1 minute')`;
  return (rows[0] && rows[0].n) >= max;
}
export async function clearAttempts(q, email) {
  await q`DELETE FROM login_attempts WHERE email = ${email}`;
}

// ── Real session tracking ──
// Turns a raw User-Agent string into a short, friendly device label. This is
// deliberately simple pattern-matching rather than a full UA-parsing library.
export function friendlyDevice(ua) {
  const s = String(ua || '');
  let device = 'Unknown device';
  if (/iPhone/i.test(s)) device = 'iPhone';
  else if (/iPad/i.test(s)) device = 'iPad';
  else if (/Android/i.test(s)) device = 'Android device';
  else if (/Macintosh/i.test(s)) device = 'Mac';
  else if (/Windows/i.test(s)) device = 'Windows PC';
  let browser = '';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\//i.test(s)) browser = 'Opera';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/CriOS/i.test(s)) browser = 'Chrome';
  else if (/FxiOS/i.test(s) || /Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s)) browser = 'Safari';
  return browser ? `${device} \u00b7 ${browser}` : device;
}

// Vercel provides approximate geo headers on every request for free — no
// external lookup needed.
export function friendlyLocation(req) {
  const city = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : '';
  const region = req.headers['x-vercel-ip-country-region'] || '';
  const country = req.headers['x-vercel-ip-country'] || '';
  if (city && region) return `${city}, ${region}`;
  if (city && country) return `${city}, ${country}`;
  return country || 'Unknown location';
}

function reqIp(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  return String(fwd).split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '';
}

// Creates a real session row and returns its id, to be embedded in the JWT
// payload as `sid` so it can later be looked up and revoked.
export async function createSession(q, providerId, req) {
  const id = 's_' + crypto.randomBytes(12).toString('hex');
  const device = friendlyDevice(req.headers['user-agent']);
  const location = friendlyLocation(req);
  const ip = reqIp(req);
  await q`INSERT INTO sessions (id, provider_id, device, location, ip) VALUES (${id}, ${providerId}, ${device}, ${location}, ${ip})`;
  return id;
}

// Checked on requests that should honor revocation (not every endpoint needs
// this — see api/store.js, the main data-sync endpoint, for where it matters most).
export async function isSessionValid(q, sid) {
  if (!sid) return true; // tokens issued before this feature existed have no sid — don't lock those users out
  const rows = await q`SELECT revoked FROM sessions WHERE id = ${sid}`;
  if (!rows.length) return true; // unknown/legacy session id — fail open rather than break existing logins
  if (rows[0].revoked) return false;
  try { await q`UPDATE sessions SET last_seen_at = now() WHERE id = ${sid}`; } catch (e) { /* non-fatal */ }
  return true;
}
