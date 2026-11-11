// Email a "What's new" post to every provider (2026-11-11, Ashley: "you mentioned an email announcing
// and let's make a post in the whats new board").
//
// Only reached from POST /api/announcements with email:true, which is owner-only (her session, or her
// Monitor key). Every provider gets the same text, addressed to her alone (never a shared To/CC list).
// Anyone who unsubscribed (nurture_optout, or Resend's own list) is skipped, and every email carries the
// same signed one-click unsubscribe as the nurture emails. Each address is claimed once per post
// (announcement_emails), so a retry or a double tap can never email anyone twice.
//
// Sent through Resend's batch endpoint, 100 per call, so a few hundred providers fit in one request.
import { wrap, footerText, resendUnsubscribedSet, ensureNurtureTables } from './nurture.js';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Plain text the way she writes posts: paragraphs, and "- " lines become a list.
export function bodyToHtml(body) {
  const blocks = String(body || '').replace(/\r/g, '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return blocks.map(b => {
    const lines = b.split('\n');
    if (lines.every(l => /^\s*[-•]\s+/.test(l))) {
      return '<ul style="padding-left:20px;margin:0 0 16px;">' + lines.map(l => '<li style="margin:0 0 8px;">' + esc(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>';
    }
    return '<p style="margin:0 0 16px;">' + esc(b).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

export async function announcementRecipients(q) {
  await ensureNurtureTables(q);
  const rows = await q`SELECT DISTINCT lower(trim(p.email)) AS email FROM providers p
    WHERE coalesce(trim(p.email), '') <> '' AND lower(trim(p.email)) NOT IN (SELECT lower(email) FROM nurture_optout)`;
  const unsub = await resendUnsubscribedSet();
  const all = rows.map(r => r.email).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const ok = all.filter(e => !unsub.has(e));
  return { emails: ok, optedOut: all.length - ok.length };
}

async function sendBatch(list) {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) return { ok: false, error: 'email is not configured' };
  try {
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(list), signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) return { ok: false, error: 'Resend said ' + r.status };
    return { ok: true };
  } catch (e) { return { ok: false, error: 'could not reach Resend' }; }
}

export async function emailAnnouncementToProviders(q, announcementId, title, body) {
  const out = { recipients: 0, sent: 0, already: 0, optedOut: 0, failed: 0, error: '' };
  await q`CREATE TABLE IF NOT EXISTS announcement_emails (
    announcement_id BIGINT NOT NULL, email TEXT NOT NULL, sent_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (announcement_id, email))`;
  const { emails, optedOut } = await announcementRecipients(q);
  out.recipients = emails.length; out.optedOut = optedOut;
  const from = process.env.EMAIL_FROM || 'SlickChart <noreply@slickchart.app>';
  const replyTo = process.env.EMAIL_REPLY_TO || 'support@slickchart.app';
  const subject = String(title || 'What’s new in SlickChart').slice(0, 140);
  // The email's own signature says "With love, Ashley", so her sign-off line is not repeated above it.
  const inner = bodyToHtml(String(body || '').replace(/\n+\s*Ashley\s*$/, '')) + '<div style="text-align:center;margin:24px 0;"><a href="https://slickchart.app/slickchart?n=news" style="background:#26c1b0;color:#03201e;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;display:inline-block;font-size:15px;">Open SlickChart</a></div>';
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    const claimed = [];
    for (const e of chunk) {
      const c = await q`INSERT INTO announcement_emails (announcement_id, email) VALUES (${announcementId}, ${e}) ON CONFLICT DO NOTHING RETURNING email`;
      if (c.length) claimed.push(e); else out.already++;
    }
    if (!claimed.length) continue;
    const r = await sendBatch(claimed.map(e => ({ from, to: e, reply_to: replyTo, subject,
      html: wrap(inner, e), text: String(body || '') + '\n\nOpen SlickChart: https://slickchart.app/slickchart?n=news' + footerText(e) })));
    if (r.ok) out.sent += claimed.length;
    else {
      out.failed += claimed.length; out.error = r.error;
      // Let a later retry try these again.
      for (const e of claimed) { try { await q`DELETE FROM announcement_emails WHERE announcement_id = ${announcementId} AND email = ${e}`; } catch (x) {} }
    }
  }
  return out;
}
