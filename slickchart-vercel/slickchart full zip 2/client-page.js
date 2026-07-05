// Serves slickchart-client.html but swaps the static "Maya Rodriguez" placeholder
// title/link-preview for the real client's name (looked up by their token), so
// texts/emails/RCS previews show the actual client, not the demo name.
import fs from 'fs';
import path from 'path';
import { dbEnabled } from '../lib/db.js';
import { getClientByToken } from '../lib/clients.js';

let _html = null;
function loadHtml() {
  if (_html) return _html;
  const candidates = [
    path.join(process.cwd(), 'slickchart-client.html'),
    path.join(__dirname, '..', 'slickchart-client.html'),
    path.join(__dirname, 'slickchart-client.html'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) { _html = fs.readFileSync(p, 'utf8'); return _html; }
    } catch (e) { /* try the next candidate */ }
  }
  throw new Error('slickchart-client.html could not be found in any expected location: ' + candidates.join(', '));
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function handler(req, res) {
  try {
    let html = loadHtml();
    const token = (req.query && (req.query.token || req.query.c)) || '';
    let name = '';
    try {
      if (token && dbEnabled()) {
        const c = await getClientByToken(String(token));
        if (c && c.name) name = c.name;
      }
    } catch (e) { /* fall back to generic title below */ }

    const first = name ? name.split(' ')[0] : '';
    const title = name ? `SlickChart \u2014 ${esc(name)}` : `SlickChart \u2014 You're invited`;
    const desc = name
      ? `${esc(first)}'s visit summary, aftercare, and appointments.`
      : `View your visit summary, aftercare, and appointments.`;

    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
    const ogTags = `<meta property="og:title" content="${title}">\n<meta property="og:description" content="${desc}">\n<meta property="og:type" content="website">\n<meta name="twitter:card" content="summary">`;
    html = html.replace('<meta name="theme-color" content="#c8a882">', `<meta name="theme-color" content="#c8a882">\n${ogTags}`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(html);
  } catch (e) {
    console.error('[client-page] failed:', e && e.message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(500).send('<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#333;"><h2>This link is having trouble loading</h2><p>Please try again in a moment, or ask your provider to resend it.</p></body></html>');
  }
}
