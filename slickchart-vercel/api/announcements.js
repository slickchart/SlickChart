// GET  /api/announcements            → { items, canPost, you, ownerSet }
// POST /api/announcements {title,body,notify} → owner-only (provider email === OWNER_EMAIL) publish.
//   Also pushes it to every provider's phone and browser unless notify === false (2026-10-23).
// The same POST/GET with `Authorization: Monitor <key>` (her feedback-brief key, api/feedback.js
//   monitorKeyOk) lets Claude post one she asked for (Ashley, 2026-10-31: "yes please build that").
//   It goes to every provider's phone, so: at most 3 a day this way, marked source='claude', and
//   every one is emailed to her the moment it goes up, so a post she did not expect cannot go unseen.
import { sql, ensureProvidersTable, dbEnabled } from '../lib/db.js';
import { verifyToken, sessionOk } from '../lib/auth.js';
import { pushAnnouncementToProviders } from '../lib/announce-push.js';
import { monitorKeyOk } from './feedback.js';
import { sendEmail } from '../lib/email.js';

const MONITOR_POSTS_PER_DAY = 3;
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function founderNotifyTo() {
  return String(process.env.FOUNDER_NOTIFY_EMAIL || process.env.FOUNDER_EMAILS || 'botanicalaestheticsbyashley@gmail.com').split(',')[0].trim();
}

// Resolve the logged-in provider's email. Prefer the token's email claim, but
// fall back to a DB lookup by provider id so older tokens (minted before the
// email claim existed) still work.
async function resolveEmail(req, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = secret && t ? verifyToken(t, secret) : null;
  if (!p || !p.u) return null;
  if (p.e) return String(p.e).toLowerCase();
  try {
    const r = await q`SELECT email FROM providers WHERE id = ${p.u}`;
    return (r[0] && r[0].email) ? String(r[0].email).toLowerCase() : null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (!(await sessionOk(req))) { res.status(401).json({ error: 'This session has been signed out. Please log in again.' }); return; }
  if (!dbEnabled()) { res.status(200).json({ items: [], canPost: false, you: null, ownerSet: false }); return; }
  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  try {
    await ensureProvidersTable();
    const q = sql();
    const mon = String(req.headers['authorization'] || '').startsWith('Monitor ');
    let viaKey = false;
    if (mon) { try { viaKey = await monitorKeyOk(req, q, owner); } catch (e) { viaKey = false; } if (!viaKey) { res.status(403).json({ error: 'This key is switched off.' }); return; } }
    const you = viaKey ? owner : await resolveEmail(req, q);
    const isOwner = !!owner && you === owner;
    if (req.method === 'POST') {
      if (!isOwner) { res.status(403).json({ error: 'Only the owner can post updates.' }); return; }
      await q`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS source text`;
      if (viaKey) {
        const n = await q`SELECT count(*)::int AS n FROM announcements WHERE source = 'claude' AND ts > now() - interval '24 hours'`;
        if (n[0] && n[0].n >= MONITOR_POSTS_PER_DAY) { res.status(429).json({ error: 'Already ' + MONITOR_POSTS_PER_DAY + ' posts from Claude today. Post from the app instead.' }); return; }
      }
      const b = req.body || {};
      const title = String(b.title || '').slice(0, 140).trim();
      const body = String(b.body || '').slice(0, 4000).trim();
      if (!title) { res.status(400).json({ error: 'Add a title.' }); return; }
      // A double tap must not post twice or push every provider twice.
      const dup = await q`SELECT id FROM announcements WHERE title = ${title} AND body = ${body} AND ts > now() - interval '10 minutes' LIMIT 1`;
      if (dup.length) { res.status(200).json({ ok: true, duplicate: true }); return; }
      await q`INSERT INTO announcements (title, body, source) VALUES (${title}, ${body}, ${viaKey ? 'claude' : 'owner'})`;
      if (viaKey) {
        try {
          await sendEmail({ to: founderNotifyTo(), subject: 'Claude posted a What\u2019s new update: ' + title,
            text: 'This went up on the What\u2019s new board just now and was sent to every provider.\n\n' + title + '\n\n' + body + '\n\nIf you did not ask for this, tap Switch off on the daily brief key in Feedback Inbox so nothing else can be posted.',
            html: '<p>This went up on the What\u2019s new board just now and was sent to every provider.</p><p><b>' + escHtml(title) + '</b></p><p style="white-space:pre-wrap">' + escHtml(body) + '</p><p>If you did not ask for this, tap Switch off on the daily brief key in Feedback Inbox so nothing else can be posted.</p>' });
        } catch (e) {}
      }
      let push = null;
      if (b.notify !== false) { try { push = await pushAnnouncementToProviders(title, body); } catch (e) { push = { error: 'push failed' }; } }
      res.status(200).json({ ok: true, push });
      return;
    }
    const rows = await q`SELECT id, title, body, extract(epoch from ts) * 1000 AS ts FROM announcements ORDER BY ts DESC LIMIT 50`;
    res.status(200).json({
      items: rows.map(r => ({ id: Number(r.id), title: r.title, body: r.body, ts: Math.round(Number(r.ts)) })),
      canPost: isOwner, you: you || null, ownerSet: !!owner
    });
  } catch (e) {
    // A failed POST must read as failed (Claude posts unattended and would otherwise report it as up).
    if (req.method === 'POST') { res.status(500).json({ error: 'Could not post just now. Please try again.' }); return; }
    res.status(200).json({ items: [], canPost: false, you: null, ownerSet: false });
  }
}
