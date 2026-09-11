/* SAMPLE DATA FOR THE PUBLIC DEMO ONLY.
 *
 * This file is injected by scripts/build-demo.cjs into slickchart-provider-demo.html and nowhere
 * else. The real app ships with NO sample clients, NO sample documents and NO sample products —
 * a real provider (and their clients) can never see invented people or fake licence numbers,
 * which is what used to happen.
 *
 * The app reads window.__SC_DEMO_SEED__ and falls back to empty when it is absent, so the ONLY
 * way this data can appear is in a build produced by build-demo.cjs.
 */
window.__SC_DEMO_SEED__ = {
  clients: {
  maya:{name:'Maya Rodriguez',initials:'MR',bg:'var(--p-amber-bg)',tc:'var(--accent-strong)',phone:'(510) 555-0142',email:'maya.r@example.com',birthday:'1992-03-14',skin:'Combination · Sensitive',concerns:'Hyperpigmentation, dullness',allergies:'Fragrance, retinol',fitz:'III',lastVisit:'Jun 10, 2026',nextVisit:'Jun 26 · 10:00 AM',treatment:'Hydrafacial',sessions:4,seriesTotal:6,touchUpDate:'Jul 22, 2026'},
  sophie:{name:'Sophie Turner',initials:'ST',bg:'var(--p-surf2)',tc:'var(--p-green)',phone:'(415) 555-0193',email:'sophie.t@example.com',birthday:'1990-07-10',skin:'Dry · Sensitive',concerns:'Acne scarring, redness',allergies:'Salicylic acid',fitz:'II',lastVisit:'May 28, 2026',nextVisit:'Jun 26 · 12:30 PM',treatment:'Chemical Peel',sessions:2,signedForms:['New client intake & consent'],submittedForms:[{formId:'intake',title:'New client intake & consent',answers:{},flagged:['Taking blood thinners or anticoagulants'],date:'Today',signed:true}],flaggedContra:{form:'New client intake & consent',items:['Taking blood thinners or anticoagulants'],date:'Today'}},
  priya:{name:'Priya Patel',initials:'PP',bg:'var(--p-amber-bg)',tc:'var(--accent-strong)',phone:'(415) 555-0178',email:'priya.p@example.com',birthday:'1988-07-22',skin:'Oily',concerns:'Enlarged pores, breakouts',allergies:'None known',fitz:'IV',lastVisit:'Jun 24, 2026',nextVisit:'Jul 8 · 11:00 AM',treatment:'LED Therapy',sessions:1},
  },
  docs: [
  {id:'d1',name:'Esthetician License',issuer:'CA Board of Barbering & Cosmetology',number:'LE123456',issued:'Jan 15, 2022',expires:'Jan 15, 2026',icon:'ti-certificate',col:'var(--p-blue-bg)',ic:'var(--p-blue)',status:'urgent',lbl:'Expires in 19 days',bdg:'br',cat:'License'},
  {id:'d2',name:'Establishment License',issuer:'CA Board of Barbering & Cosmetology',number:'EST-2019-04821',issued:'Mar 1, 2022',expires:'Dec 1, 2026',icon:'ti-building',col:'var(--p-blue-bg)',ic:'var(--p-blue)',status:'ok',lbl:'Valid · Exp. Dec 2026',bdg:'bg',cat:'License'},
  {id:'d3',name:'Professional Liability Insurance',issuer:'ABMP',number:'POL-88472-2025',issued:'Mar 1, 2025',expires:'Mar 1, 2026',icon:'ti-shield-check',col:'var(--p-surf2)',ic:'var(--p-green)',status:'ok',lbl:'Valid · Exp. Mar 2026',bdg:'bg',cat:'Insurance'},
  {id:'d4',name:'General Business Insurance',issuer:'Hiscox Insurance',number:'HX-994821',issued:'Jun 1, 2025',expires:'Jun 1, 2026',icon:'ti-shield',col:'var(--p-surf2)',ic:'var(--p-green)',status:'soon',lbl:'Expires in 74 days',bdg:'ba',cat:'Insurance'},
  {id:'d5',name:'Resale Certificate',issuer:'CA Dept. of Tax & Fee Admin.',number:'SR-GE-2193847',issued:'Aug 10, 2020',expires:null,icon:'ti-receipt',col:'var(--accent-tint)',ic:'var(--accent-strong)',status:'none',lbl:'No expiration',bdg:'bm',cat:'Permits'},
  {id:'d6',name:"Seller's Permit",issuer:'CA Dept. of Tax & Fee Admin.',number:'SR-PM-0047821',issued:'Aug 10, 2020',expires:null,icon:'ti-building-store',col:'var(--accent-tint)',ic:'var(--accent-strong)',status:'none',lbl:'No expiration',bdg:'bm',cat:'Permits'},
  {id:'d7',name:'EIN Confirmation Letter',issuer:'IRS',number:'47-2938471',issued:'Jul 5, 2019',expires:null,icon:'ti-file-invoice',col:'var(--p-purple-bg)',ic:'var(--p-purple)',status:'none',lbl:'No expiration',bdg:'bm',cat:'Business'},
  {id:'d8',name:'CPR / First Aid Certificate',issuer:'American Red Cross',number:'ARC-CPR-20231104',issued:'Nov 4, 2023',expires:'Nov 4, 2025',icon:'ti-heart-plus',col:'var(--p-red-bg)',ic:'var(--p-red)',status:'urgent',lbl:'Expired Nov 2025',bdg:'br',cat:'Certifications'},
  ],
  products: [
  {id:'a1',name:'C E Ferulic',brand:'SkinCeuticals',icon:'💧',url:'skinceuticals.com/ref/jessica',amazon:'amazon.com/dp/ceferulic',site:'glowingskinstudio.com/shop/ce-ferulic',siteCode:'GLOW10',urlCode:'JESSICA15',clicks:84,earnings:126,commission:'15%',active:true},
  {id:'a2',name:'UV Defense SPF 50',brand:'EltaMD',icon:'☀️',url:'eltamd.com/ref/jessica',amazon:'amazon.com/dp/eltamd-uv',site:'glowingskinstudio.com/shop/uv-defense',clicks:61,earnings:48.80,commission:'8%',active:true,inOffice:true},
  {id:'a3',name:'BHA Liquid Exfoliant',brand:"Paula's Choice",icon:'🧴',url:'paulaschoice.com/ref/jessica',amazon:'amazon.com/dp/paulaschoice-bha',site:'glowingskinstudio.com/shop/bha',clicks:47,earnings:33.60,commission:'10%',active:true},
  {id:'a4',name:'Hydrafacial Home Kit',brand:'HydraFacial',icon:'🔬',url:'hydrafacial.com/ref/jessica',clicks:22,earnings:44,commission:'20%',active:false},
  ]
  ,
  inv: [
  {name:'C E Ferulic',brand:'SkinCeuticals',cat:'Retail',icon:'💧',qty:3,low:2,max:6,cost:182},
  {name:'UV Defense SPF 50',brand:'EltaMD',cat:'Retail',icon:'☀️',qty:1,low:2,max:6,cost:39},
  {name:'BHA Liquid Exfoliant',brand:"Paula's Choice",cat:'Retail',icon:'🧴',qty:5,low:2,max:4,cost:34},
  {name:'Hydrafacial Tip Set',brand:'HydraFacial',cat:'Supplies',icon:'🔬',qty:0,low:3,max:10,cost:22},
  {name:'Chemical Peel Solution 30%',brand:'GlyMed Plus',cat:'Supplies',icon:'⚗️',qty:2,low:2,max:4,cost:68},
  {name:'Disposable Gloves (Box)',brand:'Generic',cat:'Supplies',icon:'🧤',qty:8,low:3,max:10,cost:12},
  ]
  ,
  shopBundles: [
  {id:'b1',name:'Brightening Starter Kit',icon:'✨',col:'var(--accent-tint)',ic:'var(--accent-strong)',products:['C E Ferulic','UV Defense SPF 50'],price:'$221',sent:18,clicks:34},
  {id:'b2',name:'Acne Fighting Essentials',icon:'🧴',col:'var(--p-blue-bg)',ic:'var(--p-blue)',products:['BHA Liquid Exfoliant','Salicylic Cleanser'],price:'$68',sent:9,clicks:14},
  ]
  ,
  notifFeed: [
  {id:'n1',type:'checkin',icon:'ti-clipboard-check',col:'var(--p-surf2)',ic:'var(--p-green)',title:'Check-in received',body:'Priya Patel completed her pre-visit check-in for Jul 8.',time:'2 min ago',read:false,action:'checkin',data:'ci_demo1'},
  {id:'n2',type:'message',icon:'ti-message-circle',col:'var(--p-blue-bg)',ic:'var(--p-blue)',title:'New message',body:'Maya Rodriguez: "Thank you so much!! How long before I can use retinol again?"',time:'14 min ago',read:false,action:'chat',data:'maya'},
  {id:'n3',type:'doc',icon:'ti-alert-circle',col:'var(--p-red-bg)',ic:'var(--p-red)',title:'Document expiring soon',body:'Your Esthetician License expires in 19 days. Renew before Jan 15.',time:'1 hour ago',read:true,action:'vault',data:null},
  {id:'n4',type:'form',icon:'ti-file-check',col:'var(--p-purple-bg)',ic:'var(--p-purple)',title:'Consent Form Signed',body:'Sophie Turner signed the Chemical Peel Consent form.',time:'3 hours ago',read:true,action:'client',data:'sophie'},
  {id:'n5',type:'inventory',icon:'ti-package',col:'var(--accent-tint)',ic:'var(--accent-strong)',title:'Low Inventory Alert',body:'UV Defense SPF 50 is below reorder level, only 1 unit left.',time:'Yesterday',read:true,action:'inventory',data:null},
  {id:'n6',type:'rebook',icon:'ti-calendar-plus',col:'var(--p-surf2)',ic:'var(--p-green)',title:'Rebook reminder',body:'Maya Rodriguez is due for her next Hydrafacial, last visit was Jun 10.',time:'Yesterday',read:true,action:'client',data:'maya'},
  {id:'n7',type:'report',icon:'ti-chart-bar',col:'var(--p-purple-bg)',ic:'var(--p-purple)',title:'Weekly Summary',body:'This week: 8 appointments completed.',time:'Mon 9:00 AM',read:true,action:'home',data:null},
  ]
  ,
  checkins: [
  {id:'ci_demo1',providerId:'jess',clientId:'priya',client:'Priya Patel',dateLabel:'Jul 8, 2026',time:'11:00 AM',treatment:'LED Therapy',
    groups:[
      {title:'Skin & health',rows:[
        {label:'Any skin changes since your last visit?',value:'Yes',detail:'A little reactive and red across the cheeks this week.',flagged:true},
        {label:'Any health or medication changes?',value:'No changes',detail:'',flagged:false},
        {label:'Any changes to your skincare routine?',value:'Yes',detail:'Started a new vitamin C serum a week ago.',flagged:true},
      ]},
      {title:'Comfort',rows:[
        {label:'Your drink',value:'Herbal tea',flagged:false},
        {label:'Music',value:'Nature sounds',flagged:false},
        {label:'Heated mattress pad',value:'Med',flagged:false},
        {label:'Heated blanket',value:'Low',flagged:false},
        {label:'Covering',value:'Weighted blanket',flagged:false},
      ]},
    ],
    flagged:['skin changes','routine change'],notes:'Mornings are best for me. Skin has been a little reactive lately.',photos:["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23e0bf9a'/%3E%3Ccircle cx='50' cy='40' r='20' fill='%23c89a6a'/%3E%3Crect x='30' y='62' width='40' height='34' rx='14' fill='%23c89a6a'/%3E%3Ctext x='50' y='94' font-size='8' fill='%23fff' text-anchor='middle'%3Echeek area%3C/text%3E%3C/svg%3E","data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23d9b48f'/%3E%3Ccircle cx='38' cy='44' r='9' fill='%23b07a52'/%3E%3Ccircle cx='62' cy='52' r='6' fill='%23b07a52'/%3E%3Ctext x='50' y='90' font-size='8' fill='%23fff' text-anchor='middle'%3Ebreakout%3C/text%3E%3C/svg%3E"],submittedAt:Date.now()-120000,read:false},
  ]
  ,
  _SAMPLE_FORMS: {
  maya:[
    {formId:'facial',title:'Facial Treatment Consent',date:'Jul 15, 2026',signed:true,flagged:[],
      answers:{161:'Maya Rodriguez',162:'1992-03-14',163:'Yes',164:'Yes',165:'Yes'}},
    {formId:'intake',title:'New client intake & consent',date:'Jun 10, 2026',signed:true,flagged:[],
      answers:{1:'Maya Rodriguez',2:'1992-03-14',8:'(510) 555-0142',9:'maya.r@example.com',10:'Instagram',3:'Hyperpigmentation, dullness',4:'Fragrance, retinol',5:'No',11:'None',12:'Mild rosacea, managed',6:'Vitamin C serum AM, mineral SPF 50'}},
  ],
  priya:[
    {formId:'intake',title:'New client intake & consent',date:'Jun 24, 2026',signed:true,flagged:[],
      answers:{1:'Priya Patel',2:'1988-07-22',8:'(415) 555-0178',9:'priya.p@example.com',10:'Referral from a friend',3:'Enlarged pores, occasional breakouts',4:'None known',5:'No',11:'None',12:'None',6:'Gentle gel cleanser, oil-free moisturizer'}},
  ],
  }
  ,
  sessionSummaries: {
  maya:[
    {date:'Jun 10, 2026',treatment:'Hydrafacial',note:'Hyperpigmentation responding beautifully to the Vitamin C series, jawline visibly clearer. Keep SPF daily.',homecare:['Vitamin C serum AM','SPF 50 daily','Gentle cleanser PM'],products:['C E Ferulic','UV Defense'],ts:Date.now()-1728e6},
    {date:'May 15, 2026',treatment:'Chemical Peel',note:'Great tolerance to the peel. Some expected flaking days 3–4. Hold actives one week.',homecare:['No actives 7 days','Hydrating moisturizer','SPF 50 daily'],products:['C E Ferulic'],ts:Date.now()-3974e6},
    {date:'Apr 2, 2026',treatment:'Hydrafacial',note:'Skin hydrated and bright. Pores reduced ~15%. Introduced niacinamide.',homecare:['Niacinamide serum','SPF daily'],products:[],ts:Date.now()-7430e6},
  ],
  sophie:[
    {date:'May 28, 2026',treatment:'Chemical Peel',note:'Barrier strengthening. Redness reduced this session. Keep the routine gentle.',homecare:['Centella moisturizer','No exfoliants 2 weeks'],products:[],ts:Date.now()-2678e6},
  ],
  priya:[
    {date:'Jun 24, 2026',treatment:'LED Therapy',note:'Congestion improving, pores tighter. BHA 2–3x weekly is working well.',homecare:['BHA exfoliant 2–3x weekly','Oil-free moisturizer'],products:['BHA Exfoliant'],ts:Date.now()-432e6},
  ],
  }
  ,
  _apptsData: [
    {day:24,time:'10:00 AM',client:'Maya Rodriguez',tx:'Hydrafacial',dur:60,col:'var(--accent-tint)',ic:'var(--accent-strong)'},
    {day:24,time:'12:30 PM',client:'Sophie Turner',tx:'Chemical Peel',dur:75,col:'var(--p-blue-bg)',ic:'var(--p-blue)'},
    {day:26,time:'10:00 AM',client:'Maya Rodriguez',tx:'Hydrafacial',dur:60,col:'var(--accent-tint)',ic:'var(--accent-strong)'},
    {day:26,time:'12:30 PM',client:'Sophie Turner',tx:'Chemical Peel',dur:75,col:'var(--p-blue-bg)',ic:'var(--p-blue)'},
    {day:26,time:'3:00 PM',client:'Priya Patel',tx:'LED Therapy',dur:45,col:'var(--p-surf2)',ic:'var(--p-green)'},
    {day:27,time:'11:00 AM',client:'Priya Patel',tx:'Consult',dur:30,col:'var(--p-surf2)',ic:'var(--p-green)'},
    {day:8,time:'11:00 AM',client:'Priya Patel',tx:'LED Therapy',dur:45,col:'var(--p-surf2)',ic:'var(--p-green)'},
  ],

  /* The seeding routines themselves. They run ONLY in the demo build. They reference app globals
     (CL, checkins, payments, SlickBridge...) which is fine: classic scripts share one global scope,
     and these are called long after the app script has defined them. */
  seeders: (function(){
function _sampleCalAppts(mk){
  return [mk(0,10,0,'Maya Rodriguez','Hydrafacial','var(--accent)'),mk(0,14,30,'Sophie Turner','Chemical Peel','var(--p-blue)'),mk(2,11,0,'Priya Patel','Microneedling','var(--p-purple)'),mk(4,13,0,'Theresa B.','Dermaplane','var(--p-green)')];
}


function _mayaSeed(){
  return {name:'Maya Rodriguez',initials:'MR',bg:'var(--p-amber-bg)',tc:'var(--accent-strong)',
    skin:'Combination · Sensitive',concerns:'Hyperpigmentation, dullness',allergies:'Fragrance, retinol',fitz:'III',
    pregnancy:'No',medications:'None',conditions:'Mild rosacea, managed',
    phone:'(510) 555-0142',email:'maya.r@example.com',
    lastVisit:'Jun 10, 2026',nextVisit:'Jul 17 · 10:00 AM',treatment:'Hydrafacial',
    sessions:4,seriesTotal:6,touchUpDate:'Jul 22, 2026',demo:true,
    signedForms:['New client intake & consent'],
    submittedForms:[{formId:'intake',title:'New client intake & consent',date:'Jun 10, 2026',signed:true,flagged:[],
      answers:{1:'Maya Rodriguez',2:'1992-03-14',8:'(510) 555-0142',9:'maya.r@example.com',10:'Instagram',3:'Hyperpigmentation',4:'Fragrance, retinol',5:'No',11:'None',12:'Mild rosacea, managed',6:'Vitamin C serum AM, mineral SPF 50'}}]
  };
}

function _seedMayaOnce(){
  try{
    if(localStorage.getItem('sc_maya_seeded'))return;   // only ever seed once
    localStorage.setItem('sc_maya_seeded','1');
    if(!CL.maya){CL.maya=_mayaSeed();try{applyProfessionConfig();}catch(e){}saveClients();}
  }catch(e){}
}

function _demoNoteSeed(){
  try{
    if(typeof providerNoteDrafts==='undefined'||typeof _sampleHidden!=='function')return;
    if(_sampleHidden())return;
    Object.keys(_SAMPLE_NOTEDRAFTS).forEach(function(id){
      if(typeof CL!=='undefined'&&!CL[id])return;
      const cur=providerNoteDrafts[id];
      // Seed when missing, or refresh a stale SAMPLE draft (older format) so it matches the seed —
      // but never clobber a real note the provider actually wrote (no _sample flag).
      if(!cur||(cur._sample&&cur.templateId!==_SAMPLE_NOTEDRAFTS[id].templateId)){
        providerNoteDrafts[id]=JSON.parse(JSON.stringify(_SAMPLE_NOTEDRAFTS[id]));
      }
    });
    if(typeof saveProviderNoteDrafts==='function')saveProviderNoteDrafts();
  }catch(e){}
}

function _demoFormsSeed(){
  try{
    if(typeof CL==='undefined'||typeof _sampleHidden!=='function'||_sampleHidden())return;
    let changed=false;
    Object.keys(_SAMPLE_FORMS).forEach(function(id){
      const c=CL[id];if(!c)return;
      c.submittedForms=Array.isArray(c.submittedForms)?c.submittedForms:[];
      c.signedForms=Array.isArray(c.signedForms)?c.signedForms:[];
      // Keep list order (first entry = most recent/hero). Append any missing ones to the front in
      // reverse so the first sample form ends up at index 0. Never duplicate or clobber a real form.
      _SAMPLE_FORMS[id].slice().reverse().forEach(function(f){
        if(!c.submittedForms.some(function(sf){return sf&&sf.formId===f.formId&&sf.signed;})){
          c.submittedForms.unshift(JSON.parse(JSON.stringify(f)));changed=true;
        }
        if(c.signedForms.indexOf(f.title)<0){c.signedForms.unshift(f.title);changed=true;}
      });
    });
    if(changed&&typeof saveClients==='function')saveClients();
  }catch(e){}
}

function _demoCheckinSeed(){
  try{
    if(!CL.maya||CL.maya.checkinDone)return;
    const h=_hoursUntilVisit(CL.maya);
    const isPlaceholder=CL.maya.nextVisit==='Jul 17 · 10:00 AM';
    const isStalePast=(h!=null && h < -3);
    if(isPlaceholder||isStalePast){
      CL.maya.nextVisit=_soonVisitLabel(95);
      if(typeof saveClients==='function')saveClients();
    }
  }catch(e){}
}

function _demoPaymentSeed(){
  try{
    if(typeof _payments==='undefined'||typeof _sampleHidden!=='function')return;
    if(_sampleHidden())return;
    if(_payments.some(p=>p&&p.id==='pay_demo1'))return;
    _payments.unshift({
      id:'pay_demo1',_sample:true,clientId:'maya',clientName:'Maya Rodriguez',
      amount:145,method:'Invoice',status:'unpaid',date:_todayISO?_todayISO():'2026-07-07',
      note:'Invoice · 2 items',source:'manual',taxRate:(typeof _taxRate!=='undefined'?_taxRate:0),taxAmount:0,
      items:[
        {name:'Remaining balance of today\u2019s treatment',price:95,qty:1,variationId:null,kind:'service',note:''},
        {name:'Booking Deposit',price:50,qty:1,variationId:null,kind:'service',note:'Booking date: Aug 14, 2026'}
      ]
    });
    if(typeof _savePayments==='function')_savePayments();
  }catch(e){}
}

function seedDemoRequestOnce(){
  if(localStorage.getItem('sc_demo_seeded'))return;
  if(SlickBridge.getBookings().length>0){localStorage.setItem('sc_demo_seeded','1');return;}
  const demo={id:'bk_demo1',clientId:'priya',client:'Priya Patel',treatment:'LED Therapy',
    date:'2026-07-21',dateLabel:'Monday, July 21',time:'11:00 AM',
    note:'Mornings are best for me. Skin has been a little reactive lately.',status:'pending',created:Date.now()-3600*1000};
  SlickBridge.upsertBooking(demo);
  localStorage.setItem('sc_demo_seeded','1');
}

    return {_sampleCalAppts:_sampleCalAppts, _mayaSeed:_mayaSeed, _seedMayaOnce:_seedMayaOnce, _demoNoteSeed:_demoNoteSeed, _demoFormsSeed:_demoFormsSeed, _demoCheckinSeed:_demoCheckinSeed, _demoPaymentSeed:_demoPaymentSeed, seedDemoRequestOnce:seedDemoRequestOnce};
  })()
};