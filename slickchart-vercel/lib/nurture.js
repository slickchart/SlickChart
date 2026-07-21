// SlickChart nurture / drip engine.
//
// Two automated email sequences, driven entirely off data the app already stores
// (waitlist.created_at for leads, providers.created_at for founders) and sent through
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
//   • Exit: a lead who has become a provider (founder) is dropped from the lead sequence.
//   • Compliant: every email carries a working, signed one-click unsubscribe link, and
//     opted-out addresses are excluded from all future sends.
import crypto from 'crypto';
import { sql, ensureProvidersTable } from './db.js';
import { sendEmail } from './email.js';

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
function wrap(bodyHtml, email) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:8px;color:#1a1a1a;">
    <div style="background:#0a1719;border-radius:14px;padding:22px 24px;text-align:center;color:#eaf6f4;">
      <img src="https://slickchart.app/assets/slickchart-logo.png" width="42" height="42" alt="" style="display:inline-block;margin:0 0 6px;">
      <div style="font-size:20px;font-weight:700;">Slick<span style="color:#6fdca6;">Chart</span></div>
      <div style="font-size:12px;color:#a2beb9;letter-spacing:.05em;text-transform:uppercase;">Built by an esthetician, for providers</div>
    </div>
    <div style="padding:26px 6px 6px;font-size:16px;line-height:1.7;color:#2a2a2a;">
      ${bodyHtml}
      <p style="font-size:16px;line-height:1.7;margin:22px 0 0;">With love,<br><strong>Ashley</strong><br><span style="color:#888;font-size:13px;">Founder, SlickChart · Botanical Aesthetics</span></p>
    </div>
    <div style="margin-top:22px;padding-top:14px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#9a9a9a;line-height:1.6;">
      You're getting this because you signed up at slickchart.app.<br>
      <a href="${unsubUrl(email)}" style="color:#9a9a9a;text-decoration:underline;">Unsubscribe</a> · SlickChart · Botanical Aesthetics${ADDR ? '<br>' + esc(ADDR) : ''}
    </div>
  </div>`;
}
function btn(href, label) {
  return `<div style="text-align:center;margin:24px 0;"><a href="${href}" style="background:#26c1b0;color:#03201e;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;display:inline-block;font-size:15px;">${esc(label)}</a></div>`;
}
function footerText(email) {
  return `\n\n—\nYou're getting this because you signed up at slickchart.app.\nUnsubscribe: ${unsubUrl(email)}${ADDR ? '\n' + ADDR : ''}`;
}

// ─── LEAD SEQUENCE ─────────────────────────────────────────────────────────────
// From waitlist.created_at. A warm welcome + genuine free resource, then the two
// stories that convert (Protect, Profit), then the founding-seat invite.
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
      <p>I built SlickChart to do all three automatically — signed forms stored, a photo vault, and reminders 90 and 30 days before your license or insurance expires. Peace of mind, for $10/month.</p>
      ${btn(SITE, 'See how it protects you')}
      <p>More tomorrow on the part everyone likes better — the money. Reply anytime; I read every one.</p>`, c.email),
    text: (c) => `Hi ${c.first},\n\nMost solo pros are one client dispute or one lapsed license away from a very bad day — and don't realize it.\n\nThree things worth having on file for every client:\n1. A signed consent for every service\n2. Timestamped before-and-after photos\n3. Current, valid liability insurance (with a reminder before it lapses)\n\nSlickChart does all three automatically — signed forms stored, a photo vault, and reminders before your license or insurance expires. Peace of mind, for $10/month.\n\n${SITE}\n\nWith love,\nAshley${footerText(c.email)}`,
  },
  {
    day: 4,
    subject: () => 'The software that pays YOU back',
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>Most apps just cost you money every month. I wanted mine to make you some.</p>
      <p>Inside SlickChart you can sell your retail in your own shop, add affiliate and Amazon links so you earn on the products you already recommend, and build a course or paid guide — with no extra fee and no cut taken from your sales.</p>
      <p>It’s the only tool I know of designed to put money back in your pocket. And it’s $10/month.</p>
      ${btn(SITE, 'See the income tools')}`, c.email),
    text: (c) => `Hi ${c.first},\n\nMost apps just cost you money every month. I wanted mine to make you some.\n\nInside SlickChart you can sell your retail in your own shop, add affiliate and Amazon links so you earn on products you already recommend, and build a course or paid guide — no extra fee, no cut taken.\n\nThe only tool I know of designed to put money back in your pocket. $10/month.\n\n${SITE}\n\nWith love,\nAshley${footerText(c.email)}`,
  },
  {
    day: 6,
    subject: (c) => (c.spotsLeft > 0 ? `Only ${c.spotsLeft} founding seats left` : 'Founding seats are almost gone'),
    html: (c) => wrap(`
      <p>Hi ${esc(c.first)},</p>
      <p>Quick and honest: the first 250 founders get SlickChart for <strong>$10/month, locked for life</strong>.${c.spotsLeft > 0 ? ` There are <strong>${c.spotsLeft}</strong> seats left.` : ' They’re nearly full.'}</p>
      <p>When they’re gone, that price is gone for good. Full access, cancel anytime, no contracts, and I never take a cut of your sales. Your clients use the app free.</p>
      ${btn(SITE, 'Claim your founding seat')}
      <p>So glad you’re here — whatever you decide.</p>`, c.email),
    text: (c) => `Hi ${c.first},\n\nThe first 250 founders get SlickChart for $10/month, locked for life.${c.spotsLeft > 0 ? ` There are ${c.spotsLeft} seats left.` : ' They’re nearly full.'}\n\nWhen they're gone, that price is gone. Full access, cancel anytime, no contracts, no cut of your sales. Clients use the app free.\n\nClaim your seat: ${SITE}\n\nWith love,\nAshley${footerText(c.email)}`,
  },
];

