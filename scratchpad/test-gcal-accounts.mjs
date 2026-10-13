// SEVERAL GOOGLE CALENDARS, and showing WHICH ones are connected.
//
// Ashley, 2026-10-13: "let's have it show which calendar is connected, and give the option to
// connect multiple" / "1 - several google accounts" / "and show which ones are connected".
//
// The ways this could quietly go wrong:
//   - the card shows "Connected" with no name, which is what it did before and what she asked to fix
//   - disconnecting one calendar takes the others with it
//   - a build that has not relaunched yet gets a response it cannot read (CLAUDE.md §1a)
//   - an older server reply (no `accounts` field) renders an empty card instead of the one
//     connection it does describe
//
//   node scratchpad/test-gcal-accounts.mjs [file.html]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const FILE = process.argv[2] || 'slickchart.html';

const results = [];
const check = (n, p, d) => results.push({ name: n, pass: p, detail: d || '' });

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// Render the real _gcalCardHTML against a given /api/google-cal GET reply.
async function card(state) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => { try {
    localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1');
  } catch (e) {} });
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: '{"ok":true,"data":{},"clients":[],"events":[]}' }));
  await page.route('**/api/cloud-status*', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: '{"enabled":true}' }));
  await page.goto('http://localhost:8899/' + FILE, { waitUntil: 'load' });
  await page.waitForTimeout(2600);

  const out = await page.evaluate(st => {
    _gcalState = Object.assign({ answered: true, configured: true }, st);
    const html = _gcalCardHTML();
    const box = document.createElement('div');
    box.innerHTML = html;
    document.body.appendChild(box);
    const text = (box.textContent || '').replace(/\s+/g, ' ').trim();
    const disconnectBtns = [...box.querySelectorAll('button')]
      .filter(b => /disconnect/i.test(b.textContent || ''));
    return {
      text,
      perAccountDisconnects: disconnectBtns.filter(b => /_gcalDisconnectOne/.test(b.getAttribute('onclick') || '')).length,
      disconnectAll: disconnectBtns.some(b => /_gcalDisconnect\(\)/.test(b.getAttribute('onclick') || '')),
      connectAnother: [...box.querySelectorAll('a')].some(a => /connect another/i.test(a.textContent || '')),
      html
    };
  }, state);
  await page.close();
  return out;
}

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth?x=1';

// 1. Two accounts, both healthy.
{
  const r = await card({ connected: true, authUrl: AUTH, lastOk: Date.now(), accounts: [
    { id: 'p:1', label: 'ashley@slickchart.app', lastOk: Date.now(), needsReconnect: false },
    { id: 'p:2', label: 'botanicalaestheticsbyashley@gmail.com', lastOk: Date.now(), needsReconnect: false }
  ] });
  check('two accounts: both names are on screen',
    r.text.includes('ashley@slickchart.app') && r.text.includes('botanicalaestheticsbyashley@gmail.com'), r.text.slice(0, 120));
  check('two accounts: says how many are syncing', /2 calendars/.test(r.text), r.text.slice(0, 90));
  check('two accounts: one Disconnect per calendar', r.perAccountDisconnects === 2, 'found ' + r.perAccountDisconnects);
  check('two accounts: a Disconnect all as well', r.disconnectAll, '');
  check('two accounts: can connect another', r.connectAnother, '');
}

// 2. One account. No "Disconnect all" noise, but still named.
{
  const r = await card({ connected: true, authUrl: AUTH, lastOk: Date.now(), accounts: [
    { id: 'p:1', label: 'ashley@slickchart.app', lastOk: Date.now(), needsReconnect: false }
  ] });
  check('one account: the name is shown, not just "Connected"',
    r.text.includes('ashley@slickchart.app'), r.text.slice(0, 100));
  check('one account: exactly one Disconnect', r.perAccountDisconnects === 1, 'found ' + r.perAccountDisconnects);
  check('one account: no "Disconnect all"', !r.disconnectAll, '');
  check('one account: can still connect another', r.connectAnother, '');
}

// 3. One of two is broken. She must be able to tell WHICH.
{
  const r = await card({ connected: true, authUrl: AUTH, lastOk: Date.now(), accounts: [
    { id: 'p:1', label: 'ashley@slickchart.app', lastOk: Date.now(), needsReconnect: false },
    { id: 'p:2', label: 'old@gmail.com', lastOk: 0, needsReconnect: true }
  ] });
  check('one broken: the card says something needs reconnecting', /needs reconnecting/i.test(r.text), r.text.slice(0, 110));
  check('one broken: the BROKEN one is named and marked', /old@gmail\.com/.test(r.text)
    && /old@gmail\.com\s*Needs reconnecting/i.test(r.text), r.text.slice(0, 220));
  check('one broken: the healthy one is NOT marked broken',
    /ashley@slickchart\.app\s*Last checked/i.test(r.text), r.text.slice(0, 220));
}

// 4. A connection made before labels existed: a plain name, never a blank line.
{
  const r = await card({ connected: true, authUrl: AUTH, lastOk: Date.now(), accounts: [
    { id: 'p:legacy', label: '', lastOk: Date.now(), needsReconnect: false }
  ] });
  check('no label yet: falls back to a readable name', /Google Calendar/.test(r.text), r.text.slice(0, 100));
  check('no label yet: still disconnectable', r.perAccountDisconnects === 1, 'found ' + r.perAccountDisconnects);
}

// 5. An OLDER SERVER reply with no `accounts` at all. The app must still show the connection.
{
  const r = await card({ connected: true, authUrl: AUTH, lastOk: Date.now(), needsReconnect: false });
  check('older server reply: still shows a connected card', /Two-way sync is on/.test(r.text), r.text.slice(0, 100));
  check('older server reply: offers a disconnect', r.disconnectAll, '');
}

// 6. Not connected at all - unchanged behaviour.
{
  const r = await card({ connected: false, authUrl: AUTH });
  check('not connected: still the invitation to connect', /Two-way sync with Google/.test(r.text), r.text.slice(0, 100));
  check('not connected: no disconnect buttons', r.perAccountDisconnects === 0 && !r.disconnectAll, '');
}

await browser.close();

let bad = 0;
for (const r of results) { if (!r.pass) bad++;
  console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(54) + (r.pass ? '' : ('  <- ' + r.detail))); }
console.log(bad ? '\n' + bad + ' of ' + results.length + ' FAILED'
  : '\nevery connected calendar is named, each can be disconnected on its own, a broken\n'
  + 'one is identifiable, and an older server reply still renders');
process.exit(bad ? 1 : 0);
