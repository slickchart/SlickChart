// Brand-new provider: 0 clients, nothing in any library. Every screen must open.
import { launch, page, mk } from './sweep2-ui-lib.mjs';
const T = mk(); const { b, ctx } = await launch();
const { p, errs } = await page(ctx, { sc_clients: '{}' });
await p.goto('http://localhost:8899/slickchart.html'); await p.waitForTimeout(7000);
const routes = ['home','clients','forms','messages','more','account','branding','biz-info','booking-link','notifications','notifications-feed','integrations','shop','partners','learn','virtual','vc-inbox','routine-builder','protocols','automations','vault','inventory','vendors','checkin-settings','checkin-preview','form-builder','bundles','merge-clients','help','flagged-intakes','revenue','calendar','today-appts','week-appts','week-clients','requests','data-setup','invite-clients','import-clients','checkins','new-client','add-automation','add-resource'];
const fails = await p.evaluate(rs => { const out = []; rs.forEach(s => { try { nav(s); } catch (e) { out.push(s + ': ' + e.message); } }); return out; }, routes);
await p.waitForTimeout(1500);
T.check('every screen opens with 0 clients', !fails.length, fails.join(' | '));
T.check('no page errors', !errs.length, errs.join(' | '));
await b.close(); process.exit(T.done() ? 1 : 0);
