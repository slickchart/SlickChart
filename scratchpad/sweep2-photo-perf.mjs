// sweep2-photo-perf: every photo of every client is held as a base64 data URL in ONE in-memory object
// (capturedPhotos) and persistCapturedPhotos() re-writes that WHOLE object to IndexedDB key
// 'captured_photos' on every single capture (and on every pid mint, check-in, restore). Cost grows with the
// size of the whole library, not the photo just taken. Measures one capture's persist at several sizes.
//   node scratchpad/sweep2-photo-perf.mjs
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const PORT = process.env.PORT || 8899;
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext(); const p = await ctx.newPage();
await p.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', '1'); localStorage.setItem('sc_onboarded', '1'); localStorage.setItem('sc_hide_sample', '1'); });
await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"enabled":false,"data":{},"clients":[],"events":[]}' }));
await p.goto('http://localhost:' + PORT + '/slickchart.html'); await p.waitForTimeout(6000);
for (const n of [50, 200, 500]) {
  const r = await p.evaluate(async (n) => {
    const s = 'data:image/jpeg;base64,' + 'J'.repeat(400000);   // a 1600px capture is ~300-600K chars
    Object.keys(capturedPhotos).forEach(k => delete capturedPhotos[k]);
    for (let i = 0; i < n; i++) { const c = 'c' + (i % 40); (capturedPhotos[c] = capturedPhotos[c] || []).push({ url: s.slice(0, -6) + String(i).padStart(6, '0'), ts: i, phase: 'before', pid: 'ph_' + i }); }
    await persistCapturedPhotos();
    const t0 = performance.now(); capturedPhotos.c0.push({ url: s, ts: Date.now(), phase: 'after', pid: 'ph_new' }); await persistCapturedPhotos();
    const ms = Math.round(performance.now() - t0);
    return { n, libraryMB: Math.round(n * 0.4), msToSaveOnePhoto: ms, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null };
  }, n);
  console.log(JSON.stringify(r));
}
await b.close();
