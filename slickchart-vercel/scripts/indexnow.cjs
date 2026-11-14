#!/usr/bin/env node
// IndexNow: tells Bing (and the other IndexNow engines; ChatGPT search leans on Bing) the moment a
// public page is published or changed, instead of waiting for a crawl. Ashley asked for it 2026-11-13.
//
//   node scripts/indexnow.cjs <fromSha> <toSha>   ping the pages whose files changed in that range
//   node scripts/indexnow.cjs --since "26 hours ago"   ping what changed on HEAD in that window
//   add --dry to print the list without sending
//
// Only pages listed in sitemap.xml (plus the homepage) are ever sent, so the app, the client pages,
// /api and anything noindex can never be submitted. The key file 0e7942580980b530c0d0948c9f632b3e.txt at the site root
// proves the site is ours; it is public by design (IndexNow keys are not secrets).
// Run by .github/workflows/indexnow.yml after main changes. Never fails the build: a refused ping is
// logged and the next change pings again.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY = '0e7942580980b530c0d0948c9f632b3e';
const HOST = 'slickchart.app';
const SITE = 'https://' + HOST;
const DIR = path.join(__dirname, '..');                       // slickchart-vercel/
const PREFIX = 'slickchart-vercel/';

// A changed file -> the public address it is served at (vercel.json cleanUrls + the /build/blog rewrite).
function urlForFile(f) {
  if (!f.startsWith(PREFIX) || !f.endsWith('.html')) return null;
  let p = f.slice(PREFIX.length, -'.html'.length);
  if (p.startsWith('build-blog')) p = 'build/blog' + p.slice('build-blog'.length);
  p = p.replace(/(^|\/)index$/, '');
  return SITE + '/' + p;
}

function sitemapUrls() {
  const xml = fs.readFileSync(path.join(DIR, 'sitemap.xml'), 'utf8');
  const set = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim().replace(/\/$/, '')));
  set.add(SITE);
  return set;
}

function changedFiles(args) {
  const git = a => execFileSync('git', a, { cwd: DIR, encoding: 'utf8' });
  const i = args.indexOf('--since');
  if (i >= 0) return git(['log', '--since=' + args[i + 1], '--name-only', '--format=', 'HEAD']).split('\n');
  const [from, to] = args.filter(a => !a.startsWith('--'));
  if (!from || /^0+$/.test(from)) return git(['show', '--name-only', '--format=', to || 'HEAD']).split('\n');
  return git(['diff', '--name-only', from, to || 'HEAD']).split('\n');
}

function pagesToPing(files, allowed) {
  const out = new Set();
  for (const f of files) { const u = urlForFile(f.trim()); if (u && allowed.has(u.replace(/\/$/, ''))) out.add(u); }
  return [...out].slice(0, 10000);
}

function post(urlList) {
  const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: SITE + '/' + KEY + '.txt', urlList });
  return new Promise(resolve => {
    const req = https.request('https://api.indexnow.org/indexnow', { method: 'POST', timeout: 20000,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) } },
      res => { let t = ''; res.on('data', d => t += d); res.on('end', () => resolve({ status: res.statusCode, text: t.slice(0, 300) })); });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', e => resolve({ status: 0, text: String(e.message || e) }));
    req.end(body);
  });
}

module.exports = { urlForFile, pagesToPing, sitemapUrls, KEY };

if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  const urls = pagesToPing(changedFiles(args), sitemapUrls());
  if (!urls.length) { console.log('indexnow: no public page changed'); return; }
  console.log('indexnow: ' + urls.length + ' page(s)\n  ' + urls.join('\n  '));
  if (args.includes('--dry')) return;
  const r = await post(urls);
  // 200 = accepted, 202 = accepted, key check pending. Anything else is logged, never fatal.
  console.log('indexnow: answered ' + r.status + (r.text ? ' ' + r.text : ''));
})();
