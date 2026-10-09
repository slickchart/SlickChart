// Drives api/build-checkout.js with a stubbed Stripe. Proves the sale survives the ToS refusal,
// that nothing ELSE gets silently retried, and that no identifier reaches the response.
import fs from 'fs'; import os from 'os'; import path from 'path';
const V='/home/user/SlickChart/slickchart-vercel';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'co-'));
fs.mkdirSync(path.join(dir,'lib'),{recursive:true}); fs.mkdirSync(path.join(dir,'api'),{recursive:true});
fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
fs.writeFileSync(path.join(dir,'lib','email.js'),"export function trustedOrigin(){return 'https://slickchart.app';}");
fs.copyFileSync(path.join(V,'lib','stripe-safe.js'),path.join(dir,'lib','stripe-safe.js'));
fs.writeFileSync(path.join(dir,'api','build-checkout.mjs'),fs.readFileSync(path.join(V,'api','build-checkout.js'),'utf8'));
process.env.STRIPE_SECRET_KEY='sk_live_51Habc123XYZ'; process.env.BUILD_PRICE_ID='price_1QabcDEF2ghIJKlm';
const { default: handler } = await import(path.join(dir,'api','build-checkout.mjs'));

let pass=0,fail=0; const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?(' :: '+JSON.stringify(x)):''));}};
const TOS={error:{type:'invalid_request_error',message:'To set `consent_collection.promotions`, please visit https://dashboard.stripe.com/settings/checkout to agree to the Terms of Service.'}};
const GONE={error:{type:'invalid_request_error',code:'resource_missing',param:'line_items[0][price]',message:'No such price: price_1QabcDEF2ghIJKlm; a similar object exists in test mode, but a live mode key was used to make this request.'}};

function run(responder){
  const sent=[];
  global.fetch=async(url,opts)=>{sent.push(new URLSearchParams(opts.body));return responder(sent.length);};
  const res={code:0,body:null,status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
  return handler({method:'POST',body:{}},res).then(()=>({res,sent}));
}
const reply=(status,obj)=>({ok:status<400,status,json:async()=>obj});

// 1. The real situation: Stripe refuses the opt-in, we sell anyway.
let {res,sent}=await run(n=>n===1?reply(400,TOS):reply(200,{url:'https://checkout.stripe.com/c/pay/cs_live_abc'}));
ok('the sale goes through despite the refusal', res.code===200&&/checkout.stripe.com/.test(res.body.url||''), res.body);
ok('it retried exactly once', sent.length===2, sent.length);
ok('the first try DID ask for the opt-in', sent[0].get('consent_collection[promotions]')==='auto');
ok('the retry dropped only that field', sent[1].get('consent_collection[promotions]')===null);
ok('and kept the price', sent[1].get('line_items[0][price]')==='price_1QabcDEF2ghIJKlm');
ok('and kept the success url', /build\/unlocked/.test(sent[1].get('success_url')||''));
ok('and kept the sale tag the webhook needs', sent[1].get('metadata[product]')==='build');
ok('and still creates a customer', sent[1].get('customer_creation')==='always');
ok('and still allows promo codes', sent[1].get('allow_promotion_codes')==='true');

// 2. Any OTHER failure must NOT be retried or papered over.
({res,sent}=await run(()=>reply(400,GONE)));
ok('a missing price is not retried', sent.length===1, sent.length);
ok('and still fails loudly', res.code===502, res.code);
ok('its code comes back', res.body.code==='resource_missing', res.body);
ok('no identifier leaks in the detail', !/price_1|sk_live/.test(res.body.detail||''), res.body.detail);
ok('but the useful words survive', /No such price/.test(res.body.detail||''), res.body.detail);

// 3. Once she agrees to the ToS, the first attempt wins and the opt-in is back.
({res,sent}=await run(()=>reply(200,{url:'https://checkout.stripe.com/c/pay/cs_live_ok'})));
ok('a healthy account needs no retry', sent.length===1, sent.length);
ok('and the opt-in is asked for again', sent[0].get('consent_collection[promotions]')==='auto');
ok('buyer sees no stutter', res.code===200);

// 4. The buyer-facing string never carries the duplicate sentence.
({res}=await run(()=>reply(400,GONE)));
ok('server message does not say "Please try again"', !/Please try again/.test(res.body.error||''), res.body.error);

console.log('\n'+pass+' passed, '+fail+' failed');
fs.rmSync(dir,{recursive:true,force:true});
process.exit(fail?1:0);
