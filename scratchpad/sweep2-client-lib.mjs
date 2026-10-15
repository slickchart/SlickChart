// Shared harness for the sweep2-client-*.mjs repros. Serves the REAL slickchart-client.html from the
// local static server (port 8899, slickchart-vercel/) and mocks every /api/** call per link token.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
export const BASE = 'http://localhost:8899/slickchart-client.html';
export const results = [];
export function check(name, bug, detail) {
  results.push({ name, bug, detail });
  console.log((bug ? 'CONFIRMED-BUG  ' : 'SOUND          ') + name + (detail !== undefined ? '\n               ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''));
}
export function finish() { console.log('\n' + results.filter(r => r.bug).length + ' confirmed of ' + results.length); }
export async function launch() {
  return pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
}
export function clientRecord(id, name, extra) {
  return { ok: true, client: { id, name, email: '', data: Object.assign({
    providerName: 'Prov ' + id, studio: 'Studio ' + id,
    profile: { email: id + '@ex.com', phone: '555000' + id.length, nextVisit: 'Not scheduled', treatment: 'Facial' },
    summaries: [], aftercare: [], products: [], pendingForms: [], forms: []
  }, extra || {}) } };
}
// opts: { records: {token: clientRecordJSON}, prefs: {token: obj}, messages: {token: []}, delays: {path: ms}, log: [] }
export async function mockApi(page, opts) {
  const log = opts.log || (opts.log = []);
  await page.route('**/api/**', async r => {
    const req = r.request();
    const u = new URL(req.url());
    const t = u.searchParams.get('t') || (() => { try { return JSON.parse(req.postData() || '{}').t; } catch (e) { return ''; } })();
    const p = u.pathname;
    const entry = { at: Date.now(), method: req.method(), path: p, t, body: req.postData() || '' };
    log.push(entry);
    const delay = (opts.delays && opts.delays[p + ':' + req.method()]) || (opts.delays && opts.delays[p]) || 0;
    if (delay) await new Promise(res => setTimeout(res, delay));
    entry.answeredAt = Date.now();
    const J = (o, s) => r.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (opts.handler) { const h = opts.handler(req, p, t, J); if (h) { await h; return; } }
    if (p === '/api/client-data') return opts.records[t] ? J(opts.records[t]) : J({ error: 'This link is not valid or has been removed.' }, 404);
    if (p === '/api/client-prefs') {
      if (req.method() === 'PUT') { try { (opts.prefs || (opts.prefs = {}))[t] = JSON.parse(req.postData()).prefs; } catch (e) {} return J({ ok: true }); }
      return J({ ok: true, prefs: (opts.prefs && opts.prefs[t]) || {} });
    }
    if (p === '/api/client-messages') return J({ ok: true, messages: (opts.messages && opts.messages[t]) || [] });
    if (p === '/api/client-submit') return J({ ok: true, id: 'ev_' + Math.random().toString(36).slice(2) });
    return J({ ok: true });
  });
  return log;
}
