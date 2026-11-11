// Tells a SHARER what her referral code did: a friend joined, and later, her free month is on.
// Email plus a push to her own phone app. Best-effort: never throws, so the Stripe webhook still gets
// its 200. Only the friend's FIRST name is ever included (CLAUDE.md §0).
import { sql } from './db.js';
import { sendEmail } from './email.js';
import { sendNativeToProvider } from './fcm.js';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(c) { const d = (Number(c) || 0) / 100; return '$' + (d % 1 ? d.toFixed(2) : String(d)); }

export function referralMessages(kind, { friend, cents, rewardOnPayment }) {
  const who = friend || 'A friend';
  if (kind === 'joined') {
    return {
      subject: who + ' joined SlickChart with your code',
      push: { title: 'Your code was used', body: who + ' just joined with your code. Your free month comes ' + (rewardOnPayment ? 'once they start paying.' : 'when their trial ends.') },
      text: who + ' just started SlickChart with your referral code. Thank you for sharing!\n\nTheir first month is free. Your free month comes ' + (rewardOnPayment ? 'once they start paying' : 'when their free trial ends') + ', and it goes on your bill by itself.\n\nAshley, SlickChart'
    };
  }
  return {
    subject: 'Your free month of SlickChart is on',
    push: { title: 'Your free month is on', body: 'Thank you for sharing SlickChart. ' + money(cents) + ' is off your next bill.' },
    text: 'Thank you for sharing SlickChart! ' + who + ' is now a SlickChart provider, so ' + money(cents) + ' has been taken off your next bill. You do not need to do anything.\n\nAshley, SlickChart'
  };
}

export async function notifySharer(referrerEmail, kind, info) {
  try {
    const q = sql();
    const p = (await q`SELECT id, name FROM providers WHERE lower(email) = ${String(referrerEmail || '').toLowerCase()} LIMIT 1`)[0];
    const m = referralMessages(kind, info || {});
    const first = p && p.name ? String(p.name).trim().split(/\s+/)[0] : '';
    const text = (first ? 'Hi ' + first + ',\n\n' : 'Hi,\n\n') + m.text;
    try {
      await sendEmail({ to: referrerEmail, subject: m.subject, text,
        html: '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;font-size:16px;line-height:1.6;color:#222;">'
          + text.split('\n\n').map(x => '<p>' + esc(x).replace(/\n/g, '<br>') + '</p>').join('') + '</div>' });
    } catch (e) { console.error('[referral-notify] email failed:', e && e.message || e); }
    if (p && p.id) { try { await sendNativeToProvider(p.id, { title: m.push.title, body: m.push.body, url: '/slickchart', tag: 'referral:' + kind }); } catch (e) {} }
  } catch (e) { console.error('[referral-notify]', e && e.message || e); }
}
