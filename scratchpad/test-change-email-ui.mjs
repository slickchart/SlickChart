// Settings → Password & Security → Login email (api/change-email.js), driven in the real provider app.
// Shows her current address, sends {newEmail,password} with her session, shows the pending address,
// and a ?emailchange= link POSTs the confirm (never a GET a mail scanner could fire) and strips it.
//   node scratchpad/test-change-email-ui.mjs [page]   (serve slickchart-vercel on :8899)
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PAGE = process.argv[2] || 'slickchart.html';
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fails = 0; const check = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d))); if (!c) fails++; };
const calls = []; let pending = null;
async function mkPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem('sc_onboarded', '1'); } catch (e) {} });
  await page.route('**/api/**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/change-email') {
      const m = r.request().method(); const b = m === 'POST' ? JSON.parse(r.request().postData() || '{}') : null;
      calls.push({ m, b, auth: r.request().headers()['authorization'] || '' });
      if (m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 'jriske412@gmail.com', pending, canChange: true }) });
      if (b && b.confirm) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 'jessica@fabulousyoumakeup.com' }) });
      pending = b.newEmail; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, pending: b.newEmail }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[],"sessions":[]}' });
  });
  return { page, errs };
}
{
  const { page, errs } = await mkPage();
  await page.goto('http://localhost:8899/' + PAGE, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { Cloud.token = 'tok_test'; renderPasswordSecurity(); });
  await page.waitForTimeout(600);
  const shown = await page.evaluate(() => (document.getElementById('email-body') || {}).innerText || '');
  check('shows her current login email', shown.includes('jriske412@gmail.com'), shown);
  check('GET carried her session', calls.some(c => c.m === 'GET' && c.auth === 'Bearer tok_test'), calls);
  await page.fill('#em-new', 'jessica@fabulousyoumakeup.com');
  await page.fill('#em-pw', 'Secret123!');
  await page.evaluate(() => [...document.querySelectorAll('#email-body button.btnp')][0].click());
  await page.waitForTimeout(700);
  const post = calls.find(c => c.m === 'POST' && c.b && c.b.newEmail);
  check('POST sends new email + password with her session', post && post.b.newEmail === 'jessica@fabulousyoumakeup.com' && post.b.password === 'Secret123!' && post.auth === 'Bearer tok_test', post);
  const after = await page.evaluate(() => ({ box: (document.getElementById('email-body') || {}).innerText || '', toast: (document.getElementById('pro-toast') || {}).innerText || '' }));
  check('tells her to check the new inbox, and shows it as pending', /Check jessica@fabulousyoumakeup\.com/.test(after.toast) && after.box.includes('Waiting for you to confirm'), after);
  check('no page errors', errs.length === 0, errs);
}
{
  const { page, errs } = await mkPage();
  await page.goto('http://localhost:8899/' + PAGE + '?emailchange=tok123', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const c = calls.find(x => x.m === 'POST' && x.b && x.b.confirm);
  check('the link POSTs the confirm token', c && c.b.confirm === 'tok123', calls);
  const st = await page.evaluate(() => ({ url: location.search, toast: (document.getElementById('confirm-modal') || {}).innerText || '', pre: localStorage.getItem('sc_login_email') }));
  check('token stripped from the address bar', !st.url.includes('emailchange'), st);
  check('says the email changed', st.toast.includes('jessica@fabulousyoumakeup.com'), st);
  check('no page errors', errs.length === 0, errs);
}
await browser.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
