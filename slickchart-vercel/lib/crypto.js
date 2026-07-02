// AES-256-GCM encryption for OAuth tokens at rest (Square requires tokens be
// encrypted and stored on a secure server). The key is derived from SESSION_SECRET.
import crypto from 'crypto';

function key() {
  const s = process.env.SESSION_SECRET || '';
  if (!s) { const e = new Error('SESSION_SECRET not set'); e.status = 500; throw e; }
  return crypto.scryptSync(s, 'slickchart-square-v1', 32);
}
export function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
export function decrypt(b64) {
  if (!b64) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch (e) { return null; }
}
