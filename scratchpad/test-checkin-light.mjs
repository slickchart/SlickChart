// Ashley 2026-10-20: "in light mode the check-in screens have a bug: an unread check-in card and the
// top of the check-in detail page show the client's name in text that's nearly invisible", and the
// provider app should default to light. Uses sweep-contrast's own WCAG audit on both check-in screens,
// in both themes, with a few brand colours.
// Run: (cd slickchart-vercel && python3 -m http.server 8899) & node scratchpad/test-checkin-light.mjs
import fs from 'fs';
import { launch, page, mk, boot } from './sweep3-session-lib.mjs';
const src = fs.readFileSync(new URL('./sweep-contrast.mjs', import.meta.url), 'utf8');
const PAGE_FN = src.slice(src.indexOf('const PAGE_FN=`') + 15, src.indexOf('\n`;', src.indexOf('const PAGE_FN=`'))).replace(/\\\\/g, '\\');
const T = mk(); const { b, ctx } = await launch();
const server = { sc_clients: JSON.stringify({ c1: { name: 'Cooper Howard', treatment: 'Facial', _token: 'TOKC1' } }) };

// 1. A provider who never picked a theme now opens in light; one who picked dark keeps dark.
{
  const P = await page(ctx, server); await boot(P.p, 4000);
  const t = await P.p.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), pref: _scThemePref() }));
  T.check('no theme chosen: the app opens in light', t.attr === 'light' && t.pref === 'light', JSON.stringify(t));
  await P.p.evaluate(() => _scSetTheme('dark')); await P.p.reload(); await P.p.waitForTimeout(3000);
  const d = await P.p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  T.check('a provider who chose dark stays dark after a relaunch', d === 'dark', d);
  await P.p.evaluate(() => _scSetTheme('light')); await P.p.close();
}

// 2. The client's name on both check-in screens reads in every theme and brand.
const P = await page(ctx, server); await boot(P.p, 5000);
await P.p.addScriptTag({ content: PAGE_FN });
const ci = { id: 'ci1', client: 'Cooper Howard', clientId: 'c1', treatment: 'Facial', dateLabel: 'Tue, Oct 21', time: '10:00 AM', read: false, flagged: ['New medication'], groups: [{ title: 'Health', rows: [{ label: 'Any new medication?', value: 'Yes', flagged: true, detail: 'Started tretinoin' }] }] };
for (const theme of ['light', 'dark']) for (const brand of ['#0F8A7E', '#D81B7A', '#E8D5C0', '#141414']) {
  const r = await P.p.evaluate(({ theme, brand, ci }) => {
    _scSetTheme(theme);
    try { brandColors.primary = brand; if (typeof applyTheme === 'function') applyTheme(); } catch (e) {}
    checkins.length = 0; checkins.push(JSON.parse(JSON.stringify(ci)));
    nav('checkins');
    const card = __audit().filter(f => f.kind === 'text');
    const cardName = card.filter(f => /Cooper/.test(f.text));
    nav('checkin-detail', 'ci1');
    const det = __audit().filter(f => f.kind === 'text');
    return { cardName, detName: det.filter(f => /Cooper/.test(f.text)), card: card.map(f => f.text + ' ' + f.ratio), det: det.map(f => f.text + ' ' + f.ratio) };
  }, { theme, brand, ci });
  T.check(`${theme} ${brand}: unread check-in card name readable`, !r.cardName.length, JSON.stringify(r.cardName));
  T.check(`${theme} ${brand}: check-in detail name readable`, !r.detName.length, JSON.stringify(r.detName));
  T.check(`${theme} ${brand}: nothing else on either screen fails contrast`, !r.card.length && !r.det.length, JSON.stringify({ card: r.card, det: r.det }));
}
T.check('no page errors', !P.errs.length, P.errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
