// Every cancellation, paying or not (2026-11-19, Ashley: "sweep should show all cancels - especially
// people who were paying. also make sure we make a cancellation confirmation for people").
//
// Two jobs:
//   1. cancellationReport(q, days): read Stripe directly (the source of truth for billing) and list every
//      subscription that was cancelled, or is set to end, in the window. Paying customers first. The
//      trial report (lib/trial-outcomes.js) only ever saw subscriptions that began with a free trial, so a
//      paying provider who cancelled never showed up anywhere.
//   2. sendCancelConfirmation(q, sub, email): the email that tells a provider her cancellation went
//      through, once per cancellation. Stripe's own portal shows a confirmation on screen, but providers
//      who closed it (Jackie, 2026-11-19: "I didn't get confirmation of it being canceled") had nothing.
//
// Founder-only data. Nothing here is reachable by a provider except her own confirmation email.
import { stripeApi } from './referral.js';
import { sendEmail } from './email.js';

const FEEDBACK = { too_expensive: 'too expensive', missing_features: 'missing features', switched_service: 'switched to another app',
  unused: 'not using it', customer_service: 'customer service', too_complex: 'too complicated', low_quality: 'quality', other: 'other' };

// Pure: is this subscription cancelled or on its way out, and did SHE choose it?
//   'scheduled' = still active or trialing, ends at the end of the period
//   'ended'     = already cancelled
//   null        = not cancelling (includes a paused plan, which is not a cancellation)
export function cancelState(sub) {
  if (!sub) return null;
  const st = String(sub.status || '');
  if ((st === 'active' || st === 'trialing' || st === 'past_due') && (sub.cancel_at_period_end || sub.cancel_at)) return 'scheduled';
  if (st === 'canceled' || st === 'incomplete_expired') return 'ended';
  return null;
}
// Stripe's own reason: payment_failed means the card gave out, not a choice to leave.
export function chosen(sub) {
  const r = sub && sub.cancellation_details && sub.cancellation_details.reason;
  return r !== 'payment_failed';
}
function day(sec) { return sec ? new Date(sec * 1000).toISOString().slice(0, 10) : ''; }
function prettyDay(sec) {
  return sec ? new Date(sec * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' }) : '';
}
function firstName(n) { return n ? String(n).trim().split(/\s+/)[0] : ''; }
function planOf(sub) {
  const price = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price;
  return price && price.unit_amount ? '$' + (price.unit_amount / 100) + '/' + ((price.recurring && price.recurring.interval) || 'month') : '';
}
function freeCode(sub) {
  const d = sub.discount || (sub.discounts && sub.discounts[0]);
  const c = d && typeof d === 'object' && d.coupon;
  return !!(c && Number(c.percent_off) === 100);
}
// When she pressed cancel: Stripe stamps canceled_at both for "end at period end" and for "now".
function cancelledAt(sub) { return sub.canceled_at || sub.ended_at || 0; }
// When access actually stops.
function endsAt(sub) { return sub.cancel_at || sub.ended_at || sub.current_period_end || sub.trial_end || 0; }

export async function cancellationReport(q, days, maskEmail) {
  const d = Math.max(1, Math.min(365, Number(days) || 30));
  const out = { days: d, items: [], read: 0, error: '' };
  const cutoff = Math.floor(Date.now() / 1000) - d * 86400;
  const found = [];
  try {
    let after = null;
    for (let page = 0; page < 10; page++) {
      const params = { status: 'all', limit: 100, 'expand[]': 'data.customer' };
      if (after) params.starting_after = after;
      const r = await stripeApi('GET', '/subscriptions', params);
      if (!r.ok) { out.error = r.error || 'Stripe refused'; break; }
      const list = (r.data && r.data.data) || [];
      for (const sub of list) {
        out.read++;
        const state = cancelState(sub);
        if (!state) continue;
        const at = cancelledAt(sub);
        if (!at || at < cutoff) continue;
        found.push({ sub, state, at });
      }
      if (!(r.data && r.data.has_more) || !list.length) break;
      after = list[list.length - 1].id;
    }
  } catch (e) { out.error = (e && e.message) || 'Stripe read failed'; }
  const names = {};
  try {
    const emails = found.map(f => String((f.sub.customer && f.sub.customer.email) || '').toLowerCase()).filter(Boolean);
    if (emails.length) (await q`SELECT lower(email) AS e, name FROM providers WHERE lower(email) = ANY(${emails})`).forEach(r => { names[r.e] = r.name || ''; });
  } catch (e) {}
  for (const f of found) {
    const sub = f.sub;
    const email = String((sub.customer && sub.customer.email) || '').toLowerCase();
    // What she actually paid, ever, on this subscription. A handful of calls: only cancellations are read.
    let paidCount = 0, paidCents = 0;
    const inv = await stripeApi('GET', '/invoices', { subscription: sub.id, status: 'paid', limit: 100 });
    if (inv.ok) for (const i of ((inv.data && inv.data.data) || [])) { const a = Number(i.amount_paid || 0); if (a > 0) { paidCount++; paidCents += a; } }
    const cd = sub.cancellation_details || {};
    out.items.push({
      email, name: names[email] || (sub.customer && sub.customer.name) || '', state: f.state, chosen: chosen(sub),
      paying: paidCount > 0, paidCount, paidCents, freeCode: freeCode(sub), plan: planOf(sub),
      at: day(f.at), atSec: f.at, ends: day(endsAt(sub)), trial: !!sub.trial_end && paidCount === 0,
      feedback: cd.feedback ? (FEEDBACK[cd.feedback] || String(cd.feedback).replace(/_/g, ' ')) : '', comment: cd.comment ? String(cd.comment).slice(0, 300) : ''
    });
  }
  // Paying customers first, then newest.
  out.items.sort((a, b) => (b.paying - a.paying) || (b.atSec - a.atSec));
  const mask = maskEmail || (e => e);
  const line = r => (firstName(r.name) ? firstName(r.name) + ' ' : '') + '(' + mask(r.email) + '): '
    + (r.paying ? 'PAYING customer, ' : r.freeCode ? 'free code, ' : r.trial ? 'on the free trial, ' : 'never paid, ')
    + (r.state === 'scheduled' ? 'cancelled on ' + r.at + ', access until ' + r.ends : 'cancelled, ended ' + (r.ends || r.at))
    + (r.plan ? ', ' + r.plan : '') + (r.paying ? ', paid ' + r.paidCount + (r.paidCount === 1 ? ' time' : ' times') + ' ($' + (r.paidCents / 100).toFixed(2) + ')' : '')
    + (r.chosen ? '' : ', card failed (not her choice)')
    + (r.feedback || r.comment ? '. Said: ' + [r.feedback, r.comment].filter(Boolean).join(', ') : '');
  const day1 = Math.floor(Date.now() / 1000) - 86400;
  out.last24h = out.items.filter(r => r.atSec >= day1).map(line);
  out.lines = out.items.map(line);
  const paying24 = out.items.filter(r => r.atSec >= day1 && r.paying).length;
  const payingN = out.items.filter(r => r.paying).length;
  out.summary = (out.last24h.length ? out.last24h.length + ' cancelled in the last 24 hours' + (paying24 ? ' (' + paying24 + ' paying)' : '') + '. ' : 'Nobody cancelled in the last 24 hours. ')
    + out.items.length + ' in the last ' + d + ' days, ' + payingN + ' of them paying customers.';
  return out;
}

export async function ensureCancelTable(q) {
  await q`CREATE TABLE IF NOT EXISTS cancel_confirmations (sub_id TEXT PRIMARY KEY, email TEXT, state TEXT, sent_at TIMESTAMPTZ DEFAULT now())`;
}

export function confirmationEmail({ name, state, endsSec, trial }) {
  const hi = firstName(name) ? 'Hi ' + firstName(name) + ',' : 'Hi,';
  const until = prettyDay(endsSec);
  const access = state === 'scheduled' && until
    ? (trial ? 'Your free trial ends on ' + until + ', and you will not be charged.' : 'You can keep using SlickChart until ' + until + '. Nothing more will be charged.')
    : 'Your plan has ended. Nothing more will be charged.';
  // Ashley, 2026-11-19: "make sure to track reasons people cancel though and address those issues right
  // away. in the cancellation emails alwasy tell them that we addressed the issues, and tell them they
  // are always welcome baack." This email goes out the moment she cancels, before anything can be fixed,
  // so it says what is true then: her reasons are read and worked on right away. A personal reply later
  // says which fix went in (reply-agent.md, cancel rule).
  const back = (state === 'scheduled'
    ? 'Changed your mind? Go to Settings, then Security & billing, and tap Keep my subscription. '
    : '') + 'You are always welcome back. Just sign in at slickchart.app.';
  const fixes = 'I read every reason people share when they cancel, and I work on fixing it right away.';
  // Ashley, 2026-11-19: every cancel area thanks them for their time and support and says their feedback
  // helps her grow and learn. The same line as the app's _CANCEL_THANKS.
  const thanks = 'Thank you so much for your time and support. SlickChart is a brand new app, and I am a self-taught esthetician building it, so any and all feedback helps me grow and learn.';
  const ask = 'Would you be willing to reply and tell me what made you want to cancel? Screenshots of anything that did not work help a lot, if you have them.';
  const paras = ['Your SlickChart cancellation is confirmed.', access, 'Your clients, notes and photos stay saved in your account.', thanks, ask, fixes, back, 'Ashley'];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return {
    subject: 'Your SlickChart cancellation is confirmed',
    text: [hi].concat(paras).join('\n\n'),
    html: '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px;font-size:16px;line-height:1.6;color:#222;">'
      + [hi].concat(paras).map(p => '<p style="margin:0 0 14px;">' + esc(p) + '</p>').join('') + '</div>'
  };
}

// From the webhook (customer.subscription.updated / .deleted). Once per cancellation: a claim row per
// subscription, released again if she takes the cancellation back, so a second cancel later is confirmed
// too. A failed card (not her choice) gets no "your cancellation is confirmed". Never throws.
export async function sendCancelConfirmation(q, sub, email, opts) {
  try {
    if (!sub || !sub.id) return null;
    await ensureCancelTable(q);
    const state = cancelState(sub);
    if (!state) {
      // Back to a live plan ("Keep my subscription"): forget the earlier confirmation.
      if (sub.status === 'active' || sub.status === 'trialing') await q`DELETE FROM cancel_confirmations WHERE sub_id = ${sub.id}`;
      return null;
    }
    if (!chosen(sub)) return null;
    // Another live subscription on the same email (a duplicate signup being tidied up): she is not leaving.
    if (opts && opts.stillLive) return null;
    const em = String(email || '').trim().toLowerCase();
    if (!em) return null;
    // 'scheduled' then 'ended' is the same cancellation: one email.
    const claim = await q`INSERT INTO cancel_confirmations (sub_id, email, state) VALUES (${sub.id}, ${em}, ${state}) ON CONFLICT (sub_id) DO NOTHING RETURNING sub_id`;
    if (!claim.length) return null;
    let name = '';
    try { const p = await q`SELECT name FROM providers WHERE lower(email) = ${em}`; name = (p[0] && p[0].name) || ''; } catch (e) {}
    const paidTrial = sub.status === 'trialing';
    const m = confirmationEmail({ name, state, endsSec: endsAt(sub), trial: paidTrial });
    try { await sendEmail({ to: em, subject: m.subject, text: m.text, html: m.html }); }
    catch (e) {
      // Let the next event try again rather than recording an email that never left.
      await q`DELETE FROM cancel_confirmations WHERE sub_id = ${sub.id}`;
      throw e;
    }
    return { sent: true, state };
  } catch (e) { console.error('[cancellations] confirmation failed:', e && e.message || e); return null; }
}
