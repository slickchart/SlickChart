// SlickChart nurture / drip engine.
//
// Two automated email sequences, driven entirely off data the app already stores
// (waitlist.created_at for leads, providers.created_at for providers) and sent through
// the existing Resend sender in lib/email.js. No third-party automation tool needed.
//
// Design / safety:
//   • Once-only: every (email, seq, step) is claimed atomically in `nurture_sends`
//     via INSERT ... ON CONFLICT DO NOTHING RETURNING — overlapping cron runs can't
//     double-send. A send failure releases the claim so it retries next run.
//   • Paced: at most ONE email per contact per run (the earliest due, unsent step),
//     so a contact can never receive a burst even on a catch-up run.
//   • Start guard: only contacts created on/after NURTURE_START (default: the day this
//     shipped) are enrolled, so pre-existing/test contacts are never retroactively mailed.
//   • Exit: a lead who has become a provider is dropped from the lead sequence.
//   • Compliant: every email carries a working, signed one-click unsubscribe link, and
//     opted-out addresses are excluded from all future sends.
import crypto from 'crypto';
import { sql, ensureProvidersTable } from './db.js';
import { sendEmail } from './email.js';
import { signupPricing } from './pricing.js';
import { getReferralSettings } from './referral.js';
// The price a prospect would pay if they signed up today ($10 until 2026-11-07, then $17).
const P = () => signupPricing();

const SITE = (process.env.APP_ORIGIN || 'https://slickchart.app').replace(/\/+$/, '');
const CHECKLIST_URL = SITE + '/consent-aftercare-checklist.pdf';
const FROM = process.env.NURTURE_FROM || 'Ashley at SlickChart <ashley@slickchart.app>';
const REPLY_TO = process.env.NURTURE_REPLY_TO || 'ashley@slickchart.app';
// Physical mailing address for CAN-SPAM compliance (a PO box is fine). Set BUSINESS_ADDRESS
// in Vercel; until then the footer omits it — add it before scaling sends.
const ADDR = process.env.BUSINESS_ADDRESS || '';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Signed, unforgeable unsubscribe token so an unsubscribe link can't be used to opt
// third parties out en masse. Uses SESSION_SECRET (already required by the app).
export function unsubToken(email) {
  const secret = process.env.SESSION_SECRET || '';
  return crypto.createHmac('sha256', secret).update(String(email || '').toLowerCase()).digest('hex').slice(0, 32);
}
function unsubUrl(email) {
  return SITE + '/api/unsubscribe?e=' + encodeURIComponent(String(email || '').toLowerCase()) + '&t=' + unsubToken(email);
}

// Shared email chrome — dark header, warm body, signature, and the compliance footer.
export function wrap(bodyHtml, email) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:8px;color:#1a1a1a;">
    <div style="background:#0a1719;border-radius:14px;padding:22px 24px;text-align:center;color:#eaf6f4;">
      <img src="https://slickchart.app/assets/slickchart-logo.png" width="42" height="42" alt="" style="display:inline-block;margin:0 0 6px;">
      <img src="https://slickchart.app/assets/wordmark-dark.png" height="24" alt="SlickChart" style="height:24px;display:inline-block;">
      <div style="font-size:12px;color:#a2beb9;letter-spacing:.05em;text-transform:uppercase;">Built by an esthetician, for providers</div>
    </div>
    <div style="padding:26px 6px 6px;font-size:16px;line-height:1.7;color:#2a2a2a;">
      ${bodyHtml}
      <p style="font-size:16px;line-height:1.7;margin:22px 0 0;">With love,<br><strong>Ashley</strong><br><span style="color:#888;font-size:13px;">Founder, SlickChart</span></p>
    </div>
    <div style="margin-top:22px;padding-top:14px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#9a9a9a;line-height:1.6;">
      You're getting this because you signed up at slickchart.app.<br>
      <a href="${unsubUrl(email)}" style="color:#9a9a9a;text-decoration:underline;">Unsubscribe</a> · SlickChart${ADDR ? '<br>' + esc(ADDR) : ''}
    </div>
  </div>`;
}
function btn(href, label) {
  return `<div style="text-align:center;margin:24px 0;"><a href="${href}" style="background:#26c1b0;color:#03201e;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;display:inline-block;font-size:15px;">${esc(label)}</a></div>`;
}
export function footerText(email) {
  return `\n\n—\nYou're getting this because you signed up at slickchart.app.\nUnsubscribe: ${unsubUrl(email)}${ADDR ? '\n' + ADDR : ''}`;
}

