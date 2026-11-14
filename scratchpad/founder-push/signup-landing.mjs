// Ashley's paid sign-up alert names the page a ChatGPT/ad visitor landed on (2026-11-13).
// client_reference_id may carry a 4th part (the landing path); older pages send 3 parts.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
process.env.DATABASE_URL = 'postgres://x';
const { parseClientRef, sourceLine } = await import(new URL('../../slickchart-vercel/lib/referral.js', import.meta.url).href);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const a = parseClientRef('utm__chatgptcom______/blog/virtual-esthetician');
ok(a && a.source === 'chatgptcom' && a.landing === '/blog/virtual-esthetician', 'landing page read from the 4th part');
ok(sourceLine(a) === 'Source: chatgptcom (landed on /blog/virtual-esthetician)', 'alert line names the page');
const b = parseClientRef('utm__facebook__fall__reel1');
ok(b && b.landing === '' && sourceLine(b) === 'Source: facebook / fall / reel1', 'older 3-part value unchanged');
ok(parseClientRef('utm__x__y__z__/<b>"x').landing === '/bx', 'landing cleaned to a-z 0-9 dash slash');
ok(sourceLine({ source: 'chatgptcom', campaign: '', content: '', ref_code: null }) === 'Source: chatgptcom', 'row with no landing column still reads');
ok(parseClientRef('nope') === null, 'non-utm ignored');
if (fails) { console.log(fails + ' failed'); process.exit(1); }
