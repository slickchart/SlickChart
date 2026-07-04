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
  _html = fs.readFileSync(path.join(process.cwd(), 'slickchart-client.html'), 'utf8');
  return _html;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function handler(req, res) {
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
}
