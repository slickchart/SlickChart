// Minimal transactional email via Resend's HTTP API (no SDK/deps needed).
// If RESEND_API_KEY isn't set, we no-op gracefully so the app still works in
// development / before an email provider is connected.
export async function sendEmail({ to, subject, html, text, replyTo: replyToOverride, from: fromOverride }) {
  const key = process.env.RESEND_API_KEY || '';
  // The "from" address must be on a domain verified in Resend. slickchart.app is verified, so we
  // default to it; override with EMAIL_FROM in Vercel to use a different address on that domain.
  // NOTE: a gmail.com address cannot be a "from" here — Resend only sends from domains you own/verify.
  // To route replies to your inbox, use EMAIL_REPLY_TO (below) instead.
  const from = fromOverride || process.env.EMAIL_FROM || 'SlickChart <noreply@slickchart.app>';
  // Replies to any SlickChart email go here (defaults to the support inbox). A caller can override
  // per-message (e.g. a lead-notification sets Reply-To to the prospect so a reply reaches them).
  const replyTo = replyToOverride || process.env.EMAIL_REPLY_TO || 'support@slickchart.app';
  if (!key) { console.log('[email] RESEND_API_KEY not set — skipping email to', to); return { skipped: true }; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, reply_to: replyTo, subject, html, text })
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Email send failed: ' + r.status + ' ' + t); }
  return r.json();
}

// Pass audienceId to target a SPECIFIC list. Do that whenever the contact must not land in the
// SlickChart list — the auto-pick fallback below grabs the account's FIRST audience, which would
// quietly merge a different product's buyers into provider marketing. With audienceId given there is
// no fallback: if that list isn't configured, nothing is added.
export async function addToAudience(email, name, audienceId) {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) { return { skipped: true }; }
  if (audienceId === null || audienceId === '') { return { skipped: true, reason: 'no-audience-configured' }; }
  try {
    // Use RESEND_AUDIENCE_ID if provided; otherwise auto-pick the account's
    // default (first) audience so no ID needs to be configured by hand.
    let aud = audienceId || process.env.RESEND_AUDIENCE_ID || '';
    if (!aud) {
      const list = await fetch('https://api.resend.com/audiences', {
        headers: { 'Authorization': 'Bearer ' + key }
      });
      if (!list.ok) { return { error: 'audiences ' + list.status }; }
      const j = await list.json();
      const arr = (j && (j.data || j.audiences || j)) || [];
      aud = Array.isArray(arr) && arr[0] ? (arr[0].id || arr[0].audience_id) : '';
      if (!aud) { return { skipped: true, reason: 'no-audience' }; }
    }
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

// Origin for links that carry a secret token (password reset, email verification, a client's
// private invite link). These must resolve ONLY to an origin we control — never one derived
// from a request header. The Host / X-Forwarded-Host header is attacker-influenced, so building
// a token link from it is a reset-password-poisoning / host-header-injection vector: the victim
// would receive a genuine email whose link (carrying their live token) points at the attacker's
// origin, leaking the token on click. Set APP_ORIGIN to your canonical domain; otherwise the
// known production origin is used. Never falls back to request headers.
export function trustedOrigin() {
  const env = String(process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^/\s]+$/i.test(env)) return env;
  return 'https://slick-chart.vercel.app';
}

