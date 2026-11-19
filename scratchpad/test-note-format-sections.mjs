import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = new URL('../slickchart-vercel/', import.meta.url).pathname;
const SIZE = process.env.SIZE || 'mac';
const OUT = process.argv[2] || `/tmp/claude-0/sweep-wide-${SIZE}.json`;
const SHOTS = process.env.SHOTS || '';
const VP = { mac: { width: 1440, height: 900 }, ipad: { width: 1032, height: 1376 }, imac: { width: 2048, height: 1152 }, phone: { width: 390, height: 844 } }[SIZE];
const TOUCH = SIZE === 'ipad' || SIZE === 'phone';
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const SKIP = /logout|_doLogout|signOut|sign out|deleteAccount|delete-account|_doDelete|wipe|purge|_resetApp|resetAll|clearAll|_doDeleteClientData|location\.reload|_reloadApp|window\.location|location\.href=|_hardRefresh|_forceUpdate|removeDemoClients|_setShotMode\(true|cancelSub|_sqDisconnect|disconnect/i;
const engine = process.env.PW_ENGINE === 'chromium' ? pw.chromium : pw.webkit;
const browser = await engine.launch(process.env.PW_ENGINE === 'chromium' ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const ctx = await browser.newContext({ viewport: VP, hasTouch: TOUCH, isMobile: false, serviceWorkers: 'block' });
const page = await ctx.newPage();
let errs = [], cerrs = [];
page.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|net::|favicon|fonts\.g|tabler|ERR_|404|status of|Load failed|access control|due to access/i.test(t)) cerrs.push(t.slice(0, 200)); } });
page.on('dialog', d => d.dismiss().catch(() => {}));
page.on('popup', p => p.close().catch(() => {}));
// A brand-new esthetician, Square connected, clients imported from Square, setup finished.
const now = Date.now();
const clients = {}; for (let i = 0; i < 40; i++) { const id = 'sq_CUST' + i; clients[id] = { id, name: ['Ava', 'Bea', 'Cora', 'Dana', 'Eve'][i % 5] + ' ' + ['Lane', 'Moss', 'Reed', 'Stone'][i % 4] + ' ' + i, email: 'c' + i + '@ex.com', phone: '555010' + String(i).padStart(4, '0'), sqId: 'CUST' + i, source: 'square', created: now - 86400000 * 3, _ts: now - 86400000 * 3, visits: [], notes: [] }; }
const seed = { sc_clients: JSON.stringify(clients), sc_onboarded: '1', sc_professions: JSON.stringify(['esthetician']), sc_wsname: JSON.stringify('Frances Skin Studio'),
  sc_bizinfo: JSON.stringify({ name: 'Frances Skin Studio', phone: '5550100000', email: 'studio@ex.com' }) };
await page.addInitScript(([app, native]) => { try { localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_login_email', 'new@spa.com'); localStorage.setItem('sc_hide_sample', '1'); } catch (e) {}
  if (native) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; };
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
  try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (e) {} }, ['provider', SIZE === 'ipad' || SIZE === 'phone']);

const SQ = process.env.SQ || 'expired';
const sqBody = { none: [200, { oauth: false, connected: false }], expired: [200, { oauth: false, expired: true }], err500: [200, { oauth: true, connected: true }], nosquare: [200, { oauth: false }], offline: [200, { oauth: true, connected: true }] }[SQ];
await page.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: seed }) });
  if (u.includes('/api/square/connection') || u.includes('/api/square/token-status')) return r.fulfill({ status: sqBody[0], contentType: 'application/json', body: JSON.stringify(sqBody[1]) });
  if (u.includes('/api/square/')) {
    if (SQ === 'offline') return r.abort('internetdisconnected');
    if (SQ === 'err500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Square is having trouble right now."}' });
    if (SQ === 'expired') return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Square sign-in expired","code":"expired"}' });
    return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Connect Square first.","code":"nosquare"}' });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"appointments":[],"items":[]}' }); });
