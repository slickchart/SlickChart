// WHOLE-APP PERSISTENCE SWEEP. Reuses the screen list from sweep-whole-app.mjs. For every control, on a
// fresh copy of its screen: snapshot every saved sc_* value, tap, wait for saves to land, and if anything
// saved changed, RELOAD the app and check each changed value is still what the tap left (compared by
// meaning, not bytes). Anything that reverts on reload is a lost edit.
// usage: node sweep-whole-app-persist.mjs <crawl.json> <page.html> [seedJS] [app]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'fs';
const CRAWL = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const PAGE = process.argv[3] || 'slickchart.html';
const SEED = process.argv[4] || '';
const APP = process.argv[5] || 'provider';
const SKIP = /logout|_doLogout|signOut|sign out|deleteAccount|delete-account|_doDelete|wipe|purge|_resetApp|resetAll|clearAll|_doDeleteClientData|location\.reload|_reloadApp|window\.location|location\.href=|_hardRefresh|_forceUpdate|removeDemoClients|_setShotMode\(true|replayOnboarding/i;
const NOISE = /^(sc_bus$|sc_last|sc_seen|sc_.*_seen|sc_.*_at$|sc_nav|sc_boot|sc_build|sc_ev_fails|sc_pulse|sc_chart_activity|sc_.*tips|sc_.*_dismiss|sc_reload_log|sc_selfcheck|sc_queue|sc_pending|sc_sync)/;
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('dialog', d => d.dismiss().catch(() => {})); page.on('popup', p => p.close().catch(() => {}));
await page.addInitScript(([app]) => { try { localStorage.setItem('sc_onboarded', '1'); if (app === 'provider' && !location.pathname.includes('demo')) localStorage.setItem('sc_token', 'TESTTOKEN'); } catch (e) {}
  window.open = () => null; try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {} }, [APP]);
await page.route('**/api/**', r => { const u = r.request().url(); if (u.includes('cloud-status')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{},"clients":[],"events":[]}' }); });
await page.route(/^(?!http:\/\/localhost:8899).*/, r => { const u = r.request().url(); if (/cdn\.jsdelivr|fonts\.g|cdnjs|unpkg/.test(u)) return r.continue(); return r.abort(); });
const boot = async () => { await page.goto('http://localhost:8899/' + PAGE, { waitUntil: 'load' }); await page.waitForTimeout(2600); };
await boot(); if (SEED) { await page.evaluate(SEED); await page.evaluate(() => { try { saveClients(); } catch (e) {} try { persistWorkspace(); } catch (e) {} try { persistAffiliateLinks(); } catch (e) {} try { persistSessionSummaries(); } catch (e) {} }); await page.waitForTimeout(600); await boot(); }
const snapAll = () => page.evaluate(() => { const o = {}; const ks = (typeof _lsAllKeys === 'function') ? _lsAllKeys() : Object.keys(localStorage); ks.forEach(k => { if (/^sc_/.test(k)) { try { o[k] = (typeof _lsGet === 'function') ? _lsGet(k) : localStorage.getItem(k); } catch (e) {} } }); return o; });
const norm = v => { try { const j = JSON.parse(v); if (j && typeof j === 'object' && !Array.isArray(j)) delete j._ts; const s = x => Array.isArray(x) ? x.map(s) : (x && typeof x === 'object') ? Object.keys(x).sort().reduce((a, k) => (a[k] = s(x[k]), a), {}) : x; return JSON.stringify(s(j)); } catch (e) { return String(v); } };
const screens = CRAWL.screens.filter(x => !x.renderErr && !(x.errs && x.errs.length) && !/\$\{|"\+/.test(JSON.stringify(x.d)));
const findings = []; let writes = 0, taps = 0;
for (const scr of screens) {
  const n = await page.evaluate(([s, d]) => { try { d == null ? nav(s) : nav(s, d); } catch (e) { return 0; } const S = document.getElementById('S') || document.body; return Array.from(S.querySelectorAll('button,[onclick],[role=button]')).filter(e => e.offsetParent || e.getClientRects().length).length; }, [scr.s, scr.d]).catch(() => 0);
  for (let i = 0; i < Math.min(n, 60); i++) {
    const before = await snapAll();
    const r = await page.evaluate(([s, d, i, skip]) => { document.querySelectorAll('.shell > div[id], body > div[id]').forEach(x => { try { if (getComputedStyle(x).position === 'fixed' && x.id !== 'app') x.remove(); } catch (e) {} });
      try { d == null ? nav(s) : nav(s, d); } catch (e) { return null; } const S = document.getElementById('S') || document.body;
      const el = Array.from(S.querySelectorAll('button,[onclick],[role=button]')).filter(e => e.offsetParent || e.getClientRects().length)[i]; if (!el || el.disabled) return null;
      const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60); const act = (el.getAttribute('onclick') || '').slice(0, 90);
      if (new RegExp(skip, 'i').test(act + ' ' + label)) return null; try { el.click(); } catch (e) {}
      // a confirm box opened by the tap is the action she meant: confirm it, so the save path runs
      const ok = document.getElementById('_cf-ok'); if (ok && !/delete|remove|cancel subscription|disconnect/i.test((document.getElementById('_cf-ok').textContent || '') + label)) ok.click();
      return { label, act }; }, [scr.s, scr.d, i, SKIP.source]).catch(() => null);
    if (!r) continue; taps++;
    await page.waitForTimeout(900);
    const after = await snapAll();
    const changed = Object.keys(after).filter(k => !NOISE.test(k) && norm(after[k]) !== norm(before[k] == null ? 'null' : before[k]) && after[k] != null);
    if (!changed.length) continue; writes++;
    await boot();
    const reloaded = await snapAll();
    const lost = changed.filter(k => norm(reloaded[k] == null ? 'null' : reloaded[k]) !== norm(after[k]));
    if (lost.length) findings.push({ screen: scr.s + '|' + JSON.stringify(scr.d), i, ...r, lost: lost.map(k => ({ k, tapLeft: String(after[k]).slice(0, 160), afterReload: String(reloaded[k]).slice(0, 160) })) });
  }
}
await browser.close();
console.log(`${APP} ${PAGE}: ${taps} taps, ${writes} saved something, ${findings.length} lost on reload`);
for (const f of findings) { console.log('LOST ' + f.screen + ' #' + f.i + ' ' + f.label + ' :: ' + f.act); for (const l of f.lost) console.log('     ' + l.k + '\n       tap left : ' + l.tapLeft + '\n       reloaded : ' + l.afterReload); }
