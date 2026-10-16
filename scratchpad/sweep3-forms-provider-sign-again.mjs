// Provider app, "Sign in person" (renderSignOnDevice -> submitSignOnDevice).
//  1) A form this client has signed BEFORE (last visit's consent) is signed again today: the guard
//     `!submittedForms.some(sf=>sf.formId===fid&&sf.signed)` skips creating a record, so today's answers
//     and signature are filed nowhere and nothing goes to /api/provider-form — yet the toast says "signed ✓".
//  2) The drawn signature itself is never stored on any path (only a boolean _signPadInk).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const check = (n, p, d) => results.push({ n, p: !!p, d: JSON.stringify(d) });
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const toasts = []; await p.exposeFunction('__t', t => toasts.push(t));
const formPosts = [];
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_cloud_seeded', '1'); });
const kv = { sc_hide_sample: '1', sc_clients: JSON.stringify({ c1: { id: 'c1', name: 'Dana Client', _token: 't_c1' } }) };
await p.route('**/api/**', r => { const u = r.request().url(); const ok = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.includes('cloud-status')) return ok({ enabled: true });
  if (u.includes('/api/store') && r.request().method() === 'GET') return ok({ data: kv });
  if (u.includes('/api/provider-form')) { formPosts.push(JSON.parse(r.request().postData() || '{}')); return ok({ ok: true, id: 'ev_sod_' + formPosts.length }); }
  return ok({ ok: true, clients: [], events: [] }); });
await p.goto('http://localhost:8899/slickchart.html');
await p.waitForFunction(() => typeof Cloud !== 'undefined' && Cloud._pulledOnce && !Cloud._booting, null, { timeout: 30000 }).catch(() => {});
await sleep(1500);
const fid = await p.evaluate(() => { const k = Object.keys(formTmpls).find(k => (formTmpls[k].qs || []).some(q => q.type === 'Short text' || q.type === 'Long text')); return k; });
async function signOnce(answer) {
  await p.evaluate(([fid]) => { proToast = (m) => window.__t(String(m)); renderSignOnDevice(fid, 'c1'); }, [fid]);
  await sleep(300);
  await p.evaluate((a) => { const el = document.querySelector('[id^="sd-"].fi, textarea[id^="sd-"], input[id^="sd-"]'); if (el) el.value = a; _signPadInk = true; }, answer);
  await p.evaluate(([fid]) => submitSignOnDevice(fid, 'c1'), [fid]);
  await sleep(800);
}
await signOnce('First visit answer');
await signOnce('Today: started Accutane last week');
const r = await p.evaluate(([fid]) => (CL.c1.submittedForms || []).filter(f => f.formId === fid).map(f => ({ evId: f.evId, at: f.at, answers: f.answers })), [fid]);
check('signing the same form a second time files NOTHING (no record, no server event) but toasts "signed"',
  r.length === 1 && formPosts.length === 1 && toasts.filter(t => /signed/.test(t)).length === 2, { fid, records: r, providerFormPosts: formPosts.length, toasts });
check('the drawn signature is not stored anywhere in the record or the server event',
  !JSON.stringify(r).includes('data:image') && !JSON.stringify(formPosts).includes('data:image'), { keys: formPosts[0] && Object.keys(formPosts[0]) });
let bad = 0; for (const x of results) { if (!x.p) bad++; console.log((x.p ? 'CONFIRMED-BUG ' : 'SOUND         ') + x.n + '  — ' + x.d.slice(0, 600)); }
await b.close();
