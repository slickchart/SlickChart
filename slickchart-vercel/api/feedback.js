// POST /api/feedback  { message, rating?, kind?, timeSaved? }  → logs a provider's beta feedback
//   kind:'pulse' + timeSaved come from the recurring pulse survey; the plain
//   feedback button sends neither and is stored as kind='adhoc'.
// GET  /api/feedback                          → owner-only: recent feedback { items }
//
// Every new piece of written feedback is EMAILED (and pushed) to the founder the moment it lands.
// Until 2026-10-21 it only went into the table behind the in-app Feedback Inbox, with no alert of
// any kind, and Ashley found a month of provider reports (broken forms, missing clients) she had
// never been told about. Same pattern as the signup ping: awaited, never blocks the save, and a
// notify_log row either way so a missed alert can be traced.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken, sessionOk } from '../lib/auth.js';
import { sendEmail } from '../lib/email.js';
import { pushFoundersReport, founderPushConfigured } from '../lib/fcm.js';
import { recordNotify } from '../lib/notify-log.js';

function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function founderNotifyTo() {
  return String(process.env.FOUNDER_NOTIFY_EMAIL || process.env.FOUNDER_EMAILS || 'botanicalaestheticsbyashley@gmail.com').split(',')[0].trim();
}
const FACES = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😍' };
const TIME_SAVED = { much_less: 'much less time', less: 'less time', same: 'about the same time', more: 'more time' };

