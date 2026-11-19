// Server side of cancels (2026-11-19): the sweep lists every cancel from Stripe (paying first), and the
// confirmation email goes once per cancellation she chose. Stripe and the email service are stubbed.
//   node --import ./scratchpad/stub-neon-loader.mjs scratchpad/test-cancellations-server.mjs
process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.RESEND_API_KEY = 're_x';
const L = await import('../slickchart-vercel/lib/cancellations.js');
const res = []; const check = (n, v, d) => res.push([n, !!v, d]);
const now = Math.floor(Date.now() / 1000), H = 3600, D = 86400;
const price = { unit_amount: 1700, recurring: { interval: 'month' } };
const subs = [
  { id: 's_trial', status: 'trialing', cancel_at_period_end: true, canceled_at: now - 2 * H, trial_end: now + 5 * D, current_period_end: now + 5 * D, customer: { email: 'tria@x.com' }, items: { data: [{ price }] }, cancellation_details: { reason: 'cancellation_requested', feedback: 'too_complex' } },
  { id: 's_paid', status: 'active', cancel_at_period_end: true, canceled_at: now - 3 * H, current_period_end: now + 20 * D, customer: { email: 'Jackie@x.com', name: 'Jackie B' }, items: { data: [{ price }] }, cancellation_details: { reason: 'cancellation_requested' } },
  { id: 's_old', status: 'canceled', canceled_at: now - 10 * D, ended_at: now - 10 * D, customer: { email: 'old@x.com' }, items: { data: [{ price }] }, cancellation_details: { reason: 'payment_failed' } },
  { id: 's_ancient', status: 'canceled', canceled_at: now - 90 * D, ended_at: now - 90 * D, customer: { email: 'gone@x.com' }, items: { data: [{ price }] } },
  { id: 's_live', status: 'active', cancel_at_period_end: false, customer: { email: 'live@x.com' }, items: { data: [{ price }] } },
  { id: 's_paused', status: 'active', pause_collection: { resumes_at: now + 30 * D }, customer: { email: 'p@x.com' }, items: { data: [{ price }] } }
];
const invoices = { s_paid: [{ amount_paid: 1700 }, { amount_paid: 1700 }], s_old: [{ amount_paid: 1700 }], s_trial: [] };
const sent = [];
globalThis.fetch = async (url, o) => {
  const u = String(url);
  const J = x => ({ ok: true, status: 200, json: async () => x, text: async () => '' });
  if (u.includes('/v1/subscriptions')) return J({ data: subs, has_more: false });
  if (u.includes('/v1/invoices')) { const id = new URL(u).searchParams.get('subscription'); return J({ data: invoices[id] || [] }); }
  if (u.includes('resend.com')) { sent.push(JSON.parse(o.body)); return J({ id: 'e1' }); }
  throw new Error('unexpected ' + u);
};
// A fake tagged-template q with the two tables the code uses.
const claims = new Map();
const q = async (strs, ...v) => {
  const t = strs.join('?');
  if (/CREATE TABLE/.test(t)) return [];
  if (/FROM providers/.test(t)) return /ANY/.test(t) ? [{ e: 'jackie@x.com', name: 'Jacqueline Boone' }] : [{ name: 'Jacqueline Boone' }];
  if (/INSERT INTO cancel_confirmations/.test(t)) { if (claims.has(v[0])) return []; claims.set(v[0], v[2]); return [{ sub_id: v[0] }]; }
  if (/DELETE FROM cancel_confirmations/.test(t)) { claims.delete(v[0]); return []; }
  throw new Error('unexpected sql ' + t);
};
const mask = e => e.slice(0, 3) + '…';
const r = await L.cancellationReport(q, 30, mask);
check('every cancel in 30 days is listed, nothing live, paused or older', r.items.map(i => i.email).sort().join() === 'jackie@x.com,old@x.com,tria@x.com', r.items.map(i => i.email).join());
check('paying customers come first', r.items[0].paying && r.items[1].paying && !r.items[2].paying, r.lines.join(' | '));
check('the paying line says so, with what she paid and when access ends', /^Jacqueline \(jac…\): PAYING customer, cancelled on \d{4}-\d\d-\d\d, access until \d{4}-\d\d-\d\d, \$17\/month, paid 2 times \(\$34\.00\)$/.test(r.lines[0]), r.lines[0]);
check('a failed card is marked as not her choice', /card failed \(not her choice\)/.test(r.lines.find(l => l.startsWith('(old'))), r.lines.join(' | '));
check('a trial cancel says trial and her Stripe reason', /on the free trial, cancelled on .*Said: too complicated/.test(r.lines.find(l => l.startsWith('(tri'))), r.lines.join(' | '));
check('last 24 hours holds the two from today, summary counts paying', r.last24h.length === 2 && /2 cancelled in the last 24 hours \(1 paying\)/.test(r.summary) && /3 in the last 30 days, 2 of them paying/.test(r.summary), r.summary);

// Confirmation email
let x = await L.sendCancelConfirmation(q, subs[1], 'jackie@x.com', {});
check('a chosen cancel sends one confirmation', x && x.sent && sent.length === 1 && sent[0].to === 'jackie@x.com' && /cancellation is confirmed/.test(sent[0].subject));
const body = sent[0] && sent[0].text || '';
check('it greets her by first name and says until when, with no charge', /^Hi Jacqueline,/.test(body) && /keep using SlickChart until /.test(body) && /Nothing more will be charged/.test(body), body);
check('it thanks her and asks for feedback and screenshots', body.includes('Thank you so much for your time and support. SlickChart is a brand new app, and I am a self-taught esthetician building it, so any and all feedback helps me grow and learn.') && /what made you want to cancel/.test(body) && /Screenshots/.test(body), body);
check('it tells her how to take it back', /Keep my subscription/.test(body));
check('no em dashes in the email', !/—/.test(body));
x = await L.sendCancelConfirmation(q, Object.assign({}, subs[1], { status: 'canceled', ended_at: now }), 'jackie@x.com', {});
check('the same cancellation ending later does not email again', !x && sent.length === 1);
await L.sendCancelConfirmation(q, Object.assign({}, subs[1], { cancel_at_period_end: false, canceled_at: null }), 'jackie@x.com', {});
x = await L.sendCancelConfirmation(q, subs[1], 'jackie@x.com', {});
check('Keep my subscription, then cancel again: confirmed again', x && x.sent && sent.length === 2);
x = await L.sendCancelConfirmation(q, subs[2], 'old@x.com', {});
check('a failed card gets no "cancellation confirmed"', !x && sent.length === 2);
x = await L.sendCancelConfirmation(q, subs[0], 'tria@x.com', { stillLive: true });
check('a duplicate subscription tidied up (another live one) sends nothing', !x && sent.length === 2);
x = await L.sendCancelConfirmation(q, subs[0], 'tria@x.com', {});
check('a trial cancel says the trial ends and she will not be charged', x && /free trial ends on .* and you will not be charged/.test(sent[2].text), sent[2] && sent[2].text);
x = await L.sendCancelConfirmation(q, subs[4], 'live@x.com', {});
check('a live plan sends nothing', !x && sent.length === 3);
res.forEach(r => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0] + (r[1] ? '' : '  ' + String(r[2] || '').slice(0, 400))));
const bad = res.filter(r => !r[1]); console.log(`\n${res.length - bad.length}/${res.length} passed`); process.exit(bad.length ? 1 : 0);
