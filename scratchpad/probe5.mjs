import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const puts = [];
await p.addInitScript(() => { localStorage.setItem('sc_token', 'TESTTOKEN'); localStorage.setItem('sc_onboarded', '1'); });
await p.route('**/api/**', r => { const u = r.request().url(); if (r.request().method() !== 'GET') puts.push(u.split('/api/')[1] + ' ' + (r.request().postData() || '').slice(0, 2000));
  return r.fulfill({ status: 200, contentType: 'application/json', body: u.includes('cloud-status') ? '{"enabled":true}' : JSON.stringify({ ok: true, data: { sc_bizinfo: JSON.stringify({ name: 'Botanical Aesthetics', ownerName: 'Ashley', _ts: 1700000000000 }), sc_availability: JSON.stringify({ mon: { open: true, start: '09:00', end: '17:00' }, _ts: 1700000000000 }), sc_deleted_vendors: JSON.stringify({ 'n:glymed plus': 1700000000000 }) }, clients: [] }) }); });
const boot = async () => { await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(3500); };
await boot();
const a = await p.evaluate(() => ({ biz: localStorage.getItem('sc_bizinfo'), av: (localStorage.getItem('sc_availability') || '').slice(-30), dv: localStorage.getItem('sc_deleted_vendors') }));
puts.length = 0; await boot();
const c = await p.evaluate(() => ({ biz: localStorage.getItem('sc_bizinfo'), av: (localStorage.getItem('sc_availability') || '').slice(-30), dv: localStorage.getItem('sc_deleted_vendors') }));
console.log('after 1st boot', JSON.stringify(a)); console.log('after 2nd boot', JSON.stringify(c));
console.log('pushes on a plain 2nd boot:'); for (const x of puts) { const m = x.match(/sc_bizinfo|sc_availability|sc_deleted_vendors|sc_deleted_partners/g); if (m) console.log('  ', x.slice(0, 120), [...new Set(m)].join(',')); }
const ts = puts.join('\n').match(/sc_bizinfo[^}]*_ts[^0-9]*(\d+)/); console.log('bizinfo _ts pushed:', ts && ts[1]);
await b.close();
