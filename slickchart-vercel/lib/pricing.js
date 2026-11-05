// The SlickChart price, in ONE place. Ashley raised it for NEW sign-ups (2026-11-04): from 12:00am
// Pacific on Saturday 2026-11-07 a new provider pays $17/month or $170/year. Everyone who signed up
// before that keeps $10/month or $100/year for life.
//
// Nothing here touches an existing Stripe subscription. A subscription keeps the price it was
// created with; this file only decides which payment link and which numbers a NEW person is shown.
//
// Fail-safe: the new price only shows once BOTH new payment links exist (the constants below, or
// STRIPE_PAYMENT_LINK_17 / STRIPE_PAYMENT_LINK_YEARLY_170 in Vercel). Until then everything stays on
// $10/$100, so a missing link can never leave a sign-up page pointing nowhere or quoting a price its
// checkout does not charge.
//
// The landing page (index.html) carries the same date and links in its own script. Keep them equal.
// No imports on purpose: lib/email.js and lib/nurture.js read this, and must stay importable alone.
// Same address as lib/stripe-subs.js YEARLY_LINK.
const YEARLY_LINK = 'https://buy.stripe.com/4gM28q8r91Qd92c7WJ4wM01';

export const PRICE_CHANGE_AT = Date.parse('2026-11-07T00:00:00-08:00'); // 12:00am PST, Sat Nov 7
// The $10/month link the landing page has always used (index.html STRIPE_LINK).
export const OLD_MONTHLY_LINK = 'https://buy.stripe.com/14AeVc0YH1Qd2DO1yl4wM00';
export const NEW_MONTHLY_LINK = 'https://buy.stripe.com/4gM8wOfTB9iF1zK3Gt4wM05';
export const NEW_YEARLY_LINK = 'https://buy.stripe.com/8x2bJ05eXcuRbak2Cp4wM04';

const OLD = { month: 10, year: 100 };
const NEW = { month: 17, year: 170 };

function newLinks() {
  const m = process.env.STRIPE_PAYMENT_LINK_17 || NEW_MONTHLY_LINK;
  const y = process.env.STRIPE_PAYMENT_LINK_YEARLY_170 || NEW_YEARLY_LINK;
  return (m && y) ? { m, y } : null;
}

function plan(p, m, y) {
  return { month: p.month, year: p.year, checkoutUrl: m, checkoutUrlYear: y,
    monthLabel: '$' + p.month + '/month', yearLabel: '$' + p.year + '/year',
    // what 12 months would cost at the monthly price, for "instead of $X"
    yearFull: p.month * 12 };
}

function oldPlan() { return plan(OLD, process.env.STRIPE_PAYMENT_LINK || OLD_MONTHLY_LINK, process.env.STRIPE_PAYMENT_LINK_YEARLY || YEARLY_LINK); }

// Is the new price live right now (date reached AND both links present)?
export function newPriceLive(now = Date.now()) { return now >= PRICE_CHANGE_AT && !!newLinks(); }

// The price a NEW person signing up right now pays.
export function signupPricing(now = Date.now()) {
  if (!newPriceLive(now)) return oldPlan();
  const l = newLinks();
  return plan(NEW, l.m, l.y);
}

// The price for an EXISTING account that has to renew (card gave up, or she cancelled and came
// back). Ashley's words: "Providers who signed up at $10/month keep that for life". What she last
// paid decides it when we know it (someone can pay $10 on Friday and only make the account on
// Sunday); otherwise the account's creation date does. Unknown is treated as an early provider:
// charging one of them $17 is the worse mistake.
export function renewPricing({ createdAt, planAmount, planInterval } = {}, now = Date.now()) {
  const amt = Number(planAmount);
  if (Number.isFinite(amt) && amt > 0) {
    const early = planInterval === 'year' ? amt < NEW.year * 100 : amt < NEW.month * 100;
    return early ? oldPlan() : signupPricing(now);
  }
  const t = createdAt ? Date.parse(createdAt instanceof Date ? createdAt.toISOString() : String(createdAt)) : NaN;
  if (!Number.isFinite(t) || t < PRICE_CHANGE_AT) return oldPlan();
  return signupPricing(now);
}

// The yearly price an existing MONTHLY subscriber switches to: $10/month -> $100/year,
// $17/month -> $170/year. Ten months for twelve, in cents.
export function yearlyCentsFor(monthlyCents) {
  const m = Number(monthlyCents);
  return Number.isFinite(m) && m > 0 ? m * 10 : null;
}