// ─── FOUNDER SEQUENCE ──────────────────────────────────────────────────────────
// From providers.created_at. The signup flow already sends the welcome+verify email
// (day 0), so this is the follow-up onboarding: activate a feature, lock in protection,
// turn on income, then ask for a testimonial + referral.
export const FOUNDER_SEQUENCE = [
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
      <p>Let’s make sure you’re covered. Two quick setup steps today:</p>
      <p style="margin:0 0 4px;">1. Upload your license and insurance to your document vault — SlickChart will remind you before they expire.<br>2. Send a client your consent/intake form and watch it come back signed and stored.</p>
      <p>That’s the safety net most solo pros never had. Done in five minutes.</p>
      ${btn(SITE + '/slickchart', 'Set up your vault')}`, c.email),
    text: (c) => `Hi ${c.first},\n\nTwo quick setup steps today:\n1. Upload your license and insurance to your document vault — SlickChart reminds you before they expire.\n2. Send a client your consent/intake form and watch it come back signed and stored.\n\nThe safety net most solo pros never had. Five minutes.\n\n${SITE}/slickchart\n\nWith love,\nAshley${footerText(c.email)}`,
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
      <p style="margin:0 0 4px;">1. Send me a sentence or a 20-second video about your experience — I’d love to feature you (tagged, of course).<br>2. Know another solo pro who’d love this? Founding seats are almost gone — bring them in and you both keep the $10/month-for-life rate. Just share slickchart.app.</p>
      <p>Thank you for being a founder. This is only the beginning. 🌿</p>
      ${btn(SITE, 'Share SlickChart')}`, c.email),
    text: (c) => `Hi ${c.first},\n\nIf SlickChart has saved you time or a headache, two favors:\n1. Send me a sentence or a 20-second video about your experience — I'd love to feature you.\n2. Know another solo pro who'd love this? Bring them in and you both keep the $10/month-for-life rate: slickchart.app\n\nThank you for being a founder. This is only the beginning.\n\nWith love,\nAshley${footerText(c.email)}`,
  },
];

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
async function resendUnsubscribedSet() {
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

  // Founding-seats-left, for the day-6 lead email (mirrors /api/spots).
  const cap = parseInt(process.env.FOUNDING_CAP || '250', 10);
  const base = parseInt(process.env.SPOTS_TAKEN_BASE || '0', 10);
  let taken = base;
  try { const r = await q`SELECT count(*)::int AS n FROM providers`; taken = Math.max(base, (r[0] && r[0].n) || 0); } catch (e) {}
  const spotsLeft = Math.max(0, cap - Math.min(taken, cap));

  const summary = { lead: 0, founder: 0, errors: 0 };

  // Leads: on the waitlist, created since start, not yet a founder, not opted out.
  const leads = await q`
    SELECT email, name, extract(epoch from created_at)*1000 AS ts
    FROM waitlist
    WHERE created_at >= ${startTs}
      AND lower(email) NOT IN (SELECT lower(email) FROM providers)
      AND lower(email) NOT IN (SELECT email FROM nurture_optout)`;
  for (const row of leads) { if (unsub.has(String(row.email || '').toLowerCase())) continue; await processContact(q, 'lead', LEAD_SEQUENCE, row, { spotsLeft }, summary); }

  // Founders: providers created since start, not opted out.
  const founders = await q`
    SELECT email, name, extract(epoch from created_at)*1000 AS ts
    FROM providers
    WHERE created_at >= ${startTs}
      AND lower(email) NOT IN (SELECT email FROM nurture_optout)`;
  for (const row of founders) { if (unsub.has(String(row.email || '').toLowerCase())) continue; await processContact(q, 'founder', FOUNDER_SEQUENCE, row, { spotsLeft }, summary); }

  return summary;
}

// Send at most one email per contact per run: the earliest due, not-yet-sent step.
async function processContact(q, seq, sequence, row, ctx, summary) {
  const email = String(row.email || '').trim().toLowerCase();
  if (!email) return;
  const daysSince = (Date.now() - Number(row.ts)) / 86400000;
  const first = String(row.name || '').trim().split(/\s+/)[0] || 'there';

  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i];
    if (daysSince < step.day) break;              // not due yet — later steps aren't either
    // Claim atomically. If nothing returned, this step was already sent → try the next.
    const claimed = await q`INSERT INTO nurture_sends (email, seq, step) VALUES (${email}, ${seq}, ${i})
      ON CONFLICT (email, seq, step) DO NOTHING RETURNING email`;
    if (!claimed.length) continue;
    const c = { ...ctx, first, email };
    try {
      await sendEmail({ to: email, from: FROM, replyTo: REPLY_TO, subject: step.subject(c), html: step.html(c), text: step.text(c) });
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
