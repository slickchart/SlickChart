// Admin tools -> Paid but no account: opens, lists each person with what was sent, saves her waits.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_is_founder', '1'); });
let posted = null; let settings = { orphan_email_hours: 3, orphan_alert_hours: 48, orphan_alert_on: 0 };
await p.route('**/api/**', async r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/admin/orphans')) {
    if (r.request().method() === 'POST') { posted = JSON.parse(r.request().postData() || '{}'); settings = Object.assign({}, settings, posted); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, settings }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, settings, labels: { orphan_email_hours: { label: 'Hours after paying before the "finish your account" email goes out', min: 1, max: 168 }, orphan_alert_hours: { label: 'Hours after paying before you are told they still have no account', min: 2, max: 720 } },
      people: [{ email: 'jill@stuck.com', paidAt: new Date(Date.now() - 5 * 36e5).toISOString(), emailedAt: new Date(Date.now() - 2 * 36e5).toISOString(), status: 'emailed', failedSignIns: 6 }, { email: 'new@stuck.com', paidAt: new Date().toISOString(), status: 'waiting (2h until the email)', failedSignIns: 0 }] }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(9000);
await p.evaluate(() => { _isFounder = true; nav('account'); }); await p.waitForTimeout(800);
const row = await p.$('text=Paid but no account'); const res = [];
res.push(['row shows in Admin tools', !!row]);
if (row) await row.click(); await p.waitForTimeout(800);
const txt = await p.evaluate(() => (document.getElementById('orphan-modal') || {}).innerText || '');
res.push(['lists both people', /jill@stuck.com/.test(txt) && /new@stuck.com/.test(txt)]);
res.push(['says the email went, and the failed sign-ins', /Setup email sent/.test(txt) && /6 failed sign-ins/.test(txt)]);
res.push(['says the wait left for the new one', /waiting \(2h until the email\)/.test(txt)]);
const wide = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
res.push(['no sideways scroll at phone width', wide]);
res.push(['the alert box is there and off by default', await p.$eval('#orph-orphan_alert_on', el => !el.checked).catch(() => false)]);
await p.click('#orph-save'); await p.waitForTimeout(600);
res.push(['saving with it off sends 0 and says she is not told', posted && posted.orphan_alert_on === 0 && /not told/.test(await p.textContent('#orph-msg'))]);
await p.check('#orph-orphan_alert_on');
await p.fill('#orph-orphan_email_hours', '6'); await p.fill('#orph-orphan_alert_hours', '30'); await p.click('#orph-save'); await p.waitForTimeout(600);
const msg = await p.textContent('#orph-msg');
res.push(['saves her values', posted && posted.orphan_email_hours === 6 && posted.orphan_alert_hours === 30 && posted.orphan_alert_on === 1 && /after 6 h.*after 30 h/.test(msg), msg]);
await p.screenshot({ path: process.env.SHOT || '/tmp/orphans-ui.png' });
await p.click('#orph-close'); res.push(['closes', !(await p.$('#orphan-modal'))]);
res.push(['no page errors', !errs.length, errs.join('|')]);
await b.close(); let all = true; for (const [n, v, d] of res) { console.log((v ? 'PASS ' : 'FAIL ') + n + (v ? '' : ' :: ' + (d || ''))); all = all && v; } console.log(all ? 'ALL PASS' : 'FAILURES'); process.exit(all ? 0 : 1);