await page.route(/^(?!http:\/\/localhost:\d+).*/, r => r.abort());
await page.addInitScript(() => { window.__said = []; const iv = setInterval(() => { if (typeof proToast === 'function' && !window.__tw) { window.__tw = 1; const o = proToast; window.proToast = function (m) { window.__said.push('TOAST ' + String(m)); return o.apply(this, arguments); }; clearInterval(iv); } }, 20); });
await page.goto('http://localhost:' + PORT + '/slickchart.html', { waitUntil: 'load' }); await page.waitForTimeout(8000);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
errs.length = 0;
await page.evaluate(() => { noteEditSecs = []; renderNewNoteTemplate('x'); });
await page.waitForTimeout(300);
await page.evaluate(() => { const b = document.querySelectorAll('#nt-secs button[aria-label="Delete"]'); b[0].click(); });
await page.fill('#nt-secs input', 'Extractions');
let st = await page.evaluate(() => noteEditSecs.map(s => s.label));
ok(st.length === 1 && st[0] === 'Extractions', 'after deleting section 1, renaming section 2 sticks: ' + JSON.stringify(st));
ok(!errs.length, 'no page errors: ' + errs.join('|'));
await page.evaluate(() => { document.querySelector('#nt-secs button[aria-label="Delete"]').click(); });
const before = await page.evaluate(() => customNoteTemplates.length);
await page.evaluate(() => saveNoteTemplate('x'));
const after = await page.evaluate(() => customNoteTemplates.length);
ok(after === before && (await page.evaluate(() => window.__said.join('|'))).includes('at least one section'), 'a format with no sections is not saved');
await page.evaluate(() => { renderNewNoteTemplate('x'); }); await page.fill('#nt-name', '   ');
await page.evaluate(() => saveNoteTemplate('x'));
const last = await page.evaluate(() => customNoteTemplates[customNoteTemplates.length - 1].name);
ok(last === 'My custom format', 'a blank name gets the default: ' + last);

// An empty note does not add a blank visit to her history.
await page.evaluate(() => { CL.n1 = { id: 'n1', name: 'Nia Test', summaries: [] }; sessionSummaries.n1 = []; delete providerNoteDrafts.n1; nav('write-note', 'n1'); });
await page.waitForTimeout(500);
await page.evaluate(() => { window.__said.length = 0; _saveWriteNote('n1'); });
ok((await page.evaluate(() => (sessionSummaries.n1 || []).length)) === 0 && (await page.evaluate(() => window.__said.join('|'))).includes('Write your note first'), 'Save on an empty note adds nothing and says so');
await page.evaluate(() => nav('write-note', 'n1')); await page.waitForTimeout(400);
await page.evaluate(() => { const t = document.querySelector('[id^="wn-sec-"]'); t.value = 'Calm skin, light peel'; _saveWriteNote('n1'); });
ok((await page.evaluate(() => (sessionSummaries.n1 || []).length)) === 1, 'a written note is saved as one visit');
await page.evaluate(() => nav('write-note', 'n1')); await page.waitForTimeout(400);
await page.evaluate(() => { document.querySelectorAll('[id^="wn-sec-"]').forEach(t => t.value = ''); _saveWriteNote('n1'); });
ok((await page.evaluate(() => (sessionSummaries.n1 || []).length)) === 1, 'clearing a saved note still saves (edit of an existing visit)');
await page.evaluate(() => nav('write-note', 'n1')); await page.waitForTimeout(400);

// Send & save a summary to a client with no app link: not "Summary sent", invite opens.
const sumRes = await page.evaluate(async () => { CL.u1 = { id: 'u1', name: 'Uma Test', summaries: [] }; window._pushClientNow = async () => ({ ok: true }); let inv = null; window.inviteClientToApp = id => { inv = id; };
  summarySendOn.u1 = true; window.__said.length = 0; await sendSummary('u1'); await new Promise(r => setTimeout(r, 400));
  const a = { inv, toast: window.__said.join('|'), sent: !!document.getElementById('sent-toast') };
  CL.v1 = { id: 'v1', name: 'Vi Test', summaries: [], _token: 'TOKV' }; inv = null; summarySendOn.v1 = true; await sendSummary('v1'); await new Promise(r => setTimeout(r, 400));
  a.inv2 = inv; a.sent2 = !!document.getElementById('sent-toast'); return a; });
ok(sumRes.inv === 'u1' && !sumRes.sent && /Saved to Uma\u2019s profile/.test(sumRes.toast), 'uninvited: saved + invite, no "Summary sent": ' + JSON.stringify(sumRes));
ok(sumRes.inv2 === null && sumRes.sent2, 'invited client still gets "Summary sent"');
await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
