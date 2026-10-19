#!/usr/bin/env node
/* Shared page chrome for the generated marketing pages (blog posts and switching guides).
 *
 * Extracted so a second generator can't drift from the blog's look, SEO head, or footer. Nothing
 * here knows about posts or guides — callers pass in title/description/canonical/JSON-LD.
 */
const SITE = 'https://slickchart.app';
const TITLE_SUFFIX = ' | SlickChart';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');


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
.bbanner{display:block;text-decoration:none;color:var(--ink);border-bottom:1px solid rgba(43,199,172,.4);
background:radial-gradient(120% 140% at 0% 0%,rgba(30,143,206,.28),transparent 60%),radial-gradient(120% 140% at 100% 100%,rgba(127,227,162,.22),transparent 60%),#0b1d1b}
.bbanner .in{max-width:1080px;margin:0 auto;padding:20px 22px;display:flex;align-items:center;gap:14px 26px;flex-wrap:wrap;justify-content:space-between}
.bbanner .txt{flex:1 1 380px;min-width:0}
.bbanner .ey{font:650 12px/1.4 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.bbanner .h{font:600 clamp(20px,3vw,27px)/1.25 Fraunces,Georgia,serif;margin:6px 0}
.bbanner .p{color:var(--muted);font-size:15px;line-height:1.6;margin:0;max-width:62ch}
.bbanner .act{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.bbanner .go{display:inline-flex;align-items:center;border-radius:999px;padding:12px 22px;font-weight:650;font-size:15px;background:var(--opal-btn);color:#03201e;white-space:nowrap}
.bbanner .note{font-size:12.5px;color:var(--muted2)}
.bbanner:hover .go{filter:brightness(1.06)}
@media(max-width:560px){.bbanner .in{padding:16px 18px}.bbanner .txt{flex-basis:100%}.bbanner .p{font-size:14px}.bbanner .act{width:100%}.bbanner .go{width:100%;justify-content:center}}
`.trim();

const HEAD_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">';

// The header CTA differs per section: the esthetician pages send you to the app, the Build blog
// sends you to the product it belongs to. Everything else about the header is shared.
const headerWith = (ctaHref, ctaLabel) => `<header class="site"><div class="wrap">
  <a class="brand" href="/"><img src="/assets/slickchart-logo.png" alt="" width="28" height="28"><span>Slick<span class="brandc">Chart</span></span></a>
  <a class="cta" href="${ctaHref}">${ctaLabel}</a>
</div></header>`;
const chromeHeader = headerWith('/slickchart', 'Open the app');

// The Beauty Biz App Build Roadmap banner (Ashley, 2026-10-16), the same one as the top of
// index.html. Blog and switching pages pass banner:true. Above the header, so it scrolls away.
const buildBanner = `<a class="bbanner" href="/build"><div class="in">
  <div class="txt">
    <div class="ey">New &middot; The Beauty Biz App Build Roadmap</div>
    <div class="h">Want a booking app that is all yours? Build it, the way I built SlickChart.</div>
    <p class="p">I built SlickChart myself with Claude, between clients, with no coding background. The step by step roadmap is now written for beauty pros: your services, your forms, your rules, in an app you own and can change any time.</p>
  </div>
  <div class="act"><span class="go">See the roadmap &rarr;</span><span class="note">$97 once. Works for every beauty trade.</span></div>
</div></a>`;

const chromeFooter = `<footer><div class="wrap">
  <a href="/">Home</a><a href="/blog">Blog</a><a href="/esthetician-forms">Forms</a><a href="/build/blog">Build blog</a><a href="/switch">Switching</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
  <a href="mailto:support@slickchart.app">Contact</a>
  <div class="tiny">SlickChart &middot; Made for solo beauty &amp; wellness pros &middot; Pleasant Hill, CA</div>
</div></footer>`;

// ogImage: the picture that shows when a link is shared. Defaults to the SlickChart one; the Build
// blog passes its own, because a Build page previewing as a SlickChart client-engagement graphic
// tells whoever sees it the wrong thing about what they are about to open.
function head({ title, description, canonical, keywords, jsonld, ogType, headerCta, ogImage, banner }) {
  const share = `${SITE}/assets/${ogImage || 'og-image-marine.jpg?v=4'}`;
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
<meta property="og:image" content="${share}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${share}">
${HEAD_FONTS}
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
${banner ? buildBanner + '\n' : ''}${headerCta ? headerWith(headerCta.href, headerCta.label) : chromeHeader}`;
}

module.exports = { SITE, TITLE_SUFFIX, esc, CSS, HEAD_FONTS, headerWith, chromeHeader, chromeFooter, head };