// ─── LEAD SEQUENCE ─────────────────────────────────────────────────────────────
// From waitlist.created_at. A warm welcome + genuine free resource, then the two
// stories that convert (Protect, Profit), then the offer.
export const LEAD_SEQUENCE = [
  {
    day: 0,
    subject: () => 'Welcome — here’s a free checklist for you 🌿',
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>I’m Ashley — an esthetician who got tired of clunky, overpriced software and built my own, for solo beauty, wellness, and health pros. So glad you’re here.</p>
      <p>As a welcome, here’s a free resource I made: the <strong>Client Consent &amp; Aftercare Checklist</strong> — the documents and steps that protect your business on every client. Keep it by your station.</p>
      ${btn(CHECKLIST_URL, 'Download the free checklist')}
      <p>Over the next few days I’ll share the two things I wish someone had told me earlier: how to actually protect your practice, and how to make it pay you back. Keep an eye out.</p>`, c.email),
    text: (c) => `Hi ${c.first},\n\nI'm Ashley — an esthetician who got tired of clunky, overpriced software and built my own, for solo beauty, wellness, and health pros. So glad you're here.\n\nAs a welcome, here's a free resource I made: the Client Consent & Aftercare Checklist — the documents and steps that protect your business on every client:\n${CHECKLIST_URL}\n\nOver the next few days I'll share the two things I wish someone had told me earlier: how to actually protect your practice, and how to make it pay you back.\n\nWith love,\nAshley — Founder, SlickChart${footerText(c.email)}`,
  },
  {
    day: 2,
    subject: () => 'One dispute can end a solo practice. Here’s how to be covered.',
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>Hard truth I learned the hard way: most solo pros are one client dispute or one lapsed license away from a very bad day — and don’t realize it.</p>
      <p>Three things worth having on file for every client:</p>
      <p style="margin:0 0 4px;">1. A signed consent for every service<br>2. Timestamped before-and-after photos<br>3. Current, valid liability insurance (with a reminder before it lapses)</p>
      <p>I built SlickChart to do all three automatically — signed forms stored, a photo vault, and reminders 90 and 30 days before your license or insurance expires. Peace of mind, for $${P().month}/month (or $${P().year} a year).</p>
      ${btn(SITE, 'See how it protects you')}
      <p>More tomorrow on the part everyone likes better — the money. Reply anytime; I read every one.</p>`, c.email),
    text: (c) => `Hi ${c.first},\n\nMost solo pros are one client dispute or one lapsed license away from a very bad day — and don't realize it.\n\nThree things worth having on file for every client:\n1. A signed consent for every service\n2. Timestamped before-and-after photos\n3. Current, valid liability insurance (with a reminder before it lapses)\n\nSlickChart does all three automatically — signed forms stored, a photo vault, and reminders before your license or insurance expires. Peace of mind, for $${P().month}/month (or $${P().year} a year).\n\n${SITE}\n\nWith love,\nAshley${footerText(c.email)}`,
  },
  {
    day: 4,
    subject: () => 'The software that pays YOU back',
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>Most apps just cost you money every month. I wanted mine to make you some.</p>
      <p>Inside SlickChart you can sell your retail in your own shop, add affiliate and Amazon links so you earn on the products you already recommend, and build a course or paid guide — with no extra fee and no cut taken from your sales.</p>
      <p>It’s the only tool I know of designed to put money back in your pocket. And it’s $${P().month}/month, or $${P().year} a year.</p>
      ${btn(SITE, 'See the income tools')}`, c.email),
    text: (c) => `Hi ${c.first},\n\nMost apps just cost you money every month. I wanted mine to make you some.\n\nInside SlickChart you can sell your retail in your own shop, add affiliate and Amazon links so you earn on products you already recommend, and build a course or paid guide — no extra fee, no cut taken.\n\nThe only tool I know of designed to put money back in your pocket. $${P().month}/month, or $${P().year} a year.\n\n${SITE}\n\nWith love,\nAshley${footerText(c.email)}`,
  },
  {
    day: 6,
    subject: () => `Everything included, $${P().month} a month`,
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>Quick and honest: SlickChart is <strong>$${P().month}/month</strong> with every feature unlocked — no higher tier, no setup fee, nothing held back.</p>
      <p>Or pay <strong>$${P().year} for the year</strong> and get 2 months free.</p>
      <p>Cancel anytime, no contracts, and I never take a cut of your sales. Your clients use the app free.</p>
      ${btn(SITE, 'Start now')}
      <p>So glad you’re here — whatever you decide.</p>`, c.email),
    text: (c) => `Hi ${c.first},\n\nSlickChart is $${P().month}/month with every feature unlocked — no higher tier, no setup fee, nothing held back.\n\nOr pay $${P().year} for the year and get 2 months free.\n\nCancel anytime, no contracts, no cut of your sales. Clients use the app free.\n\nStart now: ${SITE}\n\nWith love,\nAshley${footerText(c.email)}`,
  },
];

