#!/usr/bin/env node
/* The publish gate for switching guides.
 *
 * A /switch/from-<platform> page may only exist when BOTH are true:
 *
 *   1. switch-src/from-<platform>.md exists — someone wrote real, specific copy for that platform.
 *      No page is ever produced by swapping a name into a template; that is what Google calls
 *      scaled content abuse, and it is also just lying about knowledge we don't have.
 *   2. The matching entry in import-profiles.json has verified:true — someone actually followed that
 *      platform's export path in the live product and recorded who/when in verifiedBy/lastVerified.
 *
 * Both build-switch.cjs (which renders the pages) and build-blog.cjs (which writes the sitemap) call
 * this, so the sitemap can never list a page that wasn't generated, whichever script ran last.
 */
const fs = require('fs');
const path = require('path');
const { SITE } = require('./site-chrome.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'switch-src');
const PROFILES = path.join(ROOT, 'import-profiles.json');

// Cheap frontmatter peek — just enough for a sitemap <lastmod>. The full contract is validated by
// build-switch.cjs when it renders the page.
function srcDate(file) {
  try {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(path.join(SRC, file), 'utf8'));
    if (!m) return null;
    const u = /^updated:\s*(\S+)/m.exec(m[1]), d = /^date:\s*(\S+)/m.exec(m[1]);
    return (u && u[1]) || (d && d[1]) || null;
  } catch (e) { return null; }
}

function profiles() {
  try { return (JSON.parse(fs.readFileSync(PROFILES, 'utf8')).platforms) || []; } catch (e) { return []; }
}

// Returns every page the switch build should produce: the hub, plus one per verified platform that
// has hand-written copy. `blocked` explains anything that was written but can't publish yet.
function guides() {
  if (!fs.existsSync(SRC)) return [];
  const plats = profiles();
  const out = [];
  if (fs.existsSync(path.join(SRC, 'index.md'))) {
    out.push({ id: '', slug: 'index', file: 'index.md', url: SITE + '/switch', priority: '0.8', lastmod: srcDate('index.md'), hub: true });
  }
  for (const f of fs.readdirSync(SRC).sort()) {
    const m = /^from-([a-z0-9][a-z0-9-]*)\.md$/.exec(f);
    if (!m) continue;
    const p = plats.find(x => x && x.id === m[1]);
    if (!p || !p.verified) continue;                       // gate 2
    out.push({ id: m[1], slug: 'from-' + m[1], file: f, platform: p,
      url: SITE + '/switch/from-' + m[1], priority: '0.7', lastmod: p.lastVerified || srcDate(f) });
  }
  return out;
}

// Copy that exists but is held back, so the build can say why instead of silently skipping it.
function blocked() {
  if (!fs.existsSync(SRC)) return [];
  const plats = profiles();
  return fs.readdirSync(SRC).sort().map(f => {
    const m = /^from-([a-z0-9][a-z0-9-]*)\.md$/.exec(f);
    if (!m) return null;
    const p = plats.find(x => x && x.id === m[1]);
    if (!p) return { file: f, why: 'no "' + m[1] + '" entry in import-profiles.json' };
    if (!p.verified) return { file: f, why: p.label + ' is not verified — nobody has followed its export path in the live product yet' };
    return null;
  }).filter(Boolean);
}

module.exports = { guides, blocked, SRC };
