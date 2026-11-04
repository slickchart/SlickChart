import assert from 'assert';
const base=new URL('../lib/', import.meta.url).href;
const P = await import(base+'pricing.js');
const fri=Date.parse('2026-11-06T23:59:00-08:00'), sat=Date.parse('2026-11-07T00:00:00-08:00');
// no links yet -> $10 even after cutoff (fail-safe)
assert.equal(P.signupPricing(sat).month,10);
assert.equal(P.newPriceLive(sat),false);
process.env.STRIPE_PAYMENT_LINK_17='https://buy.stripe.com/new17';
assert.equal(P.signupPricing(sat).month,10,'one link is not enough');
process.env.STRIPE_PAYMENT_LINK_YEARLY_170='https://buy.stripe.com/new170';
assert.equal(P.signupPricing(fri).month,10); assert.equal(P.signupPricing(fri).checkoutUrl,'https://buy.stripe.com/14AeVc0YH1Qd2DO1yl4wM00');
const s=P.signupPricing(sat); assert.deepEqual([s.month,s.year,s.yearFull,s.checkoutUrl,s.checkoutUrlYear],[17,170,204,'https://buy.stripe.com/new17','https://buy.stripe.com/new170']);
// renewals
const late=sat+86400e3;
assert.equal(P.renewPricing({planAmount:1000,planInterval:'month',createdAt:'2026-12-01'},late).month,10,'$10 payer keeps $10');
assert.equal(P.renewPricing({planAmount:10000,planInterval:'year'},late).year,100);
assert.equal(P.renewPricing({planAmount:1700,planInterval:'month'},late).month,17);
assert.equal(P.renewPricing({planAmount:17000,planInterval:'year'},late).month,17);
assert.equal(P.renewPricing({createdAt:'2026-10-01T00:00:00Z'},late).month,10);
assert.equal(P.renewPricing({createdAt:new Date(late)},late).month,17);
assert.equal(P.renewPricing({},late).month,10,'unknown = early');
assert.equal(P.yearlyCentsFor(1000),10000); assert.equal(P.yearlyCentsFor(1700),17000); assert.equal(P.yearlyCentsFor(null),null);
// welcome email follows the clock
const E = await import(base+'email.js');
const realNow=Date.now; 
Date.now=()=>fri; let h=E.welcomeEmailHtml({name:'A B',link:'x'}), t=E.welcomeEmailText({name:'A',link:'x'});
assert(h.includes('$100 a year</strong> instead of $120') && t.includes('$100 a year instead of $120'));
Date.now=()=>sat; h=E.welcomeEmailHtml({name:'A B',link:'x'}); t=E.welcomeEmailText({name:'A',link:'x'});
assert(h.includes('$170 a year</strong> instead of $204') && t.includes('$170 a year instead of $204'), h.match(/Pay yearly.{0,80}/)[0]);
Date.now=realNow;
console.log('pricing tests pass');