// ─── PROVIDER SEQUENCE ──────────────────────────────────────────────────────────
// From providers.created_at. The signup flow already sends the welcome+verify email
// (day 0), so this is the follow-up onboarding: activate a feature, lock in protection,
// turn on income, then ask for a testimonial + referral.
export const PROVIDER_SEQUENCE = [
  {
    day: 2,
    subject: () => 'Chart your next client with your voice',
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>Try this on your very next client: open SlickChart, tap voice notes, and just talk through the session. It writes the note and files it in their chart — before you’ve cleaned your room.</p>
      <p>That one habit gives most providers 30–45 minutes back a day. Give it a go and tell me how it felt.</p>
      ${btn(SITE + '/slickchart', 'Open SlickChart')}`, c.email),
    text: (c) => `Hi ${c.first},\n\nTry this on your next client: open SlickChart, tap voice notes, and talk through the session. It writes the note and files it in their chart before you've cleaned your room. Most providers get 30–45 minutes back a day.\n\n${SITE}/slickchart\n\nWith love,\nAshley${footerText(c.email)}`,
  },
  {
    day: 4,
    subject: () => 'Lock in your protection (5 minutes)',
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      ${c.facts && c.facts.formsBack > 0 ? `<p>You already have a client form back, signed and stored. Nice work! One more quick step today:</p>
      <p style="margin:0 0 4px;">Upload your license and insurance to your document vault. SlickChart will remind you before they expire.</p>` : `<p>Let’s make sure you’re covered. Two quick setup steps today:</p>
      <p style="margin:0 0 4px;">1. Upload your license and insurance to your document vault — SlickChart will remind you before they expire.<br>2. Send a client your consent/intake form and watch it come back signed and stored.</p>`}
      <p>That’s the safety net most solo pros never had. Done in five minutes.</p>
      ${btn(SITE + '/slickchart', 'Set up your vault')}`, c.email),
    text: (c) => `Hi ${c.first},\n\n${c.facts && c.facts.formsBack > 0 ? 'You already have a client form back, signed and stored. One more quick step today:\nUpload your license and insurance to your document vault. SlickChart reminds you before they expire.' : 'Two quick setup steps today:\n1. Upload your license and insurance to your document vault — SlickChart reminds you before they expire.\n2. Send a client your consent/intake form and watch it come back signed and stored.'}\n\nThe safety net most solo pros never had. Five minutes.\n\n${SITE}/slickchart\n\nWith love,\nAshley${footerText(c.email)}`,
    facts: true,
  },
  {
    day: 6,
    subject: () => 'Turn your recommendations into income',
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>You already tell clients what to buy — let’s get you paid for it. Today:</p>
      <p style="margin:0 0 4px;">1. Add one product to your shop, or drop in an affiliate/Amazon link for something you love.<br>2. Think of one thing you could teach — a homecare guide, an aftercare course — and start it in the app. No extra fee, no cut taken.</p>
      <p>Small steps, real income. Reply if you want ideas for your niche.</p>
      ${btn(SITE + '/slickchart', 'Open your shop')}`, c.email),
    text: (c) => `Hi ${c.first},\n\nYou already tell clients what to buy — let's get you paid for it:\n1. Add one product to your shop, or drop in an affiliate/Amazon link.\n2. Start a course or paid guide in the app — no extra fee, no cut taken.\n\nSmall steps, real income. Reply for ideas for your niche.\n\n${SITE}/slickchart\n\nWith love,\nAshley${footerText(c.email)}`,
  },
  {
    day: 9,
    subject: () => 'A favor (and an invite for a friend)',
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>If SlickChart has saved you time or a headache, two things would mean the world:</p>
      <p style="margin:0 0 4px;">1. Send me a sentence or a 20-second video about your experience — I’d love to feature you (tagged, of course).<br>2. Know another solo pro who’d love this? Just share slickchart.app.</p>
      <p>Thank you for being here. This is only the beginning. 🌿</p>
      ${btn(SITE, 'Share SlickChart')}`, c.email),
    text: (c) => `Hi ${c.first},\n\nIf SlickChart has saved you time or a headache, two favors:\n1. Send me a sentence or a 20-second video about your experience — I'd love to feature you.\n2. Know another solo pro who'd love this? Send them over: slickchart.app\n\nThank you for being here. This is only the beginning.\n\nWith love,\nAshley${footerText(c.email)}`,
  },
  // ── Added 2026-11-16 (trial emails that follow what she has done). APPEND ONLY: a step's position in
  // this list is its stored id in nurture_sends, so inserting above would re-send old steps to everyone.
  // The loop runs the steps in `day` order, so a day-1 step can sit at the end. `since` keeps a new step
  // from going to anyone who joined before it existed. `skip` = she has already done it: the step is
  // marked done and nothing is sent.
  {
    day: 1,
    since: Date.parse('2026-11-16T00:00:00Z'),
    facts: true,
    skip: (f, s) => !!f && (f.square || f.clients >= s.grow_import_below),
    subject: () => 'Bring your clients in (about 2 minutes)',
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>SlickChart feels like home once your clients are in it. There are two quick ways:</p>
      <p style="margin:0 0 4px;">1. <strong>Use Square?</strong> Connect it and your clients and bookings come in on their own.<br>2. <strong>Coming from another app or a spreadsheet?</strong> Tap Import clients and pick the file. It reads the columns for you.</p>
      ${btn(SITE + '/slickchart?n=go&i=import-clients', 'Import my clients')}
      <p>No file yet? In your old app, look for <strong>Export clients</strong> or <strong>Download clients</strong>. That gives you the file to pick.</p>`, c.email),
    text: (c) => `Hi ${c.first},\n\nSlickChart feels like home once your clients are in it. Two quick ways:\n1. Use Square? Connect it and your clients and bookings come in on their own.\n2. Coming from another app or a spreadsheet? Tap Import clients and pick the file. It reads the columns for you.\n\nImport my clients: ${SITE}/slickchart?n=go&i=import-clients\n\nNo file yet? In your old app, look for Export clients or Download clients. That gives you the file to pick.\n\nWith love,\nAshley${footerText(c.email)}`,
  },
];

