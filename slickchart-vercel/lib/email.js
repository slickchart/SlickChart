// Minimal transactional email via Resend's HTTP API (no SDK/deps needed).
// If RESEND_API_KEY isn't set, we no-op gracefully so the app still works in
// development / before an email provider is connected.
export async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY || '';
  const from = process.env.EMAIL_FROM || 'SlickChart <onboarding@resend.dev>';
  if (!key) { console.log('[email] RESEND_API_KEY not set — skipping email to', to); return { skipped: true }; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text })
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Email send failed: ' + r.status + ' ' + t); }
  return r.json();
}

export async function addToAudience(email, name) {
  const key = process.env.RESEND_API_KEY || '';
  const aud = process.env.RESEND_AUDIENCE_ID || '';
  if (!key || !aud) { return { skipped: true }; }
  try {
    const parts = String(name || '').trim().split(/\s+/);
    const r = await fetch('https://api.resend.com/audiences/' + aud + '/contacts', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, first_name: parts[0] || undefined, last_name: parts.slice(1).join(' ') || undefined, unsubscribed: false })
    });
    return r.ok ? r.json() : { error: r.status };
  } catch (e) { return { error: String(e && e.message || e) }; }
}

export function appOrigin(req) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'slick-chart.vercel.app');
  const proto = (req.headers['x-forwarded-proto'] || 'https');
  return proto + '://' + host;
}
