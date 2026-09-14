// The free starter funnel — "Your First Screen".
//
// A separate product from SlickChart the app, so it keeps a separate everything: its own table
// (free_signups), its own Resend audience (FREE_AUDIENCE_ID), its own from-address, and its own
// email chrome without the Botanical Aesthetics signature, which belongs to the esthetics business
// and not to this. What it DOES share with lib/nurture.js is the part that must never fork: the
// signed unsubscribe token and the nurture_optout / nurture_sends tables, so one opt-out silences
// every kind of email and no step can ever be sent twice.
import { sql, ensureBuildPurchasesTable } from './db.js';
import { unsubToken, ensureNurtureTables, processContact } from './nurture.js';

const SITE = (process.env.APP_ORIGIN || 'https://slickchart.app').replace(/\/+$/, '');
// Her own doc says these come from "Ashley <hello@slickchart.app>" — a different sender from the
// SlickChart provider emails on purpose, because this is a different audience.
const FROM = process.env.FREE_FROM || 'Ashley <hello@slickchart.app>';
const REPLY_TO = process.env.FREE_REPLY_TO || 'hello@slickchart.app';
// Physical mailing address (CAN-SPAM). Set BUSINESS_ADDRESS in Vercel; a PO box is fine.
const ADDR = process.env.BUSINESS_ADDRESS || '';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Same HMAC as the SlickChart emails, so one unsubscribe link works across both and cannot be
// used to opt a third party out.
export function freeUnsubUrl(email) {
  return SITE + '/api/unsubscribe?e=' + encodeURIComponent(String(email || '').toLowerCase()) + '&t=' + unsubToken(email);
}

export function freeWrap(bodyHtml, email) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:8px;color:#1a1a1a;">
    <div style="background:#050F10;border-radius:14px;padding:22px 24px;text-align:center;color:#EAF6F4;">
      <div style="font-size:19px;font-weight:700;letter-spacing:-.01em;">Build Your Own App</div>
      <div style="font-size:12px;color:#A2BEB9;letter-spacing:.05em;text-transform:uppercase;margin-top:2px;">with Ashley</div>
    </div>
    <div style="padding:26px 6px 6px;font-size:16px;line-height:1.7;color:#2a2a2a;">
      ${bodyHtml}
      <p style="font-size:16px;line-height:1.7;margin:22px 0 0;">Ashley</p>
    </div>
    <div style="margin-top:22px;padding-top:14px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#9a9a9a;line-height:1.6;">
      You're getting this because you asked for the free starter at ${esc(SITE.replace(/^https?:\/\//, ''))}/free.<br>
      <a href="${freeUnsubUrl(email)}" style="color:#9a9a9a;text-decoration:underline;">Unsubscribe</a>${ADDR ? '<br>' + esc(ADDR) : ''}
    </div>
  </div>`;
}

export function freeBtn(href, label) {
  return `<div style="text-align:center;margin:24px 0;"><a href="${esc(href)}" style="background:#2bc7a2;color:#03201E;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;display:inline-block;font-size:15px;">${esc(label)}</a></div>`;
}

export function freeFooterText(email) {
  return `\n\n—\nYou're getting this because you asked for the free starter at ${SITE.replace(/^https?:\/\//, '')}/free.\nUnsubscribe: ${freeUnsubUrl(email)}${ADDR ? '\n' + ADDR : ''}`;
}

export function freeSender() { return { from: FROM, replyTo: REPLY_TO }; }

// Everyone who asked for the free starter. Deliberately NOT the `waitlist` table: that one feeds
// the SlickChart provider lead sequence, and a person who wanted an app-building freebie would
// start receiving esthetician-software emails they never asked for.
export async function ensureFreeTables(q) {
  await q`CREATE TABLE IF NOT EXISTS free_signups (
    email text PRIMARY KEY,
    created_at timestamptz DEFAULT now()
  )`;
  await q`CREATE INDEX IF NOT EXISTS free_signups_created ON free_signups (created_at)`;
}

