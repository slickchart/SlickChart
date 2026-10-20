// Ashley 2026-10-20: "when i sent my client a spicule consent form this morning to sign (by text, she
// did receive text) when she went to open it, the form did not come through". The form is assigned on
// her device, but the client's app reads the copy on the server. This checks the server holds the form
// BEFORE the text leaves (the moment Messages opens, the app is in the background and its timers stop).
// Run: (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-text-form-reaches-client.mjs
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const forms = { tmpls: { custom2: { name: 'Spicule Peel Consent', qs: [{ id: 'q1', label: 'I understand the risks', type: 'Signature', required: true }] } }, custom: [{ id: 'custom2', name: 'Spicule Peel Consent' }] };
const server = { sc_forms: JSON.stringify(forms), sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', phone: '5551234567', treatment: 'Facial', _token: 'TOKC1' }, c2: { name: 'Dana Lee', phone: '5559876543', _token: 'TOKC2' } }) };
let slow = 0;
const P = await page(ctx, server, { handler: async (r, u, m) => { if (u.includes('/api/clients') && m === 'POST' && slow) { await new Promise(res => setTimeout(res, slow)); } return false; } });
await boot(P.p);
// What leaves for Messages, and when.
await P.p.evaluate(() => { window.__sms = []; window._smsHref = function (ph, msg) { window.__sms.push({ at: Date.now(), msg }); return 'sms:5550000000&body=x'; }; });
const formOnServer = (cid) => { const posts = P.clientPosts.filter(x => x.id === cid); const last = posts[posts.length - 1]; return !!(last && (last.data.pendingForms || []).some(f => f.formId === 'custom2' && (f.qs || []).length)); };
const firstServerAt = (cid) => { const hit = P.clientPosts.find(x => x.id === cid && (x.data.pendingForms || []).some(f => f.formId === 'custom2')); return hit ? hit.at : Infinity; };

// 1. Normal: open the send sheet, glance at the message, tap Text it.
await P.p.evaluate(() => shareFormLink('custom2', 'c1'));
await P.p.waitForTimeout(800);
await P.p.locator('#usend-sheet button', { hasText: 'Text it' }).click();
await P.p.waitForTimeout(300);
const s1 = await P.p.evaluate(() => window.__sms.slice());
T.check('Text it opens Messages with her client link', s1.length === 1 && /TOKC1/.test(s1[0].msg), JSON.stringify(s1));
T.check('the form is on the server before the text goes', s1.length === 1 && firstServerAt('c1') <= s1[0].at, 'server@' + firstServerAt('c1') + ' sms@' + (s1[0] && s1[0].at));
T.check('the copy on the server carries the questions', formOnServer('c1'));

// 2. Tapped straight away on a slow connection: Messages waits for the server to confirm.
slow = 1500;
await P.p.evaluate(() => { window.__sms = []; window._smsHref = function (ph, msg) { window.__sms.push({ at: Date.now(), msg }); return 'sms:5550000000&body=x'; }; shareFormLink('custom2', 'c2'); });
await P.p.evaluate(() => _uSendText());
await P.p.waitForTimeout(2500);
const s2 = await P.p.evaluate(() => (window.__sms || ['page reloaded: ' + location.href]).slice());
T.check('quick tap, slow signal: still on the server before the text goes', s2.length === 1 && firstServerAt('c2') <= s2[0].at, JSON.stringify(s2)+' '+await P.p.evaluate(()=>[...document.querySelectorAll('.toast,#pro-toast,[id*=toast]')].map(e=>e.innerText).join('/'))+' '+'server@' + firstServerAt('c2') + ' sms@' + (s2[0] && s2[0].at));
T.check('nothing went to the wrong client', !P.clientPosts.some(x => x.id === 'c1' && x.at > (s1[0] ? s1[0].at + 2000 : 0) && false));
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
