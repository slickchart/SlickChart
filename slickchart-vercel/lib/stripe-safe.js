// Stripe's own error sentence is the only thing that tells an archived price from a restricted key
// from a bad parameter combination, and without it a dead checkout and a Stripe outage look
// identical from outside. What must never travel with it is an identifier.
//
// The hard part: Stripe ids and Stripe PARAMETER NAMES are both snake_case, and the parameter names
// (consent_collection, customer_creation, line_items) are the useful half. A first version redacted
// those too and produced "You cannot use [id][promotions] with [id]", which is worse than saying
// nothing. So three rules, in order:
//   1. the known id and key prefixes go unconditionally, however many segments follow, so
//      sk_live_51H… goes as well as price_1Q… — a single-prefix match missed the multi-segment keys,
//   2. anything whose LAST underscore segment contains a digit is an id, not an English word,
//   3. any long bare alphanumeric run, in case an id ever arrives with no prefix at all.
// A parameter name survives all three: its segments are lowercase words with no digits.
const ID_PREFIX = /\b(?:price|prod|acct|cus|sub|si|pi|seti|ch|in|il|cs|req|sk|pk|rk|whsec|tok|card|ba|po|re|tr|txn|evt|plan|promo|cpn|file|link)_[A-Za-z0-9_]+\b/g;
const ID_DIGITY = /\b[A-Za-z]{2,14}(?:_[A-Za-z0-9]+)*_[A-Za-z0-9]*[0-9][A-Za-z0-9]*\b/g;

export function safeStripeMessage(m) {
  return String(m == null ? '' : m)
    .replace(ID_PREFIX, '[id]')
    .replace(ID_DIGITY, '[id]')
    .replace(/\b[A-Za-z0-9]{24,}\b/g, '[id]')
    .slice(0, 300);
}