// The welcome + thank-you email new providers get right after signing up.
// Written to do three things: verify their email (functional), thank them for
// thank them for signing up, and set the tone that this is a provider-built
// app they're helping shape, not a finished product being handed to them.
export function welcomeEmailHtml({ name, link }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:8px;color:#1a1a1a;">
    <div style="background:#0a1719;border-radius:14px;padding:28px 24px;text-align:center;color:#eaf6f4;">
      <img src="https://slickchart.app/assets/slickchart-logo.png" width="46" height="46" alt="" style="display:inline-block;margin:0 0 8px;">
      <img src="https://slickchart.app/assets/wordmark-dark.png" height="26" alt="SlickChart" style="height:26px;display:inline-block;margin-bottom:6px;">
      <div style="display:none;font-size:22px;font-weight:700;margin-bottom:4px;">SlickChart</div>
    </div>

    <div style="padding:28px 6px 6px;">
      <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Hi ${esc(first)},</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 16px;"><strong>Welcome to SlickChart, and genuinely, thank you.</strong> You just joined a group of providers helping build something new for our industry, and I don't take that lightly.</p>
      <p style="font-size:16px;line-height:1.7;color:#3a3a3a;margin:0 0 16px;">I'm Ashley, a solo esthetician. I built SlickChart myself, from my own treatment room, because the software made for our industry never felt like it was actually made <em>for us</em>. So this isn't a corporate product with a beauty-industry paint job. It's built by a provider, for providers, from the ground up.</p>
      <p style="font-size:16px;line-height:1.7;color:#3a3a3a;margin:0 0 20px;">As a provider here, you're not just a customer, you're a collaborator. Every question you ask, every rough edge you point out, and every "it would be great if it also did ___" makes this better, faster than I could ever manage building it alone. This app is going to get amazing, and you're one of the people making that happen.</p>

      <div style="text-align:center;margin:26px 0;">
        <a href="${link}" style="background:#26c1b0;color:#03201e;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;display:inline-block;font-size:15px;">Verify your email &amp; get started</a>
        <div style="font-size:12px;color:#999;margin-top:10px;">This link expires in 24 hours.</div>
      </div>

      <div style="background:#eef6f4;border-radius:12px;padding:18px 20px;margin:0 0 20px;">
        <div style="font-size:12px;font-weight:700;color:#1e9e88;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">What's included, all of it, no higher tier</div>
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;color:#3a3a3a;">
          <tr><td style="padding:4px 0;">✨</td><td style="padding:4px 0 4px 8px;">Client charting, notes, and before &amp; after photos</td></tr>
          <tr><td style="padding:4px 0;">📋</td><td style="padding:4px 0 4px 8px;">Digital intake, consent, and consult forms</td></tr>
          <tr><td style="padding:4px 0;">💬</td><td style="padding:4px 0 4px 8px;">A private client app, with real two-way messaging</td></tr>
          <tr><td style="padding:4px 0;">💳</td><td style="padding:4px 0 4px 8px;">Payments and invoicing, with or without Square</td></tr>
          <tr><td style="padding:4px 0;">🤖</td><td style="padding:4px 0 4px 8px;">AI voice notes and session summaries (fully optional)</td></tr>
        </table>
      </div>

      <div style="background:#fff8ee;border:1px solid #f0d9a8;border-radius:12px;padding:18px 20px;margin:0 0 20px;">
        <div style="font-size:12px;font-weight:700;color:#b3801f;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">New to Square? A little gift to start</div>
        <p style="font-size:14px;line-height:1.7;color:#3a3a3a;margin:0 0 12px;">SlickChart connects to Square in one tap to pull in your clients, catalog, bookings, and invoicing. If you don't have Square yet, sign up through my referral link and Square will waive the processing fees on your first <strong>$1,000 in sales</strong> — real money back in your pocket while you get set up.</p>
        <a href="https://squareup.com/refer/2832A5A0B0" style="background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:9px;display:inline-block;font-size:14px;">Get $1,000 in free Square processing &rarr;</a>
      </div>

      <div style="margin:0 0 20px;">
        <div style="font-size:12px;font-weight:700;color:#1e9e88;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Getting started</div>
        <p style="font-size:14px;line-height:1.8;color:#3a3a3a;margin:0;">
          1. Verify your email above, then log in on your phone<br>
          2. The guided setup walks you through your business info, hours, and profession<br>
          3. Add or import your clients, whenever you're ready<br>
          4. Invite them to their own private client app, one tap each<br>
          5. Remove the sample data once your real clients are in
        </p>
      </div>

      <div style="background:#f6f7f8;border-radius:12px;padding:16px 18px;margin:0 0 20px;">
        <div style="font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">If you ever want to cancel</div>
        <p style="font-size:14px;line-height:1.7;color:#3a3a3a;margin:0;">Settings &rarr; Security &amp; Billing &rarr; <strong>Cancel subscription</strong>. One tap, no email required, no phone call. You keep full access to the end of the month you have already paid for, and <strong>nothing is deleted</strong> &mdash; your clients, notes and photos stay exactly where they are.<br><br>Using the iPhone app? Cancelling lives on the web: sign in at <a href="https://slickchart.app/slickchart" style="color:#1e9e88;">slickchart.app</a>. And if anything gets in your way, just reply to this email and I will cancel it for you the same day.</p>
      </div>

      <p style="font-size:16px;line-height:1.7;color:#3a3a3a;margin:0 0 6px;">Something confusing, broken, or missing? Just reply to this email, or tap <strong>Share beta feedback</strong> right in the app. I read every single one myself.</p>
      <p style="font-size:16px;line-height:1.7;margin:22px 0 0;">Thank you for being here from the start.<br>With love,<br><strong>Ashley</strong><br><span style="color:#888;font-size:13px;">Founder, SlickChart · Botanical Aesthetics</span></p>
    </div>
  </div>`;
}
export function welcomeEmailText({ name, link }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  return `Hi ${first},

Welcome to SlickChart, and genuinely, thank you. You just joined a group of providers helping build something new for our industry.

I'm Ashley, a solo esthetician. I built SlickChart myself, from my own treatment room, because the software made for our industry never felt like it was actually made for us.

As a provider here, you're a collaborator, not just a customer. Every question, every rough edge you flag, makes this better, faster than I could manage alone.

Verify your email to get started (link expires in 24 hours):
${link}

What's included, all of it, no higher tier:
- Client charting, notes, and before & after photos
- Digital intake, consent, and consult forms
- A private client app, with real two-way messaging
- Payments and invoicing, with or without Square
- AI voice notes and session summaries (fully optional)

New to Square? Sign up through my referral link and Square waives the processing fees on your first $1,000 in sales, then connect it to SlickChart in one tap:
https://squareup.com/refer/2832A5A0B0

Getting started:
1. Verify your email above, then log in on your phone
2. The guided setup walks you through your business info, hours, and profession
3. Add or import your clients, whenever you're ready
4. Invite them to their own private client app, one tap each
5. Remove the sample data once your real clients are in

If you ever want to cancel:
Settings -> Security & Billing -> Cancel subscription. One tap, no email required, no phone call. You keep full access to the end of the month you have already paid for, and nothing is deleted -- your clients, notes and photos stay exactly where they are. Using the iPhone app? Cancelling lives on the web: sign in at https://slickchart.app/slickchart. And if anything gets in your way, just reply to this email and I will cancel it for you the same day.

Something confusing, broken, or missing? Just reply to this email, or tap "Share beta feedback" in the app. I read every one myself.

Thank you for being here from the start.
With love,
Ashley
Founder, SlickChart · Botanical Aesthetics`;
}
// Notification a provider gets when someone submits their public consult link. The whole point of
// the link is lead capture, so the request has to reach them without them polling the app. Reply-To
// is set to the prospect (in consult-request.js) so hitting reply goes straight to the lead.
export function consultLeadEmailHtml({ providerName, name, email, phone, message, link }) {
  const row = (label, val) => val ? `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#7a948c;white-space:nowrap;vertical-align:top;">${esc(label)}</td><td style="padding:6px 0;font-size:14px;color:#1a1a1a;overflow-wrap:anywhere;">${esc(val)}</td></tr>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px;color:#1a1a1a;">
    <div style="background:#0a1719;border-radius:14px;padding:22px 24px;color:#eaf6f4;">
      <div style="font-size:12px;color:#a2beb9;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">New consult request</div>
      <div style="font-size:20px;font-weight:700;">${esc(name || 'Someone')} wants to book with you</div>
    </div>
    <div style="padding:20px 6px 6px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        ${row('Name', name)}${row('Email', email)}${row('Phone', phone)}
      </table>
      ${message ? `<div style="background:#eef6f4;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:#3a3a3a;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:18px;">${esc(message)}</div>` : ''}
      <p style="font-size:14px;line-height:1.7;color:#3a3a3a;margin:0 0 18px;">Just hit reply to answer ${esc((name || '').trim().split(/\s+/)[0] || 'them')} directly${email ? ' at ' + esc(email) : ''}${phone ? ', or call ' + esc(phone) : ''}.</p>
      ${link ? `<div style="margin:0 0 8px;"><a href="${link}" style="background:#26c1b0;color:#03201e;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;font-size:14px;">Open SlickChart</a></div>` : ''}
    </div>
  </div>`;
}
export function consultLeadEmailText({ providerName, name, email, phone, message, link }) {
  const lines = ['New consult request', ''];
  lines.push('Name: ' + (name || 'Someone'));
  if (email) lines.push('Email: ' + email);
  if (phone) lines.push('Phone: ' + phone);
  if (message) { lines.push('', message); }
  lines.push('', 'Reply to this email to answer them directly' + (email ? ' (' + email + ')' : '') + '.');
  if (link) lines.push('', 'Open SlickChart: ' + link);
  return lines.join('\n');
}

// ── Public booking link ─────────────────────────────────────────────────────────────────────────
// Two emails when someone books through a provider's public link. The one to the PERSON BOOKING is
// the one that was missing: they saw a confirmation on screen and then heard nothing, which for a
// stranger who just handed over their details reads as "did that work?". Reply-To is set to the
// provider so answering the email reaches her, not our support inbox.
//
// `confirmed` is the difference between the two states the link can produce: instant mode books the
// slot outright, request mode asks. The wording has to be honest about which happened, because
// "You're booked" for something she hasn't agreed to yet is how someone turns up to a locked door.
export function bookingGuestEmailHtml({ bizName, name, when, treatment, confirmed, note, depositUrl, depositLabel, address, phone }) {
  const first = (String(name || '').trim().split(/\s+/)[0]) || 'there';
  const head = confirmed ? 'You’re booked' : 'Request sent';
  const lede = confirmed
    ? `Your appointment with ${esc(bizName)} is confirmed.`
    : `${esc(bizName)} has your request and will confirm shortly — or suggest another time if that one’s taken.`;
  const row = (label, val) => val ? `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#7a948c;white-space:nowrap;vertical-align:top;">${esc(label)}</td><td style="padding:6px 0;font-size:14px;color:#1a1a1a;overflow-wrap:anywhere;">${esc(val)}</td></tr>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px;color:#1a1a1a;">
    <div style="background:#0a1719;border-radius:14px;padding:22px 24px;color:#eaf6f4;">
      <div style="font-size:12px;color:#a2beb9;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">${esc(bizName)}</div>
      <div style="font-size:20px;font-weight:700;">${head}</div>
    </div>
    <div style="padding:20px 6px 6px;">
      <p style="font-size:15px;line-height:1.7;color:#3a3a3a;margin:0 0 16px;">Hi ${esc(first)} — ${lede}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        ${row(confirmed ? 'When' : 'You asked for', when)}${row('What', treatment)}${row('Where', address)}${row('Their phone', phone)}
      </table>
      ${depositUrl ? `<div style="background:#fff6e8;border:1px solid #f0d9b5;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-size:14px;line-height:1.6;color:#3a3a3a;margin-bottom:11px;">${esc(depositLabel || 'A deposit is needed to hold this appointment.')}</div>
        <a href="${depositUrl}" style="background:#26c1b0;color:#03201e;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;font-size:14px;">Pay the deposit</a>
      </div>` : ''}
      ${note ? `<div style="background:#eef6f4;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:#3a3a3a;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:18px;">${esc(note)}</div>` : ''}
      <p style="font-size:13px;line-height:1.7;color:#7a948c;margin:0;">Need to change or cancel? Just reply to this email — it goes straight to ${esc(bizName)}.</p>
    </div>
  </div>`;
}
export function bookingGuestEmailText({ bizName, name, when, treatment, confirmed, note, depositUrl, depositLabel, address, phone }) {
  const first = (String(name || '').trim().split(/\s+/)[0]) || 'there';
  const lines = [confirmed ? 'You’re booked' : 'Request sent', ''];
  lines.push('Hi ' + first + ' — ' + (confirmed
    ? 'Your appointment with ' + bizName + ' is confirmed.'
    : bizName + ' has your request and will confirm shortly, or suggest another time if that one is taken.'));
  lines.push('');
  lines.push((confirmed ? 'When: ' : 'You asked for: ') + (when || ''));
  if (treatment) lines.push('What: ' + treatment);
  if (address) lines.push('Where: ' + address);
  if (phone) lines.push('Their phone: ' + phone);
  if (depositUrl) { lines.push('', depositLabel || 'A deposit is needed to hold this appointment.', 'Pay the deposit: ' + depositUrl); }
  if (note) lines.push('', note);
  lines.push('', 'Need to change or cancel? Reply to this email — it goes straight to ' + bizName + '.');
  return lines.join('\n');
}
// And the provider's own copy. She already gets a push, but a push is gone the moment it is swiped
// and it does not carry the person's email and phone.
export function bookingProviderEmailHtml({ name, email, phone, when, treatment, confirmed, note, link }) {
  const row = (label, val) => val ? `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#7a948c;white-space:nowrap;vertical-align:top;">${esc(label)}</td><td style="padding:6px 0;font-size:14px;color:#1a1a1a;overflow-wrap:anywhere;">${esc(val)}</td></tr>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px;color:#1a1a1a;">
    <div style="background:#0a1719;border-radius:14px;padding:22px 24px;color:#eaf6f4;">
      <div style="font-size:12px;color:#a2beb9;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">${confirmed ? 'Booked from your link' : 'New booking request'}</div>
      <div style="font-size:20px;font-weight:700;">${esc(name || 'Someone')} · ${esc(when || '')}</div>
    </div>
    <div style="padding:20px 6px 6px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        ${row('What', treatment)}${row('Email', email)}${row('Phone', phone)}
      </table>
      ${note ? `<div style="background:#eef6f4;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:#3a3a3a;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:18px;">${esc(note)}</div>` : ''}
      <p style="font-size:14px;line-height:1.7;color:#3a3a3a;margin:0 0 18px;">${confirmed
        ? 'This one is already on your calendar — they picked a time you had open.'
        : 'Open SlickChart to confirm it, suggest another time, or decline.'}</p>
      ${link ? `<div><a href="${link}" style="background:#26c1b0;color:#03201e;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;font-size:14px;">Open SlickChart</a></div>` : ''}
    </div>
  </div>`;
}
export function bookingProviderEmailText({ name, email, phone, when, treatment, confirmed, note, link }) {
  const lines = [confirmed ? 'Booked from your link' : 'New booking request', ''];
  lines.push((name || 'Someone') + ' · ' + (when || ''));
  if (treatment) lines.push('What: ' + treatment);
  if (email) lines.push('Email: ' + email);
  if (phone) lines.push('Phone: ' + phone);
  if (note) lines.push('', note);
  lines.push('', confirmed ? 'This one is already on your calendar.' : 'Open SlickChart to confirm, suggest another time, or decline.');
  if (link) lines.push('', link);
  return lines.join('\n');
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
