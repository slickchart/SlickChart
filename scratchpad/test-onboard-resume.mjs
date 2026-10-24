// Setup resumes where she left it (2026-10-24): a new provider on Android Chrome followed setup's own
// "Add SlickChart to your phone" step, the installed app opened as a fresh page, and setup restarted
// from the first screen every time. Drives the real page: walk setup to the install step, reload as
// the installed (home-screen) app, and require the next step with her answers kept and already saved.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = [new URL('../slickchart-vercel/', import.meta.url).pathname, new URL('../../slickchart-vercel/', import.meta.url).pathname].find(d => fs.existsSync(d));
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = q.url.split('?')[0]; const f = p === '/slickchart' ? path.join(ROOT, 'slickchart.html') : path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', /\.html$/.test(f) ? 'text/html' : 'application/octet-stream'); s.end(fs.readFileSync(f)); }).listen(PORT);
const b = await (process.env.SC_ENGINE === 'webkit' ? pw.webkit.launch() : pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ctx = await b.newContext({ serviceWorkers: 'block' }); let p = await ctx.newPage(); let posted = '';
// Each launch is a fresh page on the same phone (shared storage), like the installed app opening.
async function relaunch() { await p.close(); p = await ctx.newPage(); await p.goto('http://localhost:' + PORT + '/slickchart'); await p.waitForTimeout(8000); }
await ctx.route('**/api/**', r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('/api/store') && m !== 'GET') posted += (r.request().postData() || '');
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await p.addInitScript(() => { try { if (!localStorage.getItem('sc_token')) { localStorage.setItem('sc_token', 'tok-new'); localStorage.setItem('sc_login_email', 'new@spa.com'); } } catch (e) {} });
await p.goto('http://localhost:' + PORT + '/slickchart'); await p.waitForTimeout(8000);
const stepNow = () => p.evaluate(() => document.getElementById('onboard-overlay') ? ONBOARD_STEPS[onboardStep] : 'none');
ok(await stepNow() === 'welcome', 'a new account opens on setup');
for (let i = 0; i < 2; i++) await p.evaluate(() => onboardNext());
ok(await stepNow() === 'profession', 'reaches profession');
await p.evaluate(() => { selectedProfessions = ['massage']; onboardNext(); });
await p.fill('#onboard-overlay input >> nth=0', 'BP Massage and Esthetics');
await p.evaluate(() => onboardNext()); await p.evaluate(() => onboardNext()); await p.evaluate(() => onboardNext());
ok(await stepNow() === 'install', 'walks to "Add SlickChart to your phone"');
await p.waitForTimeout(1500);
ok(/BP Massage and Esthetics/.test(posted), 'her business name is already saved to her account before setup ends');
// She installs it; the home-screen app opens as a fresh page on the same phone.
await relaunch();
ok(await stepNow() === 'invite', 'the installed app picks up at the step after install, not the first screen (got ' + await stepNow() + ')');
ok(await p.evaluate(() => onboardData.biz.name === 'BP Massage and Esthetics' && selectedProfessions.join() === 'massage'), 'her answers are still there');
await p.evaluate(() => onboardBack()); await relaunch();
ok(await stepNow() === 'invite', 'a reload on any step lands on that same step (install counts as done)');
await p.evaluate(() => { onboardStep = ONBOARD_STEPS.indexOf('square'); renderOnboard(); }); await relaunch();
ok(await stepNow() === 'square', 'a crash mid-setup resumes on the step she was on');
await p.evaluate(() => finishOnboarding('home')); await p.waitForTimeout(300);
ok(await p.evaluate(() => !localStorage.getItem('scob_progress')), 'finishing clears the saved place');
// Another account on the same phone starts its own setup from the beginning.
await p.evaluate(() => { localStorage.removeItem('sc_onboarded'); onboardStep = 4; _obSave(); localStorage.setItem('sc_login_email', 'other@spa.com'); });
await relaunch();
ok(await stepNow() === 'welcome', 'a different account never inherits someone else’s place');
await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
