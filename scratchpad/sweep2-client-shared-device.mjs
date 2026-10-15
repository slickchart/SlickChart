// Two different clients' links opened in the SAME browser (a client of two SlickChart providers, a
// family iPad, or a provider opening her clients' real links on her own phone). Every client-app
// localStorage key is global — not namespaced by link token — so client A's device state is shown
// to client B and then PUT into B's server prefs (CLAUDE.md §0.3).
import { launch, mockApi, clientRecord, check, finish, BASE } from './sweep2-client-lib.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e.message || e)));
const opts = { records: { TOKA: clientRecord('ca', 'Alice Able'), TOKB: clientRecord('cb', 'Bea Bee') }, prefs: {} };
await mockApi(page, opts);

// ── Client A uses her space ──
await page.goto(BASE + '?c=TOKA', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real && client.name === 'Alice Able', null, { timeout: 15000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  // A corrects her phone in My Profile (what the edit-field modal does), and sets a profile photo.
  client.phone = '555-ALICE'; client.email = 'alice-private@ex.com'; _saveClientContact();
  localStorage.setItem('sc_client_avatar', 'data:image/png;base64,ALICEFACE'); client.avatar = 'data:image/png;base64,ALICEFACE';
  // A submitted a photo consult (finalize() records it with her photos).
  const j = client.providers.find(p => p.id === 'jess');
  j.virtualConsults = [{ date: 'Oct 1', kind: 'skin', title: 'Photo consult', photos: [{ label: 'Front', src: 'data:image/jpeg;base64,ALICECONSULT' }], goals: 'acne on chin' }];
  persistVirtualConsults();
  // A's message that failed to send (no signal) — stays as "Tap to retry".
  j.thread.push({ _id: 'cmA', from: 'me', text: 'Alice private: my rash is back', imgs: [], time: 'Just now', status: 'failed', _idem: 'idemA' });
  _saveClientMessages();
  // A hid a summary, saved a product.
  localStorage.setItem('sc_client_saved', JSON.stringify(['Alice Serum']));
});
await page.waitForTimeout(1500);

// ── Client B opens HER link in the same browser ──
const putsBefore = opts.log.length;
await page.goto(BASE + '?c=TOKB', { waitUntil: 'load' });
await page.waitForFunction(() => typeof client !== 'undefined' && client._real && client.name === 'Bea Bee', null, { timeout: 15000 });
await page.waitForTimeout(3000);
const st = await page.evaluate(() => {
  const j = client.providers.find(p => p.id === 'jess');
  return { name: client.name, phone: client.phone, email: client.email, avatar: client.avatar || localStorage.getItem('sc_client_avatar'),
    consults: (j.virtualConsults || []).map(v => v.goals), thread: (j.thread || []).map(m => m.text + '/' + (m.status || '')), saved: j.saved };
});
const bPuts = opts.log.slice(putsBefore).filter(e => e.path === '/api/client-prefs' && e.method === 'PUT' && e.t === 'TOKB');
const bPrefs = opts.prefs.TOKB || {};
check("B's profile shows A's corrected phone/email", st.phone === '555-ALICE' || st.email === 'alice-private@ex.com', { phone: st.phone, email: st.email });
check("B's app carries A's avatar", String(st.avatar || '').includes('ALICEFACE'), String(st.avatar).slice(0, 40));
check("B's journey lists A's photo consult (with A's photos)", st.consults.includes('acne on chin'), st.consults);
check("B's thread shows A's failed message with Tap-to-retry (retry would send it to B's provider)", st.thread.some(x => x.includes('Alice private')), st.thread);
check("B's saved products are A's", JSON.stringify(st.saved || []).includes('Alice Serum'), st.saved);
check("A's contact/avatar/saved are PUT into B's SERVER prefs (then follow B to every device)",
  !!(bPrefs.contact && bPrefs.contact.phone === '555-ALICE') || String(bPrefs.avatar || '').includes('ALICEFACE'),
  { puts: bPuts.length, contact: bPrefs.contact, avatar: String(bPrefs.avatar || '').slice(0, 40), saved: bPrefs.saved });

// ── And on B's OWN phone, server prefs now apply A's contact + avatar ──
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await ctx2.newPage();
await mockApi(p2, opts);
await p2.goto(BASE + '?c=TOKB', { waitUntil: 'load' });
await p2.waitForFunction(() => typeof client !== 'undefined' && client._real && client.name === 'Bea Bee', null, { timeout: 15000 });
await p2.waitForTimeout(2500);
const st2 = await p2.evaluate(() => ({ phone: client.phone, email: client.email, avatar: String(client.avatar || '').slice(0, 40) }));
check("B's own fresh phone now shows A's phone/email/avatar (pulled from B's server prefs)", st2.phone === '555-ALICE' || st2.avatar.includes('ALICEFACE'), st2);
check('no page errors', errs.length > 0, errs);
await browser.close();
finish();
