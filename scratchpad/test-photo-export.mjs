// All Photos download (provider ask, 2026-10-30): every photo on every client in one .zip, this
// device's copies plus the account's photos this device never downloaded; a folder per client.
// Also: the full backup's note no longer says photos "stay on this device".
import { launch, page, mk } from './sweep2-ui-lib.mjs';
import { execFileSync } from 'child_process';
const T = mk(); const { b, ctx } = await launch();
// 1x1 jpeg + png
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ts = new Date('2026-10-01T15:00:00').getTime();
const server = {
  sc_clients: JSON.stringify({ c1: { name: 'Jennie Milla', treatment: 'Facial' }, c2: { name: 'Sue/Bear "B"', treatment: 'Peel' } }),
  sc_photo_index: JSON.stringify({ c1: [{ pid: 'ph_local1', ts, phase: 'before', angle: 'Front' }, { pid: 'ph_srv1', ts, phase: 'after', angle: 'Front' }], c2: [{ pid: 'ph_srv2', ts, phase: 'before', angle: 'Left' }, { pid: 'ph_gone', ts, phase: 'after', angle: '' }] }),
};
const served = [];
const { p, errs, toasts } = await page(ctx, server, { handler: async (r, u) => {
  if (u.includes('/api/guide-file')) { const id = new URL(u).searchParams.get('id'); served.push(id);
    if (id === 'ph_srv1') { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ file: { name: 'x', type: 'image/png', data: PNG } }) }); return true; }
    if (id === 'ph_srv2') { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ file: { name: 'x', type: 'image/jpeg', data: JPG } }) }); return true; }
    await r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }); return true; }
} });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(6000);
await p.evaluate(({ JPG, ts }) => { capturedPhotos.c1 = [{ url: JPG, ts, phase: 'before', angle: 'Front', pid: 'ph_local1' }]; }, { JPG, ts });
await p.evaluate(() => nav('export-data')); served.length = 0;
T.check('Download your data shows an All Photos card', await p.locator('text=All Photos').count() === 1);
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('text=All Photos')]);
const path = '/tmp/claude-0/-home-user-SlickChart/0f73a147-3b0e-5bda-983a-f0350b2ae565/scratchpad/photos.zip';
await dl.saveAs(path);
T.check('file is named slickchart-photos-<date>.zip', /^slickchart-photos-\d{4}-\d\d-\d\d\.zip$/.test(dl.suggestedFilename()), dl.suggestedFilename());
const out = execFileSync('python3', ['-c', `
import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({'names':z.namelist(),'bad':z.testzip(),'sizes':[i.file_size for i in z.infolist()]}))`, path]).toString();
const z = JSON.parse(out);
T.check('zip opens and every entry checks out (CRC)', z.bad === null, out);
T.check('three photos: the local one and two fetched from the account', z.names.length === 3, out);
T.check('folder per client, dated names', z.names.includes('Jennie Milla/2026-10-01 before Front.jpg') && z.names.includes('Jennie Milla/2026-10-01 after Front.png') && z.names.some(n => n.startsWith('Sue-Bear -B-/2026-10-01 before Left')), out);
T.check('the local photo was not re-downloaded', !served.includes('ph_local1'), served.join(','));
await p.waitForTimeout(300);
T.check('toast says what could not be reached', toasts.some(t => /Saved 3 photos · 1 could not be reached/.test(t)), toasts.join(' | '));
// backup note
const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.evaluate(() => _exportAllData())]);
const p2 = path.replace('photos.zip', 'full.json'); await dl2.saveAs(p2);
const note = JSON.parse((await import('fs')).readFileSync(p2, 'utf8'))._note;
T.check('backup note no longer says photos stay on this device', !/stay on this device/.test(note) && /All Photos/.test(note), note);
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
