// Preload: every Chromium launch in a test becomes a WebKit launch (Safari's engine), with the
// Usage: PLAYWRIGHT_BROWSERS_PATH=<webkit dir> node --import ./scratchpad/force-webkit.mjs scratchpad/<test>.mjs
// For tests run-in-safari.sh cannot rewrite (plain chromium.launch(), relative paths).
// service worker blocked as run-in-safari.sh does (in WebKit sw.js would answer /api/** itself).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('/opt/node22/lib/node_modules/playwright/index.js'); const wk = pw.webkit;
const wrap = async () => { const b = await wk.launch({ headless: true });
  const nc = b.newContext.bind(b), np = b.newPage.bind(b);
  b.newContext = (o) => nc({ ...(o || {}), serviceWorkers: 'block' });
  b.newPage = (o) => np({ ...(o || {}), serviceWorkers: 'block' });
  return b; };
pw.chromium.launch = wrap; wk.launch = ((orig) => async (o) => { const b = await orig.call(wk, o);
  const nc = b.newContext.bind(b), np = b.newPage.bind(b);
  b.newContext = (x) => nc({ ...(x || {}), serviceWorkers: 'block' }); b.newPage = (x) => np({ ...(x || {}), serviceWorkers: 'block' }); return b; })(wk.launch);