// ── Email 0: sent the instant they sign up ──────────────────────────────────────────────────
// Not on the cron. The cron runs every 30 minutes, and "here is the thing you just asked for"
// cannot wait half an hour — by then they have closed the tab and decided it did not work.
export const WELCOME_SUBJECT = 'Your first screen is in here';

export function welcomeHtml({ email, link }) {
  return freeWrap(`
    <p>Here it is.</p>
    ${freeBtn(link, 'Open your first screen')}
    <p>Two things before you start.</p>
    <p><strong>Pin it.</strong> Use the menu on the page and choose Pin. It then lives in your sidebar
    and you can find it tomorrow without digging through old chats.</p>
    <p><strong>Do it in one sitting if you can.</strong> It takes about 70 minutes. Momentum is most
    of this.</p>
    <p>By the end you will have a screen of your own idea that you can tap on your phone. Not a
    template. Yours.</p>
    <p>I will check in tomorrow.</p>`, email);
}

export function welcomeText({ email, link }) {
  return `Here it is.

Open your first screen: ${link}

Two things before you start.

PIN IT. Use the menu on the page and choose Pin. It then lives in your sidebar and you can find it tomorrow without digging through old chats.

DO IT IN ONE SITTING IF YOU CAN. It takes about 70 minutes. Momentum is most of this.

By the end you will have a screen of your own idea that you can tap on your phone. Not a template. Yours.

I will check in tomorrow.

Ashley${freeFooterText(email)}`;
}

// ── The five follow-ups ─────────────────────────────────────────────────────────────────────
// Days 1, 3, 5, 7 and 10 after signup, sent by the cron that already runs every 30 minutes for the
// SlickChart sequences. Ashley's copy, as she wrote it — I have not rewritten her voice.
//
// The numbers in days 5 and 7 (Claude's plan, Apple's $99, Google's $25, the 28-day D-U-N-S) are her
// claims from her own build, not anything verified from here, and prices move. Worth her re-reading
// before the first send.
const BUILD = SITE + '/build';

