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
export async function recordAttempt(q, email) {
  await q`INSERT INTO login_attempts (email) VALUES (${email})`;
}
export async function clearAttempts(q, email) {
  await q`DELETE FROM login_attempts WHERE email = ${email}`;
}
