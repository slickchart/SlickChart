#!/usr/bin/env node
/* Build the SlickChart blog.
 *
 * Sources:  blog-src/<slug>.md   — frontmatter + a small markdown subset
 * Outputs:  blog/index.html      — the blog index      (served at /blog)
 *           blog/<slug>.html     — one page per post   (served at /blog/<slug>)
 *           sitemap.xml          — regenerated to include every public page
 *
 * Run from slickchart-vercel/:  node scripts/build-blog.cjs
 *
 * Adding a post = drop a new .md in blog-src/ and re-run this. The SEO head
 * (canonical, Open Graph, Twitter, JSON-LD Article + breadcrumbs) and the
 * sitemap entry are generated, so a new post can't ship half-optimised.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'blog-src');
const OUT = path.join(ROOT, 'blog');
const SITE = 'https://slickchart.app';
const TITLE_SUFFIX = ' | SlickChart';

// Static pages that belong in the sitemap alongside the blog.
const STATIC_PAGES = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/blog', priority: '0.8', changefreq: 'weekly' },
  { loc: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
  { loc: '/support', priority: '0.4', changefreq: 'monthly' }
];

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── frontmatter ────────────────────────────────────────────────────────────
function parse(raw, slug) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(slug + ': missing --- frontmatter block');
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i < 0) throw new Error(slug + ': bad frontmatter line: ' + line);
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ['title', 'description', 'date']) {
    if (!meta[k]) throw new Error(slug + ': frontmatter is missing "' + k + '"');
  }
  // `title` is the SEO <title> and must stay short — Google truncates around 60 characters once the
  // " | SlickChart" suffix is on, and a cut-off title reads badly in results. `h1` is optional and is
  // what shows on the page, so a heading can be more descriptive than the title tag. Enforced here so
  // a future post can't quietly ship over-long.
  const full = meta.title + TITLE_SUFFIX;
  if (full.length > 60) throw new Error(slug + ': title is ' + full.length + ' chars with the suffix (max 60): "' + full + '"');
  if (meta.description.length > 160) throw new Error(slug + ': description is ' + meta.description.length + ' chars (max 160)');
  if (meta.description.length < 70) throw new Error(slug + ': description is only ' + meta.description.length + ' chars (aim for 110-160)');
  if (!meta.h1) meta.h1 = meta.title;
  return { meta, body: m[2] };
}

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

const readTime = body => Math.max(1, Math.round(body.split(/\s+/).length / 210)) + ' min read';
const pretty = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// ── shared page chrome ─────────────────────────────────────────────────────
const CSS = `
:root{--bg:#050f10;--bg2:#020909;--panel:#0e1f1d;--line:#20423c;--ink:#eaf6f4;--muted:#a2beb9;--muted2:#7a948f;
--gold:#2bc7ac;--green:#5fd99f;--edge:rgba(43,199,172,.2);
--opal-btn:linear-gradient(135deg,#19b8bf 0%,#2bc7a2 52%,#6fdca6 100%);}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.75 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:720px;margin:0 auto;padding:0 22px}
header.site{border-bottom:1px solid var(--line);background:var(--bg2)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-top:16px;padding-bottom:16px}
.brand{display:flex;align-items:center;gap:9px;font:600 18px Inter,sans-serif;color:var(--ink);text-decoration:none}
.brand img{width:28px;height:28px}
.brandc{color:var(--gold)}
.cta{background:var(--opal-btn);color:#03201e;font-weight:600;font-size:14px;padding:9px 16px;border-radius:999px;text-decoration:none;white-space:nowrap}
main{padding:44px 0 20px}
h1{font:600 clamp(28px,5vw,40px)/1.25 Fraunces,Georgia,serif;margin:0 0 14px;letter-spacing:-.01em}
h2{font:600 clamp(21px,3.4vw,27px)/1.35 Fraunces,Georgia,serif;margin:38px 0 12px}
h3{font:600 18px/1.4 Inter,sans-serif;margin:28px 0 8px;color:var(--green)}
p{margin:0 0 18px;color:#dbeae7}
a{color:var(--gold)}
ul,ol{margin:0 0 18px;padding-left:22px;color:#dbeae7}
li{margin-bottom:9px}
code{background:var(--panel);border:1px solid var(--edge);border-radius:5px;padding:1px 6px;font-size:.9em}
blockquote{margin:22px 0;padding:14px 18px;border-left:3px solid var(--gold);background:var(--panel);border-radius:0 10px 10px 0}
blockquote p{margin:0;color:var(--ink)}
.meta{color:var(--muted2);font-size:14px;margin:0 0 30px}
.lede{font-size:19px;color:var(--muted);margin-bottom:26px}
.back{display:inline-block;font-size:14px;margin-bottom:26px;text-decoration:none}
.card{display:block;border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:20px 22px;margin-bottom:14px;text-decoration:none;transition:border-color .15s}
.card:hover{border-color:var(--gold)}
.card h2{font-size:21px;margin:0 0 7px;color:var(--ink);line-height:1.3}
.card p{margin:0 0 8px;color:var(--muted);font-size:15.5px}
.card .meta{margin:0;font-size:13px}
.endcta{margin:44px 0 10px;padding:24px;border:1px solid var(--edge);background:var(--panel);border-radius:14px;text-align:center}
.endcta p{margin:0 0 14px;color:var(--muted)}
footer{border-top:1px solid var(--line);background:var(--bg2);margin-top:50px;padding:30px 0}
footer .wrap{display:flex;flex-wrap:wrap;gap:10px 20px;align-items:center;justify-content:center}
footer a{color:var(--muted);font-size:14px;text-decoration:none}
footer a:hover{color:var(--gold)}
.tiny{width:100%;text-align:center;color:var(--muted2);font-size:12.5px;margin-top:6px}
`.trim();

const HEAD_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">';

const chromeHeader = `<header class="site"><div class="wrap">
  <a class="brand" href="/"><img src="/assets/slickchart-logo.png" alt="" width="28" height="28"><span>Slick<span class="brandc">Chart</span></span></a>
  <a class="cta" href="/slickchart">Open the app</a>
</div></header>`;

const chromeFooter = `<footer><div class="wrap">
  <a href="/">Home</a><a href="/blog">Blog</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
  <a href="mailto:support@slickchart.app">Contact</a>
  <div class="tiny">SlickChart &middot; Made for solo beauty &amp; wellness pros &middot; Pleasant Hill, CA</div>
</div></footer>`;

function head({ title, description, canonical, keywords, jsonld, ogType }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${keywords ? `<meta name="keywords" content="${esc(keywords)}">\n` : ''}<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="author" content="Ashley Watson, Botanical Aesthetics">
<meta name="theme-color" content="#0a1719">
<link rel="icon" href="/favicon.ico?v=3" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="SlickChart">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/assets/og-image-marine.jpg?v=4">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/assets/og-image-marine.jpg?v=4">
${HEAD_FONTS}
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
${chromeHeader}`;
}

// ── build ──────────────────────────────────────────────────────────────────
if (!fs.existsSync(SRC)) { console.error('No blog-src/ directory — nothing to build.'); process.exit(1); }
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.md')).sort();
if (!files.length) { console.error('blog-src/ has no .md posts.'); process.exit(1); }

const posts = files.map(f => {
  const slug = f.replace(/\.md$/, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(slug + ': slug must be lowercase letters, digits and hyphens');
  const { meta, body } = parse(fs.readFileSync(path.join(SRC, f), 'utf8'), slug);
  return { slug, meta, body, html: markdown(body), url: SITE + '/blog/' + slug };
}).sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));   // newest first

fs.mkdirSync(OUT, { recursive: true });

// One page per post
for (const p of posts) {
  const related = posts.filter(o => o.slug !== p.slug).slice(0, 2);
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [{
      '@type': 'BlogPosting',
      headline: p.meta.h1,
      description: p.meta.description,
      datePublished: p.meta.date,
      dateModified: p.meta.updated || p.meta.date,
      author: { '@type': 'Person', name: 'Ashley Watson' },
      publisher: { '@type': 'Organization', name: 'SlickChart', logo: { '@type': 'ImageObject', url: SITE + '/icon-512.png' } },
      mainEntityOfPage: { '@type': 'WebPage', '@id': p.url },
      image: SITE + '/assets/og-image-marine.jpg',
      inLanguage: 'en-US'
    }, {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog' },
        { '@type': 'ListItem', position: 3, name: p.meta.h1, item: p.url }
      ]
    }]
  };
  const html = head({
    title: p.meta.title + TITLE_SUFFIX, description: p.meta.description, canonical: p.url,
    keywords: p.meta.keywords, jsonld, ogType: 'article'
  })
    + `\n<main><div class="wrap">
<a class="back" href="/blog">&larr; All posts</a>
<article>
<h1>${esc(p.meta.h1)}</h1>
<p class="meta">${esc(pretty(p.meta.date))} &middot; ${esc(readTime(p.body))}</p>
${p.html}
</article>
<div class="endcta">
  <p>SlickChart is the charting and client app built for solo estheticians &mdash; notes, photos, forms and payments in one place.</p>
  <a class="cta" href="/slickchart">Try SlickChart free</a>
</div>
${related.length ? `<h2>Keep reading</h2>\n` + related.map(r =>
      `<a class="card" href="/blog/${r.slug}"><h2>${esc(r.meta.h1)}</h2><p>${esc(r.meta.description)}</p></a>`).join('\n') : ''}
</div></main>\n${chromeFooter}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(OUT, p.slug + '.html'), html);
}

// Index
const indexJsonld = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'The SlickChart Blog',
  description: 'Practical guides for solo estheticians on charting, client care, and running the business side.',
  url: SITE + '/blog',
  publisher: { '@type': 'Organization', name: 'SlickChart', url: SITE },
  blogPost: posts.map(p => ({ '@type': 'BlogPosting', headline: p.meta.h1, description: p.meta.description, datePublished: p.meta.date, url: p.url }))
};
fs.writeFileSync(path.join(OUT, 'index.html'), head({
  title: 'The SlickChart Blog | Guides for solo estheticians',
  description: 'Practical guides for solo estheticians: client charting and SOAP notes, consent forms, pricing, rebooking, and running a one-person treatment room.',
  canonical: SITE + '/blog',
  keywords: 'esthetician blog, solo esthetician, esthetician software, esthetician app, esthetician business tips',
  jsonld: indexJsonld, ogType: 'website'
})
  + `\n<main><div class="wrap">
<h1>The SlickChart Blog</h1>
<p class="lede">Practical guides for solo estheticians &mdash; charting, client care, and the unglamorous business bits that keep a one-person treatment room running.</p>
${posts.map(p => `<a class="card" href="/blog/${p.slug}">
  <h2>${esc(p.meta.h1)}</h2>
  <p>${esc(p.meta.description)}</p>
  <p class="meta">${esc(pretty(p.meta.date))} &middot; ${esc(readTime(p.body))}</p>
</a>`).join('\n')}
</div></main>\n${chromeFooter}\n</body>\n</html>\n`);

// Sitemap — static pages + every post, so a new post is never orphaned.
const today = new Date().toISOString().slice(0, 10);
const urls = STATIC_PAGES.map(s => `  <url>\n    <loc>${SITE}${s.loc}</loc>\n    <changefreq>${s.changefreq}</changefreq>\n    <priority>${s.priority}</priority>\n  </url>`)
  .concat(posts.map(p => `  <url>\n    <loc>${p.url}</loc>\n    <lastmod>${p.meta.updated || p.meta.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`));
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);

console.log('built blog/index.html + ' + posts.length + ' posts, and sitemap.xml (' + urls.length + ' urls)');
posts.forEach(p => console.log('  /blog/' + p.slug + '  — ' + p.meta.title));
