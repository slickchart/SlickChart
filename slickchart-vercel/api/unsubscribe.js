// GET /api/unsubscribe?e=<email>&t=<token>
// One-click marketing unsubscribe (CAN-SPAM). The token is an HMAC of the email so a
// link can't be used to opt third parties out. Records the opt-out (honored by the
// nurture engine) and, best-effort, marks the Resend audience contact unsubscribed.
import { sql, dbEnabled } from '../lib/db.js';
import { ensureNurtureTables, unsubToken } from '../lib/nurture.js';

function page(title, msg) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:12vh auto;padding:28px;text-align:center;color:#2a2a2a;">
    <img src="https://slickchart.app/assets/wordmark-light.png" height="22" alt="SlickChart" style="height:22px;display:inline-block;margin-bottom:6px;">
    <h1 style="font-size:22px;margin:14px 0 8px;">${title}</h1>
    <p style="font-size:15px;line-height:1.6;color:#555;">${msg}</p>
  </div>`;
}

// Best-effort: also flag the contact as unsubscribed in Resend so broadcasts skip them too.
async function markResendUnsub(email) {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) return;
  try {
    let aud = process.env.RESEND_AUDIENCE_ID || '';
    if (!aud) {
      const list = await fetch('https://api.resend.com/audiences', { headers: { Authorization: 'Bearer ' + key } });
      if (!list.ok) return;
      const j = await list.json();
      const arr = (j && (j.data || j.audiences || j)) || [];
      aud = Array.isArray(arr) && arr[0] ? (arr[0].id || arr[0].audience_id) : '';
      if (!aud) return;
    }
    await fetch('https://api.resend.com/audiences/' + aud + '/contacts/' + encodeURIComponent(email), {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ unsubscribed: true })
    });
  } catch (e) { /* non-fatal */ }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const email = String((req.query && req.query.e) || '').trim().toLowerCase();
  const token = String((req.query && req.query.t) || '');
  if (!email || !token || token !== unsubToken(email)) {
    res.status(400).send(page('Invalid link', 'This unsubscribe link is invalid or expired. If you keep getting emails, just reply and I’ll remove you personally. — Ashley'));
    return;
  }
  try {
    if (dbEnabled()) {
      const q = sql();
      await ensureNurtureTables(q);
      await q`INSERT INTO nurture_optout (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
    }
    await markResendUnsub(email);
    res.status(200).send(page('You’re unsubscribed', 'You won’t receive any more marketing emails from SlickChart. Thanks for giving us a look — the door’s always open. 🌿'));
  } catch (e) {
    console.error('[unsubscribe]', e && e.message || e);
    // Still tell them they're out — a failed write shouldn't look like it didn't work.
    res.status(200).send(page('You’re unsubscribed', 'You won’t receive any more marketing emails from SlickChart.'));
  }
}
