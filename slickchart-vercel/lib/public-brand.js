// Shared branding for the two public, no-login pages: /book/<slug> and /consult/<slug>.
//
// Someone who lands on one of these has never seen SlickChart and never will — as far as they are
// concerned this page IS her business. So it carries what she set up in Business & Branding: her
// logo, both of her brand colours, her tagline. One module, because the two pages are meant to look
// like one product and two copies of this would quietly drift apart.
//
// ISOLATION (CLAUDE.md §0): reads ONE provider's branding by the providerId the caller resolved from
// the slug. Nothing here takes an id from a request, and nothing but her public-facing branding is
// read or returned.
import { getKVValue } from './db.js';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function hex(c, fb) {
  c = String(c == null ? '' : c).trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(c)) return c[0] === '#' ? c : ('#' + c);
  if (/^#?[0-9a-fA-F]{3}$/.test(c)) { const x = c.replace('#', ''); return '#' + x[0] + x[0] + x[1] + x[1] + x[2] + x[2]; }
  return fb;
}
export function normUrl(u) { u = String(u || '').trim(); if (!u) return ''; return /^https?:\/\//i.test(u) ? u : ('https://' + u); }
export function initialsOf(n) {
  const p = String(n || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}
// Readable text ON her accent. A provider with a pale brand colour was getting white on cream;
// this is the same luminance test the app itself uses so the two agree.
export function inkOn(h) {
  const x = String(h || '').replace('#', '');
  const r = parseInt(x.slice(0, 2), 16), g = parseInt(x.slice(2, 4), 16), b = parseInt(x.slice(4, 6), 16);
  if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return '#ffffff';
  return ((r * 299 + g * 587 + b * 114) / 1000) >= 140 ? '#181410' : '#ffffff';
}
function rgb(h) {
  const x = String(h || '').replace('#', '');
  const r = parseInt(x.slice(0, 2), 16), g = parseInt(x.slice(2, 4), 16), b = parseInt(x.slice(4, 6), 16);
  return (isFinite(r) && isFinite(g) && isFinite(b)) ? [r, g, b] : null;
}
function lum(c) { return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 / 255; }
function toHex(c) { return '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
// Her accent as READABLE TEXT on a page background. A pale brand colour was putting her own website
// link in cream-on-cream; this walks the colour toward black (or toward white on the dark theme)
// until it can actually be read, and leaves a colour that already contrasts completely alone.
export function accentText(h, onDark) {
  let c = rgb(h); if (!c) return onDark ? '#ffffff' : '#1a1a1a';
  for (let i = 0; i < 12; i++) {
    const L = lum(c);
    if (onDark ? L >= 0.42 : L <= 0.52) break;
    c = onDark ? c.map(v => v + (255 - v) * 0.18) : c.map(v => v * 0.86);
  }
  return toHex(c);
}

// Her logo, only from the two shapes the app can produce. Anything else is dropped rather than put
// in a src="" — a `data:text/html` logo would be a script running on her own booking page.
export function logoSrc(u) {
  u = String(u || '').trim();
  if (!u || u.length > 1200000) return '';
  if (!/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(u) && !/^https:\/\//i.test(u)) return '';
  return u.replace(/["'<>\s]/g, m => encodeURIComponent(m));
}

// Everything the public pages need about how she wants to look. One provider, resolved by the
// caller from the slug.
export async function readBrand(providerId, fallbackName, defaultAccent) {
  let biz = {}, brand = {};
  try { const raw = await getKVValue(providerId, 'sc_bizinfo'); if (raw) biz = JSON.parse(raw) || {}; } catch (e) { biz = {}; }
  try { const raw = await getKVValue(providerId, 'sc_brand_colors'); if (raw) brand = JSON.parse(raw) || {}; } catch (e) { brand = {}; }
  if (!biz || typeof biz !== 'object') biz = {};
  if (!brand || typeof brand !== 'object') brand = {};
  const accent = hex(brand.primary, defaultAccent || '#2BC7AC');
  return {
    name: String(biz.name || fallbackName || '').trim(),
    site: normUrl(biz.website),
    accent,
    accent2: hex(brand.secondary, accent),
    ink: inkOn(accent),
    accentText: accentText(accent, false),
    accentTextDark: accentText(accent, true),
    logo: logoSrc(brand.logoDataUrl),
    tagline: String(brand.tagline || '').slice(0, 140).trim()
  };
}

// The custom properties both pages theme themselves from.
export function brandVars(b) {
  return `--accent:${esc(b.accent)};--accent2:${esc(b.accent2)};--accent-ink:${esc(b.ink)};`
    + `--accent-text:${esc(b.accentText || b.accent)};--accent-text-d:${esc(b.accentTextDark || b.accent)};`;
}
// Her mark and her name, at the top of the page. The logo replaces the initials square when she has
// uploaded one; the square keeps her colours either way.
export function brandRowHtml(b) {
  const mark = b.logo
    ? `<div class="avatar logo"><img src="${esc(b.logo)}" alt="${esc(b.name)}"></div>`
    : `<div class="avatar">${esc(initialsOf(b.name))}</div>`;
  const site = b.site
    ? `<div class="web"><a href="${esc(b.site)}" target="_blank" rel="noopener">${esc(b.site.replace(/^https?:\/\//, ''))}</a></div>`
    : '';
  const tag = b.tagline ? `<div class="tag">${esc(b.tagline)}</div>` : '';
  return `<div class="brandrow">${mark}<div><div class="biz">${esc(b.name)}</div>${tag}${site}</div></div>`;
}
// The styling those two bring with them. Appended to each page's own stylesheet so the pages stay
// free to differ elsewhere.
export const BRAND_CSS = `
.brandrow{display:flex;align-items:center;gap:11px;margin-bottom:22px;}
.avatar{width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;flex-shrink:0;overflow:hidden;}
.avatar.logo{background:#fff;border:1px solid rgba(0,0,0,.07);}
.avatar.logo img{width:100%;height:100%;object-fit:contain;padding:5px;}
.biz{font-size:17px;font-weight:700;line-height:1.2;}
.tag{font-size:12px;color:#6b5d52;margin-top:2px;line-height:1.35;}
.web{font-size:12px;color:#8a7a6c;margin-top:2px;}
.web a{color:var(--accent-text);text-decoration:none;}
@media (prefers-color-scheme:dark){.tag,.web{color:#b3a596;}.web a{color:var(--accent-text-d);}}
`;
