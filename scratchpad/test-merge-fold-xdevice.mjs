// A device that saved something under a client's COPY before hearing the copy was merged away: on its
// next pull that entry must land on the survivor, not be pruned (2026-10-15f, the third leftover).
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const results = []; const check = (n, p, d) => results.push({ name: n, pass: !!p, detail: d || '' });
const now = Date.now();
const acct = {
  sc_clients: JSON.stringify({ keep: { name: 'Pat Kim', squareId: 'SQP' } }),
  sc_deleted_clients: JSON.stringify({ cdrop: now - 60000 }),
  sc_merged_into: JSON.stringify({ cdrop: 'keep' }),
  sc_session_summaries: JSON.stringify({ keep: [{ ts: now - 86400000 * 7, date: 'last week', text: 'Old visit' }] }),
  sc_client_recs: JSON.stringify({ keep: ['p1'] }),
  sc_hide_sample: '1'
};
const local = {
  sc_clients: JSON.stringify({ keep: { name: 'Pat Kim', squareId: 'SQP' }, cdrop: { name: 'Pat Kim', squareId: 'SQP' } }),
  sc_session_summaries: JSON.stringify({ keep: [{ ts: now - 86400000 * 7, date: 'last week', text: 'Old visit' }], cdrop: [{ ts: now - 30000, date: 'today', text: 'Saved on the phone under the copy' }] }),
  sc_client_recs: JSON.stringify({ keep: ['p1'], cdrop: ['p2'] }),
  sc_body_maps: JSON.stringify({ cdrop: { ts: now - 20000, marks: [1, 2] } })
};
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(([local]) => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); localStorage.setItem('sc_cloud_seeded', '1'); for (const k in local) localStorage.setItem(k, local[k]); }, [local]);
const pushed = {};
await p.route('**/api/**', async r => { const u = r.request().url();
  if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' });
  if (u.includes('/api/store') && r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: acct }) });
  if (u.includes('/api/store')) { try { Object.assign(pushed, JSON.parse(r.request().postData() || '{}').items || {}); } catch (e) {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(12000);
const st = await p.evaluate(() => ({ ids: Object.keys(CL), sums: (sessionSummaries.keep || []).map(x => x.text), recs: clientRecs.keep, recsDrop: clientRecs.cdrop, body: bodyMaps.keep, bodyDrop: bodyMaps.cdrop }));
check('the copy is gone from the list', st.ids.indexOf('cdrop') < 0 && st.ids.indexOf('keep') >= 0, JSON.stringify(st.ids));
check('summary saved under the copy is now on the survivor', st.sums.indexOf('Saved on the phone under the copy') >= 0 && st.sums.indexOf('Old visit') >= 0, JSON.stringify(st.sums));
check('survivor\'s own product plan stands (not overridden)', JSON.stringify(st.recs) === '["p1"]', JSON.stringify(st.recs));
check('body map saved only under the copy moved to the survivor', st.body && st.body.marks && !st.bodyDrop, JSON.stringify([st.body, st.bodyDrop]));
let ps = null; try { ps = JSON.parse(pushed.sc_session_summaries || 'null'); } catch (e) {}
check('the survivor\'s summaries, with the moved one, are pushed to the account', ps && ps.keep && ps.keep.some(x => x.text === 'Saved on the phone under the copy') && !ps.cdrop, String(pushed.sc_session_summaries || 'not pushed').slice(0, 160));
check('no page errors', !errs.length, errs.join(' | '));
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : '  — ' + r.detail));
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
await b.close(); process.exit(results.every(r => r.pass) ? 0 : 1);