export const FREE_SEQUENCE = [
  {
    day: 1,
    subject: () => 'Did you get to a screen?',
    html: (c) => freeWrap(`
      <p>Quick check in.</p>
      <p>If you got there, I want to hear about it. Hit reply and tell me what you are building. I read every one.</p>
      <p>If you did not, it is almost always one of these two.</p>
      <p><strong>You skipped the interview.</strong> It feels slow to answer questions when you could just ask for the thing. But that step is the entire reason your demo comes out specific to you instead of generic. Go back and let it ask you.</p>
      <p><strong>You did not make the Project.</strong> Without one, every new chat forgets your app and you start explaining it from scratch. Make the Project, then start again. It takes two minutes and it saves you hours.</p>`, c.email),
    text: (c) => `Quick check in.

If you got there, I want to hear about it. Hit reply and tell me what you are building. I read every one.

If you did not, it is almost always one of these two.

YOU SKIPPED THE INTERVIEW. It feels slow to answer questions when you could just ask for the thing. But that step is the entire reason your demo comes out specific to you instead of generic. Go back and let it ask you.

YOU DID NOT MAKE THE PROJECT. Without one, every new chat forgets your app and you start explaining it from scratch. Make the Project, then start again. It takes two minutes and it saves you hours.

Ashley${freeFooterText(c.email)}`,
  },
  {
    day: 3,
    subject: () => 'The part nobody warns you about',
    html: (c) => freeWrap(`
      <p>Day one is the easy part. I want to tell you about day eight.</p>
      <p>You have a screen you like. You ask for one small change. You get it, and three things you liked are quietly broken. A button moved. A color changed. Something you spent an hour on is just gone.</p>
      <p>So you ask it to fix that, and something else breaks. Four days later you are trying to get back to where you were on Tuesday.</p>
      <p>That happened to me. Here is what stops it.</p>
      <p>Say this every single time, in every new chat:</p>
      <p style="background:#f4f7f6;border-left:3px solid #2bc7a2;padding:14px 16px;margin:18px 0;"><strong>Change only this: [the thing]. Keep everything else exactly the same.</strong></p>
      <p>That is it. Those words. Every time. It sounds too simple to matter and it is the single most useful thing I know about building this way.</p>
      <p>There is a way to make it permanent so you never have to type it again, and that is in the full system. But start saying it out loud today.</p>`, c.email),
    text: (c) => `Day one is the easy part. I want to tell you about day eight.

You have a screen you like. You ask for one small change. You get it, and three things you liked are quietly broken. A button moved. A color changed. Something you spent an hour on is just gone.

So you ask it to fix that, and something else breaks. Four days later you are trying to get back to where you were on Tuesday.

That happened to me. Here is what stops it.

Say this every single time, in every new chat:

  Change only this: [the thing]. Keep everything else exactly the same.

That is it. Those words. Every time. It sounds too simple to matter and it is the single most useful thing I know about building this way.

There is a way to make it permanent so you never have to type it again, and that is in the full system. But start saying it out loud today.

Ashley${freeFooterText(c.email)}`,
  },
  {
    day: 5,
    subject: () => 'What it actually cost me',
    html: (c) => freeWrap(`
      <p>People assume building an app costs thousands. Here is my real list.</p>
      <p style="margin:16px 0;line-height:1.9;">
        Claude, paid plan. Twenty to a hundred a month depending on how hard you go.<br>
        GitHub. Free.<br>
        Vercel, which is where the app actually lives. Free, and it gives you a real web address people can use.<br>
        Database. Free to start, and only if your app needs to remember things.<br>
        Stripe. A percentage when money moves. Nothing up front.<br>
        Domain name. Twelve to twenty a year, and optional.
      </p>
      <p>That is it to have a live app people can open and add to their home screen.</p>
      <p>The app stores are separate and optional. Ninety nine a year for Apple, twenty five once for Google.</p>
      <p>So money was never the expensive part. <strong>Six weeks of figuring out what order to do things in was the expensive part.</strong> That is the part I wrote down.</p>
      ${freeBtn(BUILD, 'The full system, $97')}`, c.email),
    text: (c) => `People assume building an app costs thousands. Here is my real list.

Claude, paid plan. Twenty to a hundred a month depending on how hard you go.
GitHub. Free.
Vercel, which is where the app actually lives. Free, and it gives you a real web address people can use.
Database. Free to start, and only if your app needs to remember things.
Stripe. A percentage when money moves. Nothing up front.
Domain name. Twelve to twenty a year, and optional.

That is it to have a live app people can open and add to their home screen.

The app stores are separate and optional. Ninety nine a year for Apple, twenty five once for Google.

So money was never the expensive part. Six weeks of figuring out what order to do things in was the expensive part. That is the part I wrote down.

The full system, $97: ${BUILD}

Ashley${freeFooterText(c.email)}`,
  },
  {
    day: 7,
    subject: () => 'The form that takes 28 days',
    html: (c) => freeWrap(`
      <p>Here is one specific thing that cost me a month, so it does not cost you one.</p>
      <p>There is a free number called a D-U-N-S. You request it from Dun and Bradstreet and it can take up to 28 days to come back.</p>
      <p>It is what lets you register your Google Play account as an organization instead of an individual. Registering as an individual puts you into a rule that adds another two to four weeks before you are allowed to publish.</p>
      <p>So the smart move is to request it in week one, while you are still designing screens, and it is sitting there ready exactly when you need it in week six.</p>
      <p>Nobody tells you this. I found out by getting it wrong.</p>
      <p>The whole roadmap is built that way. Everything that waits on somebody else starts early, so nothing ever blocks anything else. That is what I mean when I say it is a strategy and not a list.</p>
      ${freeBtn(BUILD, 'See the full six weeks')}`, c.email),
    text: (c) => `Here is one specific thing that cost me a month, so it does not cost you one.

There is a free number called a D-U-N-S. You request it from Dun and Bradstreet and it can take up to 28 days to come back.

It is what lets you register your Google Play account as an organization instead of an individual. Registering as an individual puts you into a rule that adds another two to four weeks before you are allowed to publish.

So the smart move is to request it in week one, while you are still designing screens, and it is sitting there ready exactly when you need it in week six.

Nobody tells you this. I found out by getting it wrong.

The whole roadmap is built that way. Everything that waits on somebody else starts early, so nothing ever blocks anything else. That is what I mean when I say it is a strategy and not a list.

See the full six weeks: ${BUILD}

Ashley${freeFooterText(c.email)}`,
  },
  {
    day: 10,
    subject: () => 'Last one from me about this',
    html: (c) => freeWrap(`
      <p>I will stop after this.</p>
      <p>The free starter was day one. The full system is the other five weeks, and I want to be straight about who it is for.</p>
      <p><strong>It is for you if</strong> you have an idea you actually want to exist, you are not technical, and you would rather follow proven steps than work out the strategy yourself.</p>
      <p><strong>It is not for you if</strong> you want somebody to build it for you, or you are shopping for a course to feel productive. This is work. It is just work that is laid out properly.</p>
      <p>What you get: the whole six weeks as one roadmap you pin and tick off, 35 written prompts so you are never staring at a blank box, and a 22 minute video of me walking you into it.</p>
      <p>Ninety seven dollars, once, yours forever.</p>
      ${freeBtn(BUILD, 'Get the full system')}
      <p>Either way, I am glad you built something.</p>`, c.email),
    text: (c) => `I will stop after this.

The free starter was day one. The full system is the other five weeks, and I want to be straight about who it is for.

IT IS FOR YOU IF you have an idea you actually want to exist, you are not technical, and you would rather follow proven steps than work out the strategy yourself.

IT IS NOT FOR YOU IF you want somebody to build it for you, or you are shopping for a course to feel productive. This is work. It is just work that is laid out properly.

What you get: the whole six weeks as one roadmap you pin and tick off, 35 written prompts so you are never staring at a blank box, and a 22 minute video of me walking you into it.

Ninety seven dollars, once, yours forever.

Get the full system: ${BUILD}

Either way, I am glad you built something.

Ashley${freeFooterText(c.email)}`,
  },
];

