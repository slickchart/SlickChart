// Regenerates api/client-page.js's embedded copy of slickchart-client.html.
//
// The client app is served by api/client-page.js, which embeds the full client HTML as a RAW_HTML
// string constant (reading the file from disk failed under this Vercel project's bundling, so it's
// baked in). That means ANY edit to slickchart-client.html must be propagated here or the live client
// keeps running the old code. Run this after every client-app change:
//
//   node scripts/build-client-page.js
//
// It preserves api/client-page.js's header + handler logic and only swaps the RAW_HTML payload.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const clientHtmlPath = path.join(root, 'slickchart-client.html');
const pagePath = path.join(root, 'api', 'client-page.js');

const html = fs.readFileSync(clientHtmlPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

const marker = 'const RAW_HTML = ';
const idx = page.indexOf(marker);
if (idx < 0) { console.error('Could not find "const RAW_HTML = " in api/client-page.js'); process.exit(1); }

const openQuote = page.indexOf('"', idx);
if (openQuote < 0) { console.error('Could not find opening quote of RAW_HTML'); process.exit(1); }

// Walk the existing string literal to find its (unescaped) closing quote, so we keep the tail intact.
let i = openQuote + 1;
while (i < page.length) {
  if (page[i] === '\\') { i += 2; continue; }
  if (page[i] === '"') break;
  i++;
}
if (i >= page.length) { console.error('Could not find closing quote of RAW_HTML'); process.exit(1); }

const head = page.slice(0, openQuote);      // ...const RAW_HTML =
const tail = page.slice(i + 1);             // ;\n\nfunction esc(...) ... handler
// JSON.stringify yields a valid double-quoted JS string literal with correct escaping.
const rebuilt = head + JSON.stringify(html) + tail;

fs.writeFileSync(pagePath, rebuilt);
console.log('Regenerated api/client-page.js — embedded client HTML is now ' + html.length + ' chars.');
