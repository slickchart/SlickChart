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
const { SITE, TITLE_SUFFIX, esc, chromeFooter, head } = require('./lib/site-chrome.cjs');
const { guides: switchGuides } = require('./lib/switch-guides.cjs');
const { markdown } = require('./lib/md.cjs');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'blog-src');
const OUT = path.join(ROOT, 'blog');

// Static pages that belong in the sitemap alongside the blog.
const STATIC_PAGES = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/blog', priority: '0.8', changefreq: 'weekly' },
  { loc: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
  { loc: '/support', priority: '0.4', changefreq: 'monthly' }
];

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
  meta.draft = /^(true|yes|1)$/i.test(meta.draft || '');
  return { meta, body: m[2] };
}

const readTime = body => Math.max(1, Math.round(body.split(/\s+/).length / 210)) + ' min read';
const pretty = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// ── shared page chrome ─────────────────────────────────────────────────────
// ── build ──────────────────────────────────────────────────────────────────
if (!fs.existsSync(SRC)) { console.error('No blog-src/ directory — nothing to build.'); process.exit(1); }
// Posts are lowercase slugs (my-post.md). Files starting with an uppercase letter or an underscore
// are documentation for whoever is writing posts (README.md, TOPICS.md) and are not built.
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.md') && !/^[A-Z_]/.test(f)).sort();
if (!files.length) { console.error('blog-src/ has no .md posts.'); process.exit(1); }

const all = files.map(f => {
  const slug = f.replace(/\.md$/, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(slug + ': slug must be lowercase letters, digits and hyphens');
  const { meta, body } = parse(fs.readFileSync(path.join(SRC, f), 'utf8'), slug);
  return { slug, meta, body, html: markdown(body), url: SITE + '/blog/' + slug };
}).sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));   // newest first

// A draft is written but NOT published: no page, no sitemap entry, no link from the index. It stays a
// .md in blog-src/ until someone flips `draft: true` to false and rebuilds. That's what makes the weekly
// scheduled write-up safe — nothing reaches the live site, or Ashley's byline, without a human saying so.
const posts = all.filter(p => !p.meta.draft);
const drafts = all.filter(p => p.meta.draft);
if (!posts.length) { console.error('Every post is a draft — refusing to build an empty blog.'); process.exit(1); }

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
// Switching guides are derived from the same gate the switch build uses, so the sitemap can't
// list a page that wasn't generated (or miss one that was), whichever script ran last.
const urls = STATIC_PAGES.map(s => `  <url>\n    <loc>${SITE}${s.loc}</loc>\n    <changefreq>${s.changefreq}</changefreq>\n    <priority>${s.priority}</priority>\n  </url>`)
  .concat(switchGuides().map(g => `  <url>\n    <loc>${g.url}</loc>\n${g.lastmod ? `    <lastmod>${g.lastmod}</lastmod>\n` : ''}    <changefreq>monthly</changefreq>\n    <priority>${g.priority}</priority>\n  </url>`))
  .concat(posts.map(p => `  <url>\n    <loc>${p.url}</loc>\n    <lastmod>${p.meta.updated || p.meta.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`));
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);

// Remove pages for posts that were unpublished (flipped back to draft) or deleted, so the live site
// never keeps serving something that's no longer in the source.
for (const f of fs.readdirSync(OUT)) {
  if (f === 'index.html' || !f.endsWith('.html')) continue;
  if (!posts.some(p => p.slug + '.html' === f)) { fs.unlinkSync(path.join(OUT, f)); console.log('  removed stale page: blog/' + f); }
}

console.log('built blog/index.html + ' + posts.length + ' posts, and sitemap.xml (' + urls.length + ' urls)');
posts.forEach(p => console.log('  /blog/' + p.slug + '  — ' + p.meta.title));
if (drafts.length) {
  console.log('\n' + drafts.length + ' draft' + (drafts.length === 1 ? '' : 's') + ' awaiting review (not published, not in sitemap):');
  drafts.forEach(p => console.log('  blog-src/' + p.slug + '.md  — ' + p.meta.h1));
}
