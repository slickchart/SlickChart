#!/usr/bin/env node
/* Build the SlickChart switching guides.
 *
 * Sources:  switch-src/index.md            — the hub
 *           switch-src/from-<platform>.md  — one hand-written guide per VERIFIED platform
 * Outputs:  switch/index.html              — served at /switch
 *           switch/from-<platform>.html    — served at /switch/from-<platform>
 *
 * Run from slickchart-vercel/:  node scripts/build-switch.cjs && node scripts/build-blog.cjs
 * (build-blog.cjs owns sitemap.xml and reads the same gate, so order doesn't matter for correctness.)
 *
 * The publish gate lives in lib/switch-guides.cjs — read the "publish gate" section of
 * switch-src/README.md before adding a platform. The short version: a page needs hand-written copy
 * AND a verified export path. Name-swapped templates are not allowed.
 */
const fs = require('fs');
const path = require('path');
const { SITE, TITLE_SUFFIX, esc, chromeFooter, head } = require('./lib/site-chrome.cjs');
const { markdown } = require('./lib/md.cjs');
const { guides, blocked, SRC } = require('./lib/switch-guides.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'switch');
const SQ_REFERRAL = 'https://squareup.com/refer/2832A5A0B0';

// Same frontmatter contract as the blog, so a guide can't ship with an over-long title or a
// description Google will truncate.
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
  const full = meta.title + TITLE_SUFFIX;
  if (full.length > 60) throw new Error(slug + ': title is ' + full.length + ' chars with the suffix (max 60): "' + full + '"');
  if (meta.description.length > 160) throw new Error(slug + ': description is ' + meta.description.length + ' chars (max 160)');
  if (meta.description.length < 70) throw new Error(slug + ': description is only ' + meta.description.length + ' chars (aim for 110-160)');
  if (!meta.h1) meta.h1 = meta.title;
  return { meta, body: m[2] };
}

// Appended to EVERY guide, never hand-written, so it cannot be forgotten on the one page that
// needed it. Two separate disclosures: the Square link pays us, and knowing a platform's column
// names is not the same as having tested it.
function disclosure(g) {
  const bits = [
    'The Square sign-up link on this page is a referral link. If you open a Square account through it, '
    + 'Square waives the processing fees on your first $1,000 in sales and SlickChart receives a referral '
    + 'credit. Square sets those terms and can change or end the offer at any time.',
    'SlickChart is not affiliated with, endorsed by, or partnered with any other booking platform named '
    + 'on this page. Product names belong to their owners. We describe what SlickChart does and leave the '
    + 'comparison to you.'
  ];
  if (g.platform && g.platform.lastVerified) {
    bits.push('The ' + g.platform.label + ' export steps on this page were last checked on '
      + g.platform.lastVerified + '. Menus move; if yours look different, look for "Export" in your client list.');
  }
  return '<div class="disclosure"><p><strong>Disclosure.</strong> ' + bits.map(esc).join('</p><p>') + '</p></div>';
}

const EXTRA_CSS = `
.disclosure{margin:40px 0 0;padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:var(--bg2)}
.disclosure p{font-size:12.5px;line-height:1.65;color:var(--muted2);margin:0 0 10px}
.disclosure p:last-child{margin-bottom:0}
`;

const list = guides();
if (!list.length) { console.error('No switching guides to build (switch-src/index.md missing?).'); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });

for (const g of list) {
  const { meta, body } = parse(fs.readFileSync(path.join(SRC, g.file), 'utf8'), g.slug);
  const crumbs = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Switching', item: SITE + '/switch' }
  ];
  if (!g.hub) crumbs.push({ '@type': 'ListItem', position: 3, name: meta.h1, item: g.url });
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [{
      '@type': 'HowTo',
      name: meta.h1,
      description: meta.description,
      datePublished: meta.date,
      dateModified: meta.updated || meta.date,
      publisher: { '@type': 'Organization', name: 'SlickChart', logo: { '@type': 'ImageObject', url: SITE + '/icon-512.png' } },
      mainEntityOfPage: { '@type': 'WebPage', '@id': g.url },
      inLanguage: 'en-US'
    }, { '@type': 'BreadcrumbList', itemListElement: crumbs }]
  };
  const others = list.filter(o => o.slug !== g.slug && !o.hub);
  const html = head({
    title: meta.title + TITLE_SUFFIX, description: meta.description, canonical: g.url,
    keywords: meta.keywords, jsonld, ogType: 'article'
  }).replace('</style>', EXTRA_CSS + '</style>')
    + `\n<main><div class="wrap">
${g.hub ? '' : '<a class="back" href="/switch">&larr; Switching to SlickChart</a>\n'}<article>
<h1>${esc(meta.h1)}</h1>
${markdown(body)}
</article>
<div class="endcta">
  <p>SlickChart is the charting and client app built for solo beauty and wellness pros &mdash; notes, photos, forms and payments in one place.</p>
  <a class="cta" href="/slickchart">Try SlickChart free</a>
  <p style="margin:14px 0 0;font-size:14px;">New to Square? <a href="${SQ_REFERRAL}" rel="nofollow sponsored noopener" target="_blank">Open an account through our link</a> for $1,000 in free processing.</p>
</div>
${others.length ? '<h2>Coming from a specific app</h2>\n' + others.map(o =>
      `<a class="card" href="/switch/${o.slug}"><h2>${esc(o.platform.label)}</h2><p>Exporting your clients from ${esc(o.platform.label)} and bringing them into SlickChart.</p></a>`).join('\n') : ''}
${disclosure(g)}
</div></main>\n${chromeFooter}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(OUT, g.slug + '.html'), html);
}

// Drop pages whose source was deleted, or whose platform lost its verified flag — the live site must
// never keep serving export steps we no longer stand behind.
for (const f of fs.readdirSync(OUT)) {
  if (!f.endsWith('.html')) continue;
  if (!list.some(g => g.slug + '.html' === f)) { fs.unlinkSync(path.join(OUT, f)); console.log('  removed stale page: switch/' + f); }
}

console.log('built ' + list.length + ' switching page' + (list.length === 1 ? '' : 's'));
list.forEach(g => console.log('  ' + (g.hub ? '/switch' : '/switch/' + g.slug) + (g.platform ? '  — verified ' + g.platform.lastVerified : '  — hub')));
const held = blocked();
if (held.length) {
  console.log('\n' + held.length + ' guide' + (held.length === 1 ? '' : 's') + ' written but NOT published:');
  held.forEach(h => console.log('  switch-src/' + h.file + '  — ' + h.why));
}
