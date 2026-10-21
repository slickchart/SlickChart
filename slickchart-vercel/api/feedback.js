// POST /api/feedback  { message, rating?, kind?, timeSaved? }  → logs a provider's beta feedback
//   kind:'pulse' + timeSaved come from the recurring pulse survey; the plain
//   feedback button sends neither and is stored as kind='adhoc'.
// GET  /api/feedback                          → owner-only: recent feedback { items }
// GET  /api/feedback?since=<ms>  Authorization: Monitor <key>
//                                             → the same list, read-only, for Ashley's daily brief in
//                                               Claude (a scheduled run cannot sign in). See monitorKeyOk.
// POST /api/feedback { action:'monitor-key' }  → owner-only: make that key (replaces any earlier one)
// POST /api/feedback { action:'monitor-off' }  → owner-only: switch the key off
//
// Every new piece of written feedback is EMAILED (and pushed) to the founder the moment it lands.
// Until 2026-10-21 it only went into the table behind the in-app Feedback Inbox, with no alert of
// any kind, and Ashley found a month of provider reports (broken forms, missing clients) she had
// never been told about. Same pattern as the signup ping: awaited, never blocks the save, and a
// notify_log row either way so a missed alert can be traced.
import crypto from 'crypto';
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken, signToken, sessionOk } from '../lib/auth.js';
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

// The daily feedback brief in Claude reads the inbox with a key Ashley copies once from the Feedback
// Inbox screen. It is a signed token scoped k:'fbmon' (verifyToken rejects it everywhere else, and
// sessionFromReq refuses any scoped token), it carries the OWNER's email, and its nonce must match the
// one row in feedback_monitor, so making a new key or switching it off kills the old one at once. It
// reads this one list and nothing else: no client data, no other endpoint.
async function ensureMonitorTable(q) {
  await q`CREATE TABLE IF NOT EXISTS feedback_monitor (owner_email text PRIMARY KEY, nonce text NOT NULL, created_at timestamptz DEFAULT now(), last_used timestamptz)`;
}
async function monitorKeyOk(req, q, owner) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Monitor ') ? h.slice(8) : '';
  const p = s && t ? verifyToken(t, s, { scope: 'fbmon' }) : null;
  if (!p || p.k !== 'fbmon' || !p.n || !owner || String(p.e || '').toLowerCase() !== owner) return false;
  await ensureMonitorTable(q);
  const r = await q`SELECT nonce, last_used FROM feedback_monitor WHERE owner_email = ${owner}`;
  if (!r.length || r[0].nonce !== p.n) return false;
  try { await q`UPDATE feedback_monitor SET last_used = now() WHERE owner_email = ${owner}`; } catch (e) {}
  return true;
}
function isMonitorReq(req) { return String(req.headers['authorization'] || '').startsWith('Monitor '); }

export default async function handler(req, res) {
  if (!(await sessionOk(req))) { res.status(401).json({ error: 'This session has been signed out. Please log in again.' }); return; }
  if (!dbEnabled()) {
    if (isMonitorReq(req)) { res.status(503).json({ error: 'database not configured' }); return; }
    res.status(200).json(req.method === 'GET' ? { items: [] } : { ok: true, skipped: true }); return;
  }

  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (req.method === 'GET') {
    const mon = isMonitorReq(req);
    try {
      await ensureProvidersTable();
      const q = sql();
      if (mon) {
        if (!(await monitorKeyOk(req, q, owner))) { res.status(403).json({ error: 'This key is switched off. Copy a new one from Feedback Inbox.' }); return; }
      } else {
        const you = await resolveEmail(req, q);
        if (!owner || you !== owner) { res.status(403).json({ error: 'Owner only' }); return; }
      }
      // The owner screen also reads whether the brief's key is on, and when it last read the inbox.
      let monitor;
      if (!mon) { try { await ensureMonitorTable(q); const m = await q`SELECT extract(epoch from created_at) * 1000 AS c, extract(epoch from last_used) * 1000 AS u FROM feedback_monitor WHERE owner_email = ${owner}`; monitor = m.length ? { on: true, created: Math.round(Number(m[0].c)), lastUsed: m[0].u ? Math.round(Number(m[0].u)) : 0 } : { on: false }; } catch (e) {} }
      const since = Math.max(0, Number((req.query && req.query.since) || 0) || 0);
      const rows = await q`SELECT f.id, f.rating, f.message, f.email, f.kind, f.time_saved, extract(epoch from f.ts) * 1000 AS ts, p.name
        FROM feedback f LEFT JOIN providers p ON p.id = f.provider_id
        WHERE f.ts > to_timestamp(${since / 1000}) ORDER BY f.ts DESC LIMIT 200`;
      res.status(200).json({ items: rows.map(r => ({ id: String(r.id), rating: r.rating, message: r.message, email: r.email, name: r.name || '', kind: r.kind, timeSaved: r.time_saved, ts: Math.round(Number(r.ts)) })), monitor });
    } catch (e) {
      // The brief must SAY it could not read, never report "no new feedback" over a failure.
      if (mon) res.status(500).json({ error: 'read failed' }); else res.status(200).json({ items: [] });
    }
    return;
  }

  if (req.method === 'POST' && req.body && (req.body.action === 'monitor-key' || req.body.action === 'monitor-off')) {
    try {
      await ensureProvidersTable();
      const q = sql();
      const p = claims(req);
      const you = await resolveEmail(req, q);
      if (!p.u || !owner || you !== owner) { res.status(403).json({ error: 'Owner only' }); return; }
      await ensureMonitorTable(q);
      if (req.body.action === 'monitor-off') {
        await q`DELETE FROM feedback_monitor WHERE owner_email = ${owner}`;
        res.status(200).json({ ok: true, off: true });
        return;
      }
      const nonce = crypto.randomBytes(18).toString('base64url');
      await q`INSERT INTO feedback_monitor (owner_email, nonce) VALUES (${owner}, ${nonce})
        ON CONFLICT (owner_email) DO UPDATE SET nonce = EXCLUDED.nonce, created_at = now(), last_used = NULL`;
      const key = signToken({ k: 'fbmon', e: owner, n: nonce }, process.env.SESSION_SECRET || '', 60 * 60 * 24 * 365 * 3);
      res.status(200).json({ ok: true, key });
    } catch (e) { res.status(500).json({ error: 'Could not make a key just now. Please try again.' }); }
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
