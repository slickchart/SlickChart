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
