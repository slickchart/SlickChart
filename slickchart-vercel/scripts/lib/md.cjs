#!/usr/bin/env node
/* The small markdown subset shared by the blog and the switching guides.
 *
 * Deliberately small, and everything is escaped BEFORE any tag is introduced, so page copy can never
 * inject markup. Shared so both generators render identically.
 */
const { esc, SITE } = require('./site-chrome.cjs');


// ── markdown subset → HTML ─────────────────────────────────────────────────
// Deliberately small: headings, paragraphs, lists, blockquotes, and inline
// bold/italic/link/code. Everything is escaped BEFORE any tag is introduced,
// so post copy can never inject markup.
function inline(t) {
  return esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) =>
      `<a href="${esc(href)}"${/^https?:\/\//.test(href) && !href.startsWith(SITE) ? ' rel="noopener"' : ''}>${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}
function markdown(src) {
  const out = [];
  const blocks = src.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) continue;
    if (/^###\s+/.test(lines[0]) && lines.length === 1) { out.push('<h3>' + inline(lines[0].replace(/^###\s+/, '')) + '</h3>'); continue; }
    if (/^##\s+/.test(lines[0]) && lines.length === 1) { out.push('<h2>' + inline(lines[0].replace(/^##\s+/, '')) + '</h2>'); continue; }
    if (lines.every(l => /^\s*-\s+/.test(l))) {
      out.push('<ul>' + lines.map(l => '<li>' + inline(l.replace(/^\s*-\s+/, '')) + '</li>').join('') + '</ul>'); continue;
    }
    if (lines.every(l => /^\s*\d+\.\s+/.test(l))) {
      out.push('<ol>' + lines.map(l => '<li>' + inline(l.replace(/^\s*\d+\.\s+/, '')) + '</li>').join('') + '</ol>'); continue;
    }
    if (lines.every(l => /^\s*>\s?/.test(l))) {
      out.push('<blockquote><p>' + inline(lines.map(l => l.replace(/^\s*>\s?/, '')).join(' ')) + '</p></blockquote>'); continue;
    }
    out.push('<p>' + inline(lines.join(' ')) + '</p>');
  }
  return out.join('\n');
}

module.exports = { inline, markdown };