// ─── TRIAL ENDING ───────────────────────────────────────────────────────────────
// One email, a few days before a free trial ends (her setting grow_trial_end_days). Few clients and no
// Square: how to bring her clients in herself with the importer (her setting grow_import_offer). It is
// SELF-SERVE on purpose (Ashley, 2026-11-15: "make sure this is something you are able to do in an
// automated manner so its not me doing more work"): no "send us your file" offer, nothing lands on her.
// Otherwise: what she has set up so far, and what happens next. Always says plainly how to cancel.
function _fmtDay(ts) {
  try { return new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' }); } catch (e) { return ''; }
}
function _priceLine(t) {
  if (!t || !t.plan_amount) return '';
  const d = '$' + (Number(t.plan_amount) / 100).toFixed(Number(t.plan_amount) % 100 ? 2 : 0);
  return t.plan_interval === 'year' ? d + ' for the year' : d + ' a month';
}
export function trialEndEmail(c) {
  const f = c.facts || {};
  const when = _fmtDay(c.trialEnd);
  const price = _priceLine(c.trial);
  const yearly = c.trial && c.trial.plan_interval !== 'year' && c.trial.plan_amount
    ? '$' + Math.round(Number(c.trial.plan_amount) * 10 / 100) : '';
  const fewClients = !f.square && (f.clients || 0) < c.importBelow;
  const cancelLine = 'Not for you? Cancel any time before then in Settings, Subscription &amp; Billing, and you won’t be charged.';
  const cancelText = "Not for you? Cancel any time before then in Settings, Subscription & Billing, and you won't be charged.";
  if (fewClients && c.importOffer) {
    return {
      subject: 'Your free trial ends ' + (when || 'soon') + '. Bring your clients in first?',
      html: wrap(`
        <p>Hi ${esc(c.first)},</p>
        <p>Your free trial ends on <strong>${esc(when)}</strong>. Most providers fall in love with SlickChart once their own clients are in it, so let’s get yours in.</p>
        <p style="margin:0 0 4px;"><strong>It takes about 2 minutes:</strong> tap Import clients and pick a spreadsheet or the export from your old app. You see how every column matches before anything saves, and you can undo it.</p>
        ${btn(SITE + '/slickchart?n=go&i=import-clients', 'Import my clients')}
        <p>No file yet? In your old app, look for <strong>Export clients</strong> or <strong>Download clients</strong>. That gives you the file to pick.</p>
        <p style="font-size:14px;color:#777;">${cancelLine}</p>`, c.email),
      text: `Hi ${c.first},\n\nYour free trial ends on ${when}. Most providers fall in love with SlickChart once their own clients are in it, so let's get yours in.\n\nIt takes about 2 minutes: tap Import clients and pick a spreadsheet or the export from your old app. You see how every column matches before anything saves, and you can undo it.\n${SITE}/slickchart?n=go&i=import-clients\n\nNo file yet? In your old app, look for Export clients or Download clients. That gives you the file to pick.\n\n${cancelText}\n\nWith love,\nAshley${footerText(c.email)}`,
    };
  }
  const done = [];
  if (f.clients) done.push(f.clients + ' client' + (f.clients === 1 ? '' : 's') + ' in your list');
  if (f.formsBack) done.push(f.formsBack + ' form' + (f.formsBack === 1 ? '' : 's') + ' and check-in' + (f.formsBack === 1 ? '' : 's') + ' back from clients');
  if (f.square) done.push('Square connected');
  const doneHtml = done.length ? '<p>Here’s what you’ve set up so far:</p><p style="margin:0 0 4px;">' + done.map(x => '✓ ' + esc(x)).join('<br>') + '</p>' : '';
  const doneText = done.length ? "Here's what you've set up so far:\n" + done.map(x => '- ' + x).join('\n') + '\n\n' : '';
  return {
    subject: 'Your free trial ends ' + (when || 'soon'),
    html: wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>Your free trial ends on <strong>${esc(when)}</strong>.</p>
      ${doneHtml}
      <p>There’s nothing you need to do to keep going${price ? ': it simply continues at ' + esc(price) : ''}.${yearly ? ' Prefer to pay once a year? Switch to yearly for ' + esc(yearly) + ' in Settings, Subscription &amp; Billing. That’s 2 months free.' : ''}</p>
      ${btn(SITE + '/slickchart', 'Open SlickChart')}
      <p>Questions, or something not working the way you hoped? Just reply. I read every one.</p>
      <p style="font-size:14px;color:#777;">${cancelLine}</p>`, c.email),
    text: `Hi ${c.first},\n\nYour free trial ends on ${when}.\n\n${doneText}There's nothing you need to do to keep going${price ? ': it simply continues at ' + price : ''}.${yearly ? ' Prefer to pay once a year? Switch to yearly for ' + yearly + ' in Settings, Subscription & Billing. That is 2 months free.' : ''}\n\nQuestions, or something not working the way you hoped? Just reply. I read every one.\n\n${cancelText}\n\nWith love,\nAshley${footerText(c.email)}`,
  };
}

// ─── WHAT SHE HAS DONE ──────────────────────────────────────────────────────────
// Counts only, read for ONE provider by her own provider id (from the providers row the cron is
// walking, never from a request). Any read that fails leaves that fact unknown (null), and an unknown
// fact never skips an email: the step is sent as it always was.
export async function providerFacts(q, providerId) {
  const f = { clients: 0, square: false, formsBack: 0 };
  if (!providerId) return null;
  try {
    const r = (await q`SELECT v FROM kv WHERE owner = ${String(providerId)} AND k = 'sc_clients' AND length(v) < 8000000`)[0];
    if (r && r.v) {
      const o = JSON.parse(r.v);
      const list = Array.isArray(o) ? o : (o && typeof o === 'object' ? Object.values(o) : []);
      f.clients = list.filter(c => c && typeof c === 'object' && !c.deleted && !c.removed).length;
    }
  } catch (e) { return null; }
  try {
    const r = await q`SELECT 1 FROM square_connections WHERE provider_id = ${String(providerId)} AND access_token IS NOT NULL LIMIT 1`;
    f.square = !!r.length;
  } catch (e) { f.square = false; }
  try {
    const r = await q`SELECT count(*)::int AS n FROM client_events WHERE provider_id = ${String(providerId)} AND kind IN ('form', 'checkin')`;
    f.formsBack = (r[0] && r[0].n) || 0;
  } catch (e) { f.formsBack = 0; }
  return f;
}

// ─── TABLES ────────────────────────────────────────────────────────────────────
export async function ensureNurtureTables(q) {
  // Leads source table (created by /api/waitlist; ensure it here too so the cron is self-sufficient).
  await q`CREATE TABLE IF NOT EXISTS waitlist (
    id serial PRIMARY KEY, email text UNIQUE, name text, profession text, created_at timestamptz DEFAULT now()
  )`;
  // One row per delivered step — the once-only guard.
  await q`CREATE TABLE IF NOT EXISTS nurture_sends (
    email text NOT NULL, seq text NOT NULL, step int NOT NULL,
    sent_at timestamptz DEFAULT now(), UNIQUE(email, seq, step)
  )`;
  // Unsubscribes — honored across every sequence.
  await q`CREATE TABLE IF NOT EXISTS nurture_optout (
    email text PRIMARY KEY, ts timestamptz DEFAULT now()
  )`;
}

// Emails that have unsubscribed in the Resend audience (e.g. via a broadcast's
// unsubscribe link). We treat Resend's `unsubscribed` flag as a source of truth so a
// single opt-out — from a broadcast OR a nurture email — stops every kind of email.
// Best-effort: on any API hiccup we fall back to just the local opt-out list.
export async function resendUnsubscribedSet() {
  const set = new Set();
  const key = process.env.RESEND_API_KEY || '';
  if (!key) return set;
  try {
    let aud = process.env.RESEND_AUDIENCE_ID || '';
    if (!aud) {
      const list = await fetch('https://api.resend.com/audiences', { headers: { Authorization: 'Bearer ' + key } });
      if (!list.ok) return set;
      const j = await list.json();
      const arr = (j && (j.data || j.audiences || j)) || [];
      aud = Array.isArray(arr) && arr[0] ? (arr[0].id || arr[0].audience_id) : '';
      if (!aud) return set;
    }
    const r = await fetch('https://api.resend.com/audiences/' + aud + '/contacts', { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) return set;
    const j = await r.json();
    const contacts = (j && (j.data || j.contacts || j)) || [];
    for (const c of (Array.isArray(contacts) ? contacts : [])) {
      if (c && c.unsubscribed && c.email) set.add(String(c.email).toLowerCase());
    }
  } catch (e) { /* best-effort — keep going with local opt-outs only */ }
  return set;
}

// ─── RUN ───────────────────────────────────────────────────────────────────────
export async function runNurture() {
  const q = sql();
  await ensureProvidersTable();
  await ensureNurtureTables(q);

  // Anyone unsubscribed in Resend (broadcast or nurture) is skipped everywhere.
  const unsub = await resendUnsubscribedSet();

  // Only enroll contacts created on/after this date (guards existing/test contacts).
  const startTs = process.env.NURTURE_START || '2026-07-13';



  const summary = { lead: 0, founder: 0, errors: 0 };   // keys match the stored seq values above

  // Leads: on the waitlist, created since start, not yet a provider, not opted out.
  const leads = await q`
    SELECT email, name, extract(epoch from created_at)*1000 AS ts
    FROM waitlist
    WHERE created_at >= ${startTs}
      AND lower(email) NOT IN (SELECT lower(email) FROM providers)
      AND lower(email) NOT IN (SELECT email FROM nurture_optout)`;
  for (const row of leads) { if (unsub.has(String(row.email || '').toLowerCase())) continue; await processContact(q, 'lead', LEAD_SEQUENCE, row, {}, summary); }

  // Providers created since start, not opted out.
  const providers = await q`
    SELECT id, email, name, extract(epoch from created_at)*1000 AS ts
    FROM providers
    WHERE created_at >= ${startTs}
      AND lower(email) NOT IN (SELECT email FROM nurture_optout)`;
  // NOTE: the seq key stays the literal 'founder'. It is a stored column in nurture_sends
  // (email, seq, step) — the record of which emails each person has already had. Renaming it would
  // make every existing provider look like they'd received nothing, and re-send them the whole
  // sequence. The customer-facing wording is what changed, not this key.
  // Her growth settings (lib/referral.js): the "few clients" line and the trial-ending email's timing.
  let gs = null;
  try { gs = await getReferralSettings(q); } catch (e) { gs = null; }
  const settings = gs || { grow_import_below: 5, grow_trial_end_days: 3, grow_import_offer: 1, grow_winback_on: 0 };
  for (const row of providers) {
    if (unsub.has(String(row.email || '').toLowerCase())) continue;
    // What she has done, read only if a step that needs it is due (lib/nurture.js providerFacts).
    let memo;
    const facts = async () => (memo !== undefined ? memo : (memo = await providerFacts(q, row.id)));
    await processContact(q, 'founder', PROVIDER_SEQUENCE, row, { factsFn: facts, settings }, summary);
  }

  // Trials ending in the next N days (her setting). One email per trial, ever.
  summary.trialend = 0;
  try { await runTrialEnding(q, unsub, settings, summary); } catch (e) { summary.errors++; console.error('[nurture] trial-ending failed', e && e.message || e); }

  // Providers who left: a short "what's new since you left" note, at most twice (her settings).
  summary.winback = 0;
  try { if (settings.grow_winback_on) await runWinback(q, unsub, settings, summary); } catch (e) { summary.errors++; console.error('[nurture] win-back failed', e && e.message || e); }

  return summary;
}

// ─── WIN-BACK ────────────────────────────────────────────────────────────────────
// Ashley, 2026-11-16: "do build in the win back emails". A provider who left (cancelled after paying,
// or, if she allows it, left during the free trial) gets at most TWO emails: N1 and N2 days after
// leaving (her settings). Each lists the What's new posts made SINCE THEY LEFT; with nothing new the
// email is not sent. Coming back is "sign in": the app's own renew screen shows her right price (an
// early provider keeps hers) and the right checkout, so nothing here builds a payment link.
// Never: someone paying again, someone who deleted their account (no providers row), someone who
// unsubscribed, someone who left longer ago than grow_winback_max_days, or two of our emails in a day.
export function winbackEmail(c) {
  const items = (c.updates || []).slice(0, 5);
  const second = c.step === 1;
  const subject = second ? 'Still here for you, ' + c.first + '. A few new things in SlickChart' : 'What’s new in SlickChart since you left';
  const li = items.map(u => `<li style="margin:0 0 10px;"><strong>${esc(u.title)}</strong>${u.body ? '<br><span style="color:#555;">' + esc(_short(u.body)) + '</span>' : ''}</li>`).join('');
  const lt = items.map(u => '- ' + u.title + (u.body ? ': ' + _short(u.body) : '')).join('\n');
  const intro = second
    ? 'It’s Ashley again. I keep building SlickChart with the providers who use it every day, and a lot has changed since you left:'
    : 'It’s Ashley from SlickChart. I wanted to share what we’ve added since you left. Many of these came straight from provider feedback:';
  const introT = intro.replace(/’/g, "'");
  const kept = 'Your account and everything in it are still there, so if you come back, it’s all where you left it.';
  return {
    subject,
    html: wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>${intro}</p>
      <ul style="padding-left:20px;margin:0 0 14px;">${li}</ul>
      <p>${kept}</p>
      ${btn(SITE + '/slickchart', 'Come back to SlickChart')}
      <p style="font-size:14px;color:#777;">Sign in with your usual email and password. If something made SlickChart hard to use, just reply and tell me. I read every one.</p>`, c.email),
    text: `Hi ${c.first},\n\n${introT}\n\n${lt}\n\n${kept.replace(/’/g, "'")}\n\nCome back to SlickChart: ${SITE}/slickchart\nSign in with your usual email and password. If something made SlickChart hard to use, just reply and tell me. I read every one.\n\nWith love,\nAshley${footerText(c.email)}`,
  };
}
function _short(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > 160 ? s.slice(0, 157).replace(/\s+\S*$/, '') + '…' : s;
}

async function runWinback(q, unsub, settings, summary) {
  const d1 = settings.grow_winback_days1, d2 = settings.grow_winback_days2, maxD = settings.grow_winback_max_days;
  let rows = [];
  try {
    // One row per email (subscriptions is keyed by email). Left = the subscription ended, never a pause.
    // When they left: the trial record's end/cancel time when there is one, else the row's last update.
    rows = await q`SELECT s.email, s.paid_notified_at, p.name,
        extract(epoch from COALESCE(t.ended_at, t.canceled_at, s.updated_at)) * 1000 AS left_ms,
        t.outcome
      FROM subscriptions s
      JOIN providers p ON lower(p.email) = s.email
      LEFT JOIN LATERAL (SELECT outcome, ended_at, canceled_at FROM trial_outcomes tt WHERE tt.email = s.email
        ORDER BY trial_start DESC NULLS LAST LIMIT 1) t ON true
      WHERE s.status IN ('canceled', 'unpaid', 'incomplete_expired')
        AND s.email NOT IN (SELECT email FROM nurture_optout)`;
  } catch (e) {
    try {
      rows = await q`SELECT s.email, s.paid_notified_at, p.name, extract(epoch from s.updated_at) * 1000 AS left_ms, NULL AS outcome
        FROM subscriptions s JOIN providers p ON lower(p.email) = s.email
        WHERE s.status IN ('canceled', 'unpaid', 'incomplete_expired') AND s.email NOT IN (SELECT email FROM nurture_optout)`;
    } catch (e2) { return; }
  }
  const now = Date.now();
  const updatesCache = {};
  for (const r of rows) {
    const email = String(r.email || '').trim().toLowerCase();
    if (!email || unsub.has(email)) continue;
    const leftMs = Number(r.left_ms) || 0;
    if (!leftMs) continue;
    const days = (now - leftMs) / 86400000;
    if (days < d1 || days > maxD) continue;
    const paid = !!r.paid_notified_at || r.outcome === 'canceled_after_paying';
    if (!paid && !settings.grow_winback_trials) continue;
    // The latest step that is due. A provider first seen past day N2 gets only the last email, never two
    // in a row; the earlier one is marked done without sending.
    const step = days >= d2 ? 1 : 0;
    const have = await q`SELECT step FROM nurture_sends WHERE email = ${email} AND seq = 'winback'`;
    const done = new Set(have.map(h => Number(h.step)));
    if (done.has(step)) continue;
    // The two win-back emails are never close together, even when the first went late (it waits for news).
    const lastWb = await q`SELECT 1 FROM nurture_sends WHERE email = ${email} AND seq = 'winback' AND sent_at > now() - interval '21 days' LIMIT 1`;
    if (lastWb.length) continue;
    const recent = await q`SELECT 1 FROM nurture_sends WHERE email = ${email} AND seq <> 'winback' AND sent_at > now() - interval '20 hours' LIMIT 1`;
    if (recent.length) continue;
    const key = String(Math.floor(leftMs / 3600000));
    let updates = updatesCache[key];
    if (!updates) {
      try { updates = updatesCache[key] = await q`SELECT title, body FROM announcements WHERE ts > to_timestamp(${leftMs / 1000}) ORDER BY ts DESC LIMIT 5`; }
      catch (e) { updates = updatesCache[key] = []; }
    }
    if (!updates.length) continue;   // nothing new to tell her: wait (a later post may make it worth sending)
    const claimed = await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'winback', ${step})
      ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`;
    if (!claimed.length) continue;
    if (step === 1 && !done.has(0)) { try { await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'winback', 0) ON CONFLICT DO NOTHING`; } catch (e) {} }
    const first = String(r.name || '').trim().split(/\s+/)[0] || 'there';
    const m = winbackEmail({ first, email, step, updates });
    try {
      await sendEmail({ to: email, from: FROM, replyTo: REPLY_TO, subject: m.subject, html: m.html, text: m.text });
      summary.winback++;
    } catch (e) {
      await q`DELETE FROM nurture_sends WHERE email=${email} AND seq='winback' AND step=${step}`;
      summary.errors++;
      console.error('[nurture] win-back send failed', email, e && e.message || e);
    }
  }
}

async function runTrialEnding(q, unsub, settings, summary) {
  let rows = [];
  try {
    rows = await q`SELECT t.sub_id, t.email, t.trial_end, t.plan_amount, t.plan_interval, p.id AS pid, p.name
      FROM trial_outcomes t JOIN providers p ON lower(p.email) = t.email
      WHERE t.outcome = 'trialing' AND t.trial_end > now()
        AND t.trial_end <= now() + make_interval(days => ${settings.grow_trial_end_days})
        AND t.email NOT IN (SELECT email FROM nurture_optout)`;
  } catch (e) { return; }   // no trial table yet: nothing to send
  for (const t of rows) {
    const email = String(t.email || '').trim().toLowerCase();
    if (!email || unsub.has(email)) continue;
    // Never two of our emails within a day: if another one went out in the last 20 hours, this one
    // waits for a later run (the window is days wide).
    const recent = await q`SELECT 1 FROM nurture_sends WHERE email = ${email} AND seq <> 'trialend' AND sent_at > now() - interval '20 hours' LIMIT 1`;
    if (recent.length) continue;
    const claimed = await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, 'trialend', 0)
      ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`;
    if (!claimed.length) continue;
    const facts = await providerFacts(q, t.pid);
    const first = String(t.name || '').trim().split(/\s+/)[0] || 'there';
    const m = trialEndEmail({ first, email, facts: facts || {}, trialEnd: new Date(t.trial_end).getTime(), trial: t,
      importBelow: settings.grow_import_below, importOffer: !!settings.grow_import_offer && !!facts });
    try {
      await sendEmail({ to: email, from: FROM, replyTo: REPLY_TO, subject: m.subject, html: m.html, text: m.text });
      summary.trialend++;
    } catch (e) {
      await q`DELETE FROM nurture_sends WHERE email=${email} AND seq='trialend' AND step=0`;
      summary.errors++;
      console.error('[nurture] trial-ending send failed', email, e && e.message || e);
    }
  }
}

// Send at most one email per contact per run: the earliest due, not-yet-sent step.
// `sender` overrides who it comes from — the free starter funnel is a different product with a
// different audience, so it sends as Ashley rather than as SlickChart. Exported so that funnel can
// reuse this loop (the once-only claim and the one-per-run pacing) rather than copying it.
export async function processContact(q, seq, sequence, row, ctx, summary, sender) {
  const email = String(row.email || '').trim().toLowerCase();
  if (!email) return;
  const daysSince = (Date.now() - Number(row.ts)) / 86400000;
  const first = String(row.name || '').trim().split(/\s+/)[0] || 'there';
  // Run the steps in day order but claim each by its position in the list (its stored id), so a step
  // appended later with an earlier day still goes out in the right order.
  const order = sequence.map((st, i) => i).sort((a, b) => sequence[a].day - sequence[b].day || a - b);

  for (const i of order) {
    const step = sequence[i];
    if (daysSince < step.day) break;              // not due yet — later steps aren't either
    if (step.since && Number(row.ts) < step.since) continue;   // she joined before this step existed
    // Claim atomically. If nothing returned, this step was already sent → try the next.
    const claimed = await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, ${seq}, ${i})
      ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`;
    if (!claimed.length) {
      // ...unless it was claimed SECONDS ago, which means another run is mid-flight for this
      // contact right now. Moving on to the next step there is how two overlapping runs (a manual
      // trigger landing on top of the scheduled one, say) put two emails in someone's inbox minutes
      // apart instead of days. The "one email per contact per run" pacing has to hold across
      // concurrent runs too, so stop on this contact and let the other run finish its one.
      const fresh = await q`SELECT email FROM nurture_sends
        WHERE email = ${email} AND seq = ${seq} AND step = ${i}
          AND sent_at > now() - interval '10 minutes'`;
      if (fresh.length) return;
      continue;
    }
    const c = { ...ctx, first, email };
    delete c.factsFn;
    if ((step.facts || step.skip) && ctx && ctx.factsFn) {
      try { c.facts = await ctx.factsFn(); } catch (e) { c.facts = null; }
    }
    // Already done it: mark the step done (the claim above stays) and send nothing. Unknown facts
    // (null) never skip.
    if (step.skip && c.facts && step.skip(c.facts, (ctx && ctx.settings) || {})) { summary.skipped = (summary.skipped || 0) + 1; continue; }
    try {
      await sendEmail({
        to: email,
        from: (sender && sender.from) || FROM,
        replyTo: (sender && sender.replyTo) || REPLY_TO,
        subject: step.subject(c), html: step.html(c), text: step.text(c)
      });
      summary[seq]++;
    } catch (e) {
      // Release the claim so a transient failure retries next run.
      await q`DELETE FROM nurture_sends WHERE email=${email} AND seq=${seq} AND step=${i}`;
      summary.errors++;
      console.error('[nurture] send failed', seq, i, email, e && e.message || e);
    }
    return;                                        // one email per contact per run
  }
}
