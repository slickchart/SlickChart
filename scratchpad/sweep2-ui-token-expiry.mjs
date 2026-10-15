// Tokens expire after 30 days (lib/auth.js signToken default, never renewed). Left open across that
// line, her next save gets 401 from /api/store. Cloud._send's 401 branch then runs _doLogout(), which
// deletes every sc_* key on the device — including the edit that just failed to upload. After she
// signs back in, the edit is nowhere. (The boot-time 401 path keeps the data; this one wipes it.)
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial' } }) };
let expired = false;
const { p, errs, toasts } = await page(ctx, server, { handler: async (r, u, m) => { if (expired && u.includes('/api/')) { await r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Not logged in."}' }); return true; } } });
// handler runs after the store mock, so put the 401 in front:
await p.unrouteAll(); 
await p.route('**/api/**', async r => { const u = r.request().url(); const m = r.request().method();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (expired) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Not logged in."}' });
  if (u.includes('/api/store') && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: Object.assign({ sc_hide_sample: '1' }, server) }) });
  if (u.includes('/api/store')) { try { Object.assign(server, JSON.parse(r.request().postData() || '{}').items || {}); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
expired = true;   // day 30 passes while the app is open
await p.evaluate(() => { activeNoteTemplate = 'soap'; nav('write-note', 'c1'); document.getElementById('wn-sec-s1').value = 'Reaction to peel: mild redness'; _saveWriteNote('c1'); });
await p.waitForTimeout(6000);
const local = await p.evaluate(async () => { const out = { ls: localStorage.getItem('sc_session_summaries') || '' }; try { out.mem = JSON.stringify(typeof sessionSummaries !== 'undefined' ? sessionSummaries : {}); } catch (e) {} return out; }).catch(e => ({ err: e.message }));
const kept = /mild redness/.test(local.ls || '') || /mild redness/.test(server.sc_session_summaries || '');
T.check('an expired session does not erase the note that just failed to upload', kept, JSON.stringify(local).slice(0, 200) + ' toasts=' + toasts.join(' | '));
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