// ── The run ─────────────────────────────────────────────────────────────────────────────────
// Called from api/cron-nurture.js alongside runNurture(). Same guarantees as the SlickChart
// sequences, because it is literally the same loop: one email per person per run, every step
// claimed once in nurture_sends so overlapping crons cannot double-send.
export async function runFreeFunnel() {
  const q = sql();
  await ensureNurtureTables(q);
  await ensureFreeTables(q);
  // The buyer exclusion below reads this table, so it has to exist before the query runs.
  await ensureBuildPurchasesTable();

  const summary = { free: 0, errors: 0 };

  // Two exits, both enforced HERE rather than by remembering to remove someone at the right moment:
  //   • unsubscribed — one opt-out silences every sequence, SlickChart's included
  //   • bought the thing — nothing kills trust faster than being sold something you already own
  // Doing it as a filter rather than as a removal on purchase means it cannot be missed: it applies
  // to purchases recorded by the Stripe webhook AND by the /build/unlocked page, to purchases made
  // before this shipped, and to a purchase whose webhook never arrived at all.
  const rows = await q`
    SELECT email, extract(epoch from created_at)*1000 AS ts
    FROM free_signups
    WHERE lower(email) NOT IN (SELECT email FROM nurture_optout)
      AND lower(email) NOT IN (SELECT lower(email) FROM build_purchases WHERE email IS NOT NULL)`;

  const sender = freeSender();
  for (const row of rows) {
    await processContact(q, 'free', FREE_SEQUENCE, row, {}, summary, sender);
  }
  return summary;
}
