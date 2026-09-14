// The free starter funnel — "Your First Screen".
//
// A separate product from SlickChart the app, so it keeps a separate everything: its own table
// (free_signups), its own Resend audience (FREE_AUDIENCE_ID), its own from-address, and its own
// email chrome without the Botanical Aesthetics signature, which belongs to the esthetics business
// and not to this. What it DOES share with lib/nurture.js is the part that must never fork: the
// signed unsubscribe token and the nurture_optout / nurture_sends tables, so one opt-out silences
// every kind of email and no step can ever be sent twice.
import { unsubToken } from './nurture.js';

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
