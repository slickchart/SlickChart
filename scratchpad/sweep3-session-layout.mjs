// 390px layout + page errors on every screen of the session flow, with a long name/treatment and
// every summary section populated. Screenshots to scratchpad/sweep3-shots/.
import fs from 'fs';
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
fs.mkdirSync('/home/user/SlickChart/scratchpad/sweep3-shots', { recursive: true });
const longName = 'Maximiliana Alexandrovna Featherstonehaugh-Worthington';
const server = { sc_clients: JSON.stringify({ c1: { name: longName, treatment: 'Signature HydraFacial Platinum with Dermaplaning and LED add-on', _token: 'TOKC1', allergies: 'Latex, salicylic acid, fragrance, lidocaine', medications: 'Accutane (stopped 3 months ago)', skin: 'Combination / sensitive', fitz: 'IV' } }) };
const P = await page(ctx, server);
await boot(P.p);
const screens = [['room', 'c1'], ['notes', 'c1'], ['write-note', 'c1'], ['session-summary', 'c1'], ['rebook', 'c1'], ['summary-history', 'c1']];
for (const [s, id] of screens) {
  const r = await P.p.evaluate(([s, id]) => { try { if (s === 'session-summary') { summaryCustomOpen = true; summaryToggles.metrics = true; } nav(s, id); } catch (e) { return { err: e.message }; }
    const offenders = [...document.querySelectorAll('#S *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > 391; }).slice(0, 5).map(el => el.tagName + '.' + (el.className || '') + ' right=' + Math.round(el.getBoundingClientRect().right) + ' "' + (el.innerText || '').slice(0, 40) + '"');
    return { sw: document.documentElement.scrollWidth, sSw: S.scrollWidth, sCw: S.clientWidth, offenders }; }, [s, id]);
  await P.p.screenshot({ path: `/home/user/SlickChart/scratchpad/sweep3-shots/${s}.png`, fullPage: false });
  T.check(`${s}: no horizontal overflow at 390px`, !r.err && r.sw <= 390 && r.sSw <= r.sCw + 1, JSON.stringify(r));
}
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
