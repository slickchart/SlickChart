// Provider-authed: email each selected client (or all with an email on file) their
// own personal link. Uses Resend via lib/email.js. Marks who was invited.
import { verifyToken } from '../lib/auth.js';
import { dbEnabled } from '../lib/db.js';
import { ensureClientTables, listClients, markInvited } from '../lib/clients.js';
import { sendEmail, trustedOrigin } from '../lib/email.js';

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
  // The provider's app passes its own location.origin so invites point at the domain they use;
  // validate it's a clean http(s) origin and fall back to our controlled origin (never a request
  // header) so a client's token-bearing invite link can't be pointed at an arbitrary host.
  const _bodyOrigin = String(body.origin || '').trim().replace(/\/+$/, '');
  const origin = /^https?:\/\/[^/\s]+$/i.test(_bodyOrigin) ? _bodyOrigin : trustedOrigin();
  const studio = String(body.studio || '').trim();
  const fromName = String(body.from || 'Your provider').trim();
  try {
    const all = await listClients(provider);
    const targets = all.filter(c => c.email && (!ids || ids.includes(c.id)));
    const results = await Promise.allSettled(targets.map(async (c) => {
      const link = origin + '/client?c=' + encodeURIComponent(c.token);
      const first = esc((c.name || 'there').split(' ')[0]);
      const who = esc(fromName) + (studio ? (' at ' + esc(studio)) : '');
      const subject = studio ? ('Your space at ' + studio) : 'Your client app is ready';
      const ASSETS = 'https://slickchart.app/assets';
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px;color:#1a1a1a;">
        <div style="background:linear-gradient(160deg,#0e2b2b 0%,#0a1719 55%,#07130f 100%);background-color:#0a1719;border-radius:16px;padding:30px 22px 26px;text-align:center;color:#eaf6f4;border:1px solid #16332f;">
          <img src="${ASSETS}/slickchart-logo.png" width="60" height="60" alt="" style="display:inline-block;margin:0 0 12px;">
          <div style="font-size:21px;font-weight:700;letter-spacing:-.01em;margin-bottom:5px;">${studio ? esc(studio) : 'SlickChart'}</div>
          <div style="font-size:13px;color:#8fd7c4;letter-spacing:.02em;">Your personal client space</div>
        </div>
        <p style="font-size:15px;line-height:1.7;margin:22px 4px 0;">Hi ${first},</p>
        <p style="font-size:15px;line-height:1.7;margin:12px 4px;color:#2c3a36;">${who} set up a private space just for you. See your visit summaries, aftercare, forms, and rebook anytime, all in one place. No app store, no download.</p>
        <p style="text-align:center;margin:26px 0;"><a href="${link}" style="background:linear-gradient(135deg,#19b8bf 0%,#2bc7a2 52%,#6fdca6 100%);background-color:#26c1b0;color:#03201e;text-decoration:none;font-weight:700;padding:14px 30px;border-radius:11px;display:inline-block;font-size:15px;box-shadow:0 8px 22px -10px rgba(43,199,172,.6);">Open your app &rarr;</a></p>
        <p style="font-size:12px;color:#8a9a94;line-height:1.6;margin:0 4px;">This link is private and just for you. Please don't share it. If you weren't expecting this, you can ignore this email.</p>
        <div style="border-top:1px solid #e2ece8;margin:24px 4px 0;padding-top:16px;text-align:center;">
          <a href="https://slickchart.app" style="text-decoration:none;display:inline-block;"><img src="${ASSETS}/wordmark-light.png" height="18" alt="SlickChart" style="height:18px;opacity:.75;vertical-align:middle;"></a>
          <div style="font-size:11px;color:#a2b4ae;margin-top:6px;">Client charting &amp; care, powered by SlickChart</div>
        </div>
      </div>`;
      const text = `Hi ${(c.name || 'there').split(' ')[0]}, ${fromName}${studio ? (' at ' + studio) : ''} set up your personal client space. Open it: ${link}`;
      await sendEmail({ to: c.email, subject, html, text });
    }));
    // Only mark clients whose email actually went out (results are index-aligned with targets).
    // A failed/bounced send must NOT show as "invited," or the provider thinks someone was
    // notified when they weren't and never knows to resend.
    const invitedIds = targets.filter((c, i) => results[i] && results[i].status === 'fulfilled').map(c => c.id);
    const sent = invitedIds.length;
    const failed = targets.length - sent;
    if (invitedIds.length) await markInvited(provider, invitedIds);
    res.status(200).json({ ok: true, sent, failed, invitedIds, total: targets.length, noEmail: all.length - targets.length });
  } catch (e) { console.error('[client-invite] failed:', e && e.stack || e); res.status(e.status || 500).json({ error: 'Something went wrong. Please try again.' }); }
}
