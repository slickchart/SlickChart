// Provider-authed: email each selected client (or all with an email on file) their
// own personal link. Uses Resend via lib/email.js. Marks who was invited.
import { verifyToken } from '../lib/auth.js';
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, listClients, markInvited } from '../lib/clients.js';
import { sendEmail, appOrigin } from '../lib/email.js';

function providerId(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const c = (s && t) ? verifyToken(t, s) : null;
  return c && c.u;
}
function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m])); }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: false }); return; }
  const provider = providerId(req);
  if (!provider) { res.status(401).json({ error: 'Not signed in' }); return; }
  await ensureClientTables();
  const body = req.body || {};
  const ids = Array.isArray(body.ids) ? body.ids : null; // null = everyone with an email
  const origin = (body.origin || appOrigin(req) || 'https://slick-chart.vercel.app').replace(/\/$/, '');
  const studio = String(body.studio || '').trim();
  const fromName = String(body.from || 'Your provider').trim();
  try {
    const all = await listClients(provider);
    const targets = all.filter(c => c.email && (!ids || ids.includes(c.id)));
    const results = await Promise.allSettled(targets.map(async (c) => {
      const link = origin + '/client/' + encodeURIComponent(c.token);
      const first = esc((c.name || 'there').split(' ')[0]);
      const who = esc(fromName) + (studio ? (' at ' + esc(studio)) : '');
      const subject = studio ? ('Your space at ' + studio) : 'Your client app is ready';
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px;color:#1a1a1a;">
        <div style="background:#14100c;border-radius:14px;padding:22px;text-align:center;color:#f4ede2;">
          <div style="font-size:20px;font-weight:700;margin-bottom:6px;">${studio ? esc(studio) : 'SlickChart'}</div>
          <div style="font-size:13px;color:#a99b86;">Your personal client space</div>
        </div>
        <p style="font-size:15px;line-height:1.6;">Hi ${first},</p>
        <p style="font-size:15px;line-height:1.6;">${who} set up a private space just for you. See your visit summaries, aftercare, forms, and rebook anytime, all in one place. No app store, no download.</p>
        <p style="text-align:center;margin:26px 0;"><a href="${link}" style="background:#cd9a52;color:#1a1206;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:10px;display:inline-block;">Open your app</a></p>
        <p style="font-size:12px;color:#888;line-height:1.6;">This link is private and just for you. Please don't share it. If you weren't expecting this, you can ignore this email.</p>
      </div>`;
      const text = `Hi ${(c.name || 'there').split(' ')[0]}, ${fromName}${studio ? (' at ' + studio) : ''} set up your personal client space. Open it: ${link}`;
      await sendEmail({ to: c.email, subject, html, text });
    }));
    const sent = results.filter(r => r.status === 'fulfilled').length;
    await markInvited(provider, targets.map(c => c.id));
    res.status(200).json({ ok: true, sent, total: targets.length, noEmail: all.length - targets.length });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}