// Tell Ashley. Pulse answers with no words in them (a face, a time-saved pick) are counted in the
// inbox but do not email: dozens of those a week would bury the reports that need her.
async function notifyFounder(q, { providerId, email, rating, message, kind, timeSaved }) {
  if (!message) return;
  let name = '';
  try { const r = await q`SELECT name FROM providers WHERE id = ${providerId}`; name = (r[0] && r[0].name) || ''; } catch (e) {}
  const who = name ? `${name} (${email || 'no email on file'})` : (email || 'a provider');
  const when = new Date().toLocaleString('en-US', { timeZone: process.env.FOUNDER_TZ || 'America/Los_Angeles' });
  const face = rating ? (FACES[rating] || '') + ' ' + rating + '/5' : '';
  const extra = [face && 'Rating: ' + face, timeSaved && 'Time vs before: ' + (TIME_SAVED[timeSaved] || timeSaved), kind === 'pulse' && 'From the check-in survey'].filter(Boolean);
  const first = message.replace(/\s+/g, ' ').slice(0, 60) + (message.length > 60 ? '…' : '');
  let emailed = '';
  try {
    const to = founderNotifyTo();
    if (to) {
      await sendEmail({
        to,
        // Reply-To is the provider, so hitting Reply answers them directly.
        replyTo: email || undefined,
        subject: `💬 Feedback from ${name || email || 'a provider'}: ${first}`,
        text: `${who} sent feedback in SlickChart.\n\n${message}\n\n${extra.join('\n')}${extra.length ? '\n' : ''}Sent: ${when}\n\nReply to this email to answer them. Every message is also in Feedback Inbox in the app.\n`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px;">
          <div style="font-size:20px;margin-bottom:6px;">💬 New feedback</div>
          <div style="font-size:14px;color:#555;margin-bottom:12px;">From <b>${escHtml(who)}</b> · ${escHtml(when)}</div>
          <div style="font-size:16px;color:#222;line-height:1.6;white-space:pre-wrap;background:#f6f6f4;border-radius:10px;padding:14px 16px;">${escHtml(message)}</div>
          ${extra.length ? `<div style="font-size:14px;color:#555;line-height:1.8;margin-top:10px;">${extra.map(escHtml).join('<br>')}</div>` : ''}
          <div style="font-size:13px;color:#888;margin-top:14px;">Reply to this email to answer them. Every message is also in Feedback Inbox in the app.</div>
        </div>`
      });
      emailed = 'emailed';
    }
  } catch (e) { emailed = 'email failed: ' + ((e && e.message) || 'unknown').slice(0, 160); console.error('[feedback] founder email failed:', e && e.message || e); }

  let skipped = '', devices = 0, sent = 0;
  try {
    if (!founderPushConfigured()) skipped = 'no push transport configured';
    else {
      const r = await pushFoundersReport({ title: '💬 New feedback from ' + (name || email || 'a provider'), body: first, url: '/slickchart', tag: 'feedback:' + providerId + ':' + Date.now() });
      devices = r.devices || 0; sent = r.sent || 0;
    }
  } catch (e) { skipped = 'threw: ' + ((e && e.message) || 'unknown'); }
  await recordNotify({ kind: 'feedback', subject: email || '', skipped, devices, sent, detail: emailed });
}

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}
async function resolveEmail(req, q) {
  const p = claims(req);
  if (!p.u) return null;
  if (p.e) return String(p.e).toLowerCase();
  try {
    const r = await q`SELECT email FROM providers WHERE id = ${p.u}`;
    return (r[0] && r[0].email) ? String(r[0].email).toLowerCase() : null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (!(await sessionOk(req))) { res.status(401).json({ error: 'This session has been signed out. Please log in again.' }); return; }
  if (!dbEnabled()) { res.status(200).json(req.method === 'GET' ? { items: [] } : { ok: true, skipped: true }); return; }

  if (req.method === 'GET') {
    const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
    try {
      await ensureProvidersTable();
      const q = sql();
      const you = await resolveEmail(req, q);
      if (!owner || you !== owner) { res.status(403).json({ error: 'Owner only' }); return; }
      const rows = await q`SELECT rating, message, email, kind, time_saved, extract(epoch from ts) * 1000 AS ts FROM feedback ORDER BY ts DESC LIMIT 200`;
      res.status(200).json({ items: rows.map(r => ({ rating: r.rating, message: r.message, email: r.email, kind: r.kind, timeSaved: r.time_saved, ts: Math.round(Number(r.ts)) })) });
    } catch (e) { res.status(200).json({ items: [] }); }
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const message = String(b.message || '').slice(0, 4000).trim();
    const rating = b.rating ? parseInt(b.rating, 10) : null;
    // Pulse survey fields (from the recurring in-app prompt).
    const kind = (b.kind === 'pulse') ? 'pulse' : 'adhoc';
    const timeSaved = ['much_less', 'less', 'same', 'more'].includes(b.timeSaved) ? b.timeSaved : null;
    // A pulse response is valid even if it's only a time-saved answer (no rating/message);
    // the plain feedback button still needs at least a message or rating.
    if (!message && !rating && !timeSaved) { res.status(400).json({ error: 'Say a little about your experience.' }); return; }
    // Require a signed-in provider — this used to accept an anonymous (provider_id=null) write, so
    // anyone could POST rows and spam the feedback table.
    const p = claims(req);
    if (!p.u) { res.status(401).json({ error: 'Please sign in to send feedback.' }); return; }
    try {
      await ensureProvidersTable();
      const q = sql();
      // The SAME words from the same account inside ten minutes is a double tap (the inbox held two
      // copies of several reports). Keep one, and do not email Ashley twice. The caller still gets
      // ok, because the feedback IS saved.
      if (message) {
        const dup = await q`SELECT 1 FROM feedback WHERE provider_id = ${String(p.u)} AND message = ${message} AND ts > now() - interval '10 minutes' LIMIT 1`;
        if (dup.length) { res.status(200).json({ ok: true, duplicate: true }); return; }
      }
      await q`INSERT INTO feedback (provider_id, email, rating, message, kind, time_saved) VALUES (${p.u}, ${p.e || null}, ${rating}, ${message}, ${kind}, ${timeSaved})`;
      // Awaited on purpose: a serverless function is frozen after it responds, so a fire-and-forget
      // email may never leave (that is how the Build access email went missing).
      try { await notifyFounder(q, { providerId: String(p.u), email: (p.e ? String(p.e).toLowerCase() : await resolveEmail(req, q)), rating, message, kind, timeSaved }); } catch (e) {}
      res.status(200).json({ ok: true });
    } catch (e) {
      // Used to answer 200 {ok:false}, which the app read as "sent" — a provider was thanked for
      // feedback that was never saved. A failure is now a failure, so the app asks them to retry.
      console.error('[feedback] save failed:', e && e.message || e);
      res.status(500).json({ ok: false, error: 'Couldn\u2019t save that just now. Please try again.' });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}
