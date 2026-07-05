// Real TOTP (Time-based One-Time Password, RFC 6238) — the same algorithm
// Google Authenticator, Authy, and 1Password all use. Implemented with only
// Node's built-in crypto so no new dependency is needed.
import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  return base32Encode(buf);
}

function base32Encode(buf) {
  let bits = 0, value = 0, output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  // 64-bit counter, big-endian, split since Node's writeBigInt64BE needs a BigInt
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

// Generates the current 6-digit code for a secret (mainly useful for testing).
export function generateToken(secret, forTime = Date.now()) {
  const counter = Math.floor(forTime / 1000 / 30);
  return hotp(base32Decode(secret), counter);
}

// Verifies a submitted code, allowing +/-1 time step (30s) for clock drift.
export function verifyToken(secret, token, forTime = Date.now()) {
  const clean = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const secretBuf = base32Decode(secret);
  const counter = Math.floor(forTime / 1000 / 30);
  for (let errorWindow = -1; errorWindow <= 1; errorWindow++) {
    if (hotp(secretBuf, counter + errorWindow) === clean) return true;
  }
  return false;
}

// A standard otpauth:// URI, what Google Authenticator/Authy scan via QR code.
export function otpauthUri(secret, accountLabel, issuer = 'SlickChart') {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
