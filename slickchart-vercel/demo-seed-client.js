/* SAMPLE CLIENT SPACE — not part of the app a real client loads.
 *
 * Served at /demo-seed-client.js and fetched ONLY on the sample path: the public client demo, and a
 * provider opening ?preview=1 to see what their clients see. A client who arrives with their own
 * link never requests this file, so the bundle they load contains no invented practitioner. A real
 * client was once shown the demo esthetician's name as her own; this is the structural fix.
 */
// Exposed as a FUNCTION, not an object literal: the sample check-in forms below reference the app's
// own CI_DRINKS / CI_MUSIC / CI_LEVELS / CI_COVERING constants, which are declared later in the app
// script. Evaluating this eagerly threw a ReferenceError and the seed was never assigned at all.
// The app calls this once those constants exist (see _resolveClientDemoSeed).
window.__SC_CLIENT_DEMO_FN__ = function(){ return {
  name:'Maya Rodriguez',initials:'MR',
  email:'maya@email.com',phone:'(510) 442-8801',
  activeProviderId:'jess',
  providers:[
    {id:'jess',name:'Jessica Lee, LE',first:'Jessica',initials:'JL',studio:'Glowing Skin Studio',
      kind:'Esthetician',connected:true,brand:{primary:'#0F8A7E',secondary:'#1E7FB0'},
      studioAddress:'2810 Telegraph Ave, Oakland CA 94609',studioPhone:'(510) 882-4401',website:'glowingskinstudio.com',
      treatment:'Hydrafacial',session:4,totalSessions:6,
      nextDate:'Jul 17, 2026',nextTime:'10:00 AM',apptISO:'2026-07-17T10:00:00',
      nextDateISO:'20260717',nextTimeISO:'170000',durationMins:60,unread:1,
      summaryNote:'Your skin looked radiant today, hyperpigmentation is really responding. Keep up that SPF! 🌿',
      thread:[
        {from:'provider',text:'Hi Maya! Just checking in after your Hydrafacial today. Your skin looked radiant, the hyperpigmentation is really responding well. 🌿',time:'Jun 26 · 11:48 AM'},
        {from:'me',text:'Thank you so much!! How long before I can use retinol again?',time:'12:14 PM'},
        {from:'provider',text:'Wait 60 days, start with once a week. Your barrier is improving but let\'s not rush it! 💛',time:'12:22 PM'},
      ],
      seriesLabel:'Hydrafacial series',
      homecare:[
        {key:'Vitamin C serum',icon:'💧',time:'Morning',tip:'Apply to damp skin after cleansing. Press in gently, don\'t rub.',done:true},
        {key:'SPF 50+',icon:'☀️',time:'Morning',tip:'Last step every morning. Reapply if outside more than 2 hours.',done:true},
        {key:'Gentle cleanser',icon:'🫧',time:'AM & PM',tip:'No foaming cleansers, use a milk or gel that doesn\'t strip.',done:true},
        {key:'Hyaluronic acid',icon:'✨',time:'Evening',tip:'Apply on slightly damp skin to seal in moisture.'},
        {key:'PM moisturizer',icon:'🌙',time:'Evening',tip:'Heavier than your AM cream, skin repairs overnight.'},
      ],
      avoid:['Retinol (60 days)','AHA/BHA exfoliants (5 days)','Heavy sweating (24 hrs)','Fragranced products'],
      aftercare:[
        {when:'First 24 hours',items:['Skip makeup, let your skin breathe','No sweating, saunas, or hot showers','Avoid touching or rubbing your face','Drink plenty of water']},
        {when:'Days 2–3',items:['Gentle cleanser morning and night','Apply your hydrating serum','SPF 50 every morning','Still no exfoliants or actives']},
        {when:'Days 4–7',items:['Resume Vitamin C in the morning','Keep SPF daily','You can wear makeup again','Enjoy the glow settling in ✨']},
        {when:'Week 2 onward',items:['Reintroduce gentle actives slowly','Keep your daily routine consistent','Book your next session to maintain results']},
      ],
      homecareNote:'Your barrier is improving beautifully, consistency with the Vitamin C is what\'s driving the PIH results. Keep it up! 💛',
      progress:[
        {date:'Feb 18',label:'Session 1 · Consultation',bg:'#d9b48f',icon:'#8a6a4a',opacity:'.55'},
        {date:'Apr 2',label:'Session 2 · Hydrafacial',bg:'#e0bf9a',icon:'#9a7a55',opacity:'.7'},
        {date:'May 15',label:'Session 3 · Chemical Peel',bg:'#eccfa8',icon:'#b08a5e',opacity:'.85'},
        {date:'Jun 26',label:'Session 4 · Hydrafacial',bg:'#f3ddbb',icon:'#0f8a7e',opacity:'1'},
      ],
      observations:[
        {date:'Jun 26, 2026',label:'Session 4 · Hydrafacial',highlights:[
          {icon:'ti-trending-up',color:'#4ec49a',text:'Hyperpigmentation along the jawline visibly fading, best session yet.'},
          {icon:'ti-shield-check',color:'#5ba3e8',text:'Barrier function much stronger. No tightness or reactivity today.'},
          {icon:'ti-sparkles',color:'var(--accent)',text:'Comedone load down significantly. Skin looked radiant post-treatment.'},
        ]},
        {date:'May 15, 2026',label:'Session 3 · Chemical Peel',highlights:[
          {icon:'ti-trending-up',color:'#4ec49a',text:'PIH continuing to fade. Tolerance to peel excellent, no unusual redness.'},
          {icon:'ti-shield-check',color:'#5ba3e8',text:'Barrier improving steadily since switching to the gentle cleanser.'},
        ]},
        {date:'Apr 2, 2026',label:'Session 2 · Hydrafacial',highlights:[
          {icon:'ti-check',color:'#a891ec',text:'Good extraction session. T-zone congestion clearing up.'},
        ]},
      ],
      summaries:[
        {date:'Jun 26, 2026',label:'Session 4 · Hydrafacial',note:'Your skin looked radiant after today\'s treatment! Hyperpigmentation is visibly improving, keep up that SPF!',homecare:['Vitamin C serum every morning','SPF 50+ daily','Gentle cleanser only','Avoid retinol for 60 days','Hydrate well']},
        {date:'May 15, 2026',label:'Session 3 · Chemical Peel',note:'Excellent tolerance to the peel today. Barrier function strengthening and PIH continuing to fade.',homecare:['Barrier repair moisturizer','Avoid actives 2 weeks','Mineral SPF 30+ daily']},
        {date:'Apr 2, 2026',label:'Session 2 · Hydrafacial',note:'Great session, extracted well. Starting to see real progress on the T-zone congestion.',homecare:['Vitamin C serum AM','SPF 50+ daily','No exfoliants this week']},
      ],
      products:[
        {name:'C E Ferulic',brand:'SkinCeuticals',icon:'💧',url:'skinceuticals.com/ref/jessica',amazon:'amazon.com/dp/ceferulic?tag=glowingskin-20',site:'glowingskinstudio.com/shop/ce-ferulic',siteCode:'GLOW10',urlCode:'JESSICA15',why:'Vitamin C to fade hyperpigmentation and protect from UV every day.'},
        {name:'UV Defense SPF 50',brand:'EltaMD',icon:'☀️',url:'eltamd.com/ref/jessica',amazon:'amazon.com/dp/eltamd-uv?tag=glowingskin-20',site:'glowingskinstudio.com/shop/uv-defense',inOffice:true,why:'Mineral SPF that won\'t clog pores, essential after a Hydrafacial.'},
        {name:'Hyaluronic B5 Gel',brand:'SkinCeuticals',icon:'✨',url:'skinceuticals.com/ref/jessica',why:'Locks in hydration and supports your barrier between treatments.'},
      ],
      catalog:[
        {name:'C E Ferulic',brand:'SkinCeuticals',icon:'💧',url:'skinceuticals.com/ref/jessica',amazon:'amazon.com/dp/ceferulic?tag=glowingskin-20',site:'glowingskinstudio.com/shop/ce-ferulic',siteCode:'GLOW10',urlCode:'JESSICA15'},
        {name:'UV Defense SPF 50',brand:'EltaMD',icon:'☀️',url:'eltamd.com/ref/jessica',amazon:'amazon.com/dp/eltamd-uv?tag=glowingskin-20',site:'glowingskinstudio.com/shop/uv-defense',inOffice:true},
        {name:'Hyaluronic B5 Gel',brand:'SkinCeuticals',icon:'✨',url:'skinceuticals.com/ref/jessica'},
        {name:'BHA Liquid Exfoliant',brand:"Paula's Choice",icon:'🧴',url:'paulaschoice.com/ref/jessica',site:'glowingskinstudio.com/shop/bha'},
        {name:'Gentle Milk Cleanser',brand:'La Roche-Posay',icon:'🧼',site:'glowingskinstudio.com/shop/cleanser',inOffice:true},
        {name:'Niacinamide 10%',brand:'The Ordinary',icon:'🫗',amazon:'amazon.com/dp/niacinamide?tag=glowingskin-20'},
      ],
      saved:['UV Defense SPF 50'],
      recLog:[
        {date:'Jun 26, 2026',label:'After your Hydrafacial',products:[
          {name:'C E Ferulic',brand:'SkinCeuticals',icon:'💧',url:'skinceuticals.com/ref/jessica',amazon:'amazon.com/dp/ceferulic?tag=glowingskin-20',site:'glowingskinstudio.com/shop/ce-ferulic',siteCode:'GLOW10',urlCode:'JESSICA15',why:'Vitamin C to fade hyperpigmentation and protect from UV every day.'},
          {name:'UV Defense SPF 50',brand:'EltaMD',icon:'☀️',url:'eltamd.com/ref/jessica',amazon:'amazon.com/dp/eltamd-uv?tag=glowingskin-20',site:'glowingskinstudio.com/shop/uv-defense',inOffice:true,why:'Mineral SPF that won\'t clog pores, essential after a Hydrafacial.'},
        ]},
        {date:'Apr 2, 2026',label:'Session 2 follow-up',products:[
          {name:'Hyaluronic B5 Gel',brand:'SkinCeuticals',icon:'✨',url:'skinceuticals.com/ref/jessica',why:'Locks in hydration and supports your barrier between treatments.'},
        ]},
      ],
      amazonStore:'amazon.com/shop/glowingskinstudio',
      resources:[{title:'Post-peel aftercare guide',icon:'📄',cat:'PDF',url:'glowingskinstudio.com/guides/post-peel'}],
      shopGoals:'your Fitzpatrick III combination skin and hyperpigmentation goals',
      profileTitle:'My skin profile',
      profileFields:[['Skin type','Combination'],['Fitzpatrick','Type III'],['Main concern','Hyperpigmentation'],['Allergies','Fragrance, retinol']],
      checkin:{steps:[
        {title:'Skin & health',questions:[
          {type:'boolean',id:'skinChanges',flagLabel:'skin changes',label:'Any skin changes since your last visit?',hint:"New breakouts, dryness, sensitivity, or anything you've noticed.",detailPh:'e.g. new breakout on chin, drier than usual...'},
          {type:'boolean',id:'healthChanges',flagLabel:'a health/medication update',label:'Any health or medication changes?',hint:'New prescriptions, supplements, pregnancy, or medical updates.',detailPh:'e.g. new medication, feeling under the weather...'},
          {type:'boolean',id:'routineChanges',flagLabel:'a routine change',label:'Any changes to your skincare routine?',hint:'New products, stopped something, or changed how often you use anything.',detailPh:'e.g. started a new serum, stopped retinol...'},
        ]},
        {title:'Comfort',id:'comfort',questions:[
          {type:'iconChoice',id:'drink',label:'Your drink',options:CI_DRINKS},
          {type:'iconChoice',id:'music',label:'Music',options:CI_MUSIC,allowCustom:true,customPh:'e.g. classical, a podcast, no music…'},
          {type:'levelChoice',id:'heatedPad',label:'Heated mattress pad',options:CI_LEVELS},
          {type:'iconChoice',id:'covering',label:'Covering',columns:3,options:CI_COVERING},
        ]},
        {title:'Anything else',questions:[
          {type:'notes',id:'notes',ph:'Questions, requests, skin concerns...'},
        ]},
      ]},
    },
    {id:'marcus',name:'Marcus Chen',first:'Marcus',initials:'MC',studio:'Fade Theory',
      kind:'Barber',connected:false,brand:{primary:'#3B82F6',secondary:'#0EA5E9'},
      studioAddress:'1644 Valencia St, San Francisco CA 94110',studioPhone:'(415) 552-7788',
      treatment:'Beard & Skin Fade',session:8,totalSessions:12,
      nextDate:'Jul 9, 2026',nextTime:'2:30 PM',apptISO:'2026-07-09T14:30:00',
      nextDateISO:'20260709',nextTimeISO:'213000',durationMins:45,unread:0,
      summaryNote:'Clean skin fade, lined up the beard a touch tighter like you asked. See you in 3 weeks. ✂️',
      thread:[
        {from:'provider',text:'Appreciate you coming through Maya! Fade looked clean. Want me to book your usual 3-week touch-up?',time:'Jun 20 · 4:10 PM'},
        {from:'me',text:'Yes please, same time slot if you have it.',time:'4:25 PM'},
      ],
      seriesLabel:'Cut & beard upkeep',
      homecare:[
        {key:'Beard oil',icon:'🧴',time:'Morning',tip:'A few drops worked into the skin under the beard, stops itch and flaking.',done:true},
        {key:'Brush & shape',icon:'💈',time:'Daily',tip:'Boar-bristle brush trains the beard and keeps the line sharp.',done:true},
        {key:'Sulfate-free wash',icon:'🫧',time:'2–3x / week',tip:'Wash the beard a few times a week, daily strips the natural oils.'},
        {key:'Scalp moisturizer',icon:'💧',time:'Evening',tip:'Light moisturizer on the fade keeps the skin from drying out.'},
      ],
      avoid:['Clippers at home (let it grow even)','Heavy gels (cause flaking)','Over-washing the beard'],
      homecareNote:'Fade grows out clean if you brush daily and keep the beard oiled. Come see me at week 3 for the touch-up. ✂️',
      progress:[
        {date:'Apr 8',label:'Session 5 · Fade + Beard',bg:'#2b2b30',icon:'#6b7280',opacity:'.6'},
        {date:'May 6',label:'Session 6 · Fade + Beard',bg:'#33333a',icon:'#7c8593',opacity:'.75'},
        {date:'Jun 1',label:'Session 7 · Fade + Lineup',bg:'#3a3a42',icon:'#94a3b8',opacity:'.9'},
        {date:'Jun 20',label:'Session 8 · Fade + Beard',bg:'#42424c',icon:'#3B82F6',opacity:'1'},
      ],
      observations:[
        {date:'Jun 20, 2026',label:'Session 8 · Fade + Beard',highlights:[
          {icon:'ti-scissors',color:'#3B82F6',text:'Tightened the fade a touch higher, holds the shape longer between visits.'},
          {icon:'ti-check',color:'#4ec49a',text:'Beard density filling in nicely along the jaw. Cheek line looking sharp.'},
        ]},
        {date:'Jun 1, 2026',label:'Session 7 · Fade + Lineup',highlights:[
          {icon:'ti-trending-up',color:'#4ec49a',text:'Hairline recovering well, the lineup is sitting more natural now.'},
        ]},
      ],
      summaries:[
        {date:'Jun 20, 2026',label:'Session 8 · Fade + Beard',note:'Clean skin fade, lined up the beard a touch tighter like you asked. Looking sharp, see you in 3 weeks.',homecare:['Beard oil daily','Brush to keep the shape','Wash beard 2–3x a week','No clippers at home']},
        {date:'Jun 1, 2026',label:'Session 7 · Fade + Lineup',note:'Cleaned up the lineup and blended the fade. Beard shaping coming along great.',homecare:['Beard balm for hold','Boar-bristle brush daily']},
      ],
      products:[
        {name:'Beard Oil',brand:'Jack Black',icon:'🧴',url:'getjackblack.com/ref/marcus',why:'Softens the beard and stops the itch as it grows in.'},
        {name:'Matte Clay Pomade',brand:'Baxter of California',icon:'💈',url:'baxterofcalifornia.com/ref/marcus',why:'Strong matte hold to keep the style sharp all day.'},
        {name:'Boar Bristle Brush',brand:'Kent',icon:'🪮',url:'kentbrushes.com/ref/marcus',why:'Trains the beard and keeps your line clean between cuts.'},
      ],
      shopGoals:'keeping your fade sharp and your beard healthy between visits',
      profileTitle:'My hair & beard',
      profileFields:[['Hair type','Thick, wavy'],['Usual cut','Skin fade + beard'],['Beard','Medium density'],['Allergies','None noted']],
      checkin:{steps:[
        {title:'Today\'s cut',questions:[
          {type:'iconChoice',id:'cut',label:'How do you want it today?',options:[['✂️','Same as usual'],['📏','A bit shorter'],['🌱','Growing it out'],['🆕','Switch it up']]},
          {type:'iconChoice',id:'beard',label:'Beard',options:[['💈','Clean line-up'],['✂️','Trim & shape'],['🧔','Leave it fuller'],['🚫','Skip beard today']]},
        ]},
        {title:'Heads up',questions:[
          {type:'boolean',id:'scalpIssues',flagLabel:'scalp or skin irritation',label:'Any scalp or skin irritation?',hint:'Razor bumps, ingrowns, dryness, or sensitive spots.',detailPh:'e.g. ingrowns on the neck, sensitive near the ears...'},
          {type:'boolean',id:'lengthChange',flagLabel:'a length change',label:'Changing the length from last time?',hint:'Let me know if you want it noticeably different.',detailPh:'e.g. a bit longer on top, tighter fade...'},
        ]},
        {title:'Comfort',id:'comfort',questions:[
          {type:'iconChoice',id:'drink',label:'Your drink',options:CI_DRINKS},
          {type:'iconChoice',id:'music',label:'Music / vibe',options:CI_MUSIC,allowCustom:true,customPh:'e.g. hip-hop, the game on, a podcast…'},
          {type:'iconChoice',id:'cape',label:'Cape',columns:3,options:[['🧥','Standard'],['🪶','Lightweight'],['🧣','Extra coverage']]},
          {type:'iconChoice',id:'hotTowel',label:'Hot towel finish',columns:2,options:[['🔥','Yes please'],['🚫','No thanks']]},
        ]},
        {title:'Anything else',questions:[
          {type:'notes',id:'notes',ph:'Reference photos, requests, anything...'},
        ]},
      ]},
    },
    {id:'sofia',name:'Sofia Ramos',first:'Sofia',initials:'SR',studio:'Lumière Brow & Lash',
      kind:'Brow Artist',connected:false,brand:{primary:'#B5468A',secondary:'#7C3AED'},
      studioAddress:'340 Grand Ave, Oakland CA 94610',studioPhone:'(510) 444-2210',
      treatment:'Brow Lamination',session:2,totalSessions:4,
      nextDate:'Jul 23, 2026',nextTime:'11:00 AM',apptISO:'2026-07-23T11:00:00',
      nextDateISO:'20260723',nextTimeISO:'180000',durationMins:50,unread:2,
      summaryNote:'Brows are set beautifully, brush them up daily and avoid water for 24h. ✨',
      thread:[
        {from:'provider',text:'Hi Maya! Your lamination came out gorgeous. Remember: no water on the brows for 24 hours 💕',time:'Jun 18 · 1:30 PM'},
        {from:'me',text:'They look amazing, thank you Sofia!',time:'2:02 PM'},
      ],
      seriesLabel:'Brow lamination series',
      homecare:[
        {key:'Brush brows up',icon:'🪮',time:'Morning',tip:'Brush upward and outward to set the laminated shape for the day.',done:true},
        {key:'Keep dry (first 24h)',icon:'💧',time:'Day 1',tip:'No water, steam or sweat on the brows for the first 24 hours.',done:true},
        {key:'Conditioning serum',icon:'🌿',time:'Evening',tip:'Nightly growth + conditioning serum keeps brows soft and full.'},
        {key:'Nourishing oil',icon:'🌙',time:'Evening',tip:'A little castor or brow oil 2–3 nights a week keeps them healthy.'},
      ],
      avoid:['Water on brows (24 hrs)','Oil cleansers near brows','Rubbing or picking'],
      homecareNote:'Brush them up every morning and use the serum nightly, lamination lasts 6–8 weeks with good care. 💕',
      progress:[
        {date:'Mar 5',label:'Session 1 · Shaping',bg:'#e7d3df',icon:'#9a6a86',opacity:'.6'},
        {date:'Jun 18',label:'Session 2 · Lamination + Tint',bg:'#f0d6e6',icon:'#B5468A',opacity:'1'},
      ],
      observations:[
        {date:'Jun 18, 2026',label:'Session 2 · Lamination + Tint',highlights:[
          {icon:'ti-sparkles',color:'#B5468A',text:'Lamination set beautifully, brows look fuller and lifted.'},
          {icon:'ti-check',color:'#4ec49a',text:'Tint matched perfectly to your hair. Even, natural finish.'},
        ]},
        {date:'Mar 5, 2026',label:'Session 1 · Shaping',highlights:[
          {icon:'ti-target',color:'#B5468A',text:'Mapped a slightly higher arch to open up the eyes, great starting shape.'},
        ]},
      ],
      summaries:[
        {date:'Jun 18, 2026',label:'Session 2 · Lamination + Tint',note:'Your lamination came out gorgeous, fuller, lifted brows. Remember: no water for 24 hours and brush them up daily!',homecare:['Brush brows up each morning','Conditioning serum nightly','No water for 24 hours','Nourishing oil 2–3x a week']},
        {date:'Mar 5, 2026',label:'Session 1 · Shaping',note:'Mapped and shaped your brows, lovely natural arch. We\'ll laminate next visit.',homecare:['Brow growth serum nightly','Avoid over-plucking']},
      ],
      products:[
        {name:'Brow Lamination Serum',brand:'Lumière',icon:'🌿',url:'lumierebrow.com/ref/sofia',why:'Conditions laminated brows so the lift lasts the full 6–8 weeks.'},
        {name:'Castor Brow Oil',brand:'The Ordinary',icon:'🌙',url:'theordinary.com/ref/sofia',why:'A nightly oil to keep brows soft, full and healthy.'},
        {name:'Spoolie Brush Set',brand:'Lumière',icon:'🪮',url:'lumierebrow.com/ref/sofia',why:'For brushing brows up and setting the shape each morning.'},
      ],
      shopGoals:'long-lasting, healthy laminated brows',
      profileTitle:'My brow profile',
      profileFields:[['Brow shape','Full, arched'],['Tint shade','Soft black'],['Lamination','Every 6–8 weeks'],['Sensitivities','None noted']],
      checkin:{steps:[
        {title:'Updates',questions:[
          {type:'boolean',id:'reactions',flagLabel:'a reaction',label:'Any reactions since your last visit?',hint:'Redness, irritation, or sensitivity around the brows.',detailPh:'e.g. mild redness for a day, a little itchy...'},
          {type:'boolean',id:'productChanges',flagLabel:'a product change',label:'Changed any products near your brows?',hint:'New serums, retinol, or actives used near the brow area.',detailPh:'e.g. started a retinol, new cleanser...'},
        ]},
        {title:'Today\'s look',questions:[
          {type:'iconChoice',id:'look',label:'What look are you going for?',options:[['🪶','Soft & natural'],['⬆️','Lifted & full'],['🎯','Defined & bold'],['💬','Not sure, advise me']]},
          {type:'iconChoice',id:'tint',label:'Tint',options:[['🤎','Match my hair'],['⬛','A shade darker'],['✨','Just lamination'],['💬','Ask me']]},
        ]},
        {title:'Comfort',id:'comfort',questions:[
          {type:'iconChoice',id:'drink',label:'Your drink',options:CI_DRINKS},
          {type:'iconChoice',id:'music',label:'Music',options:CI_MUSIC,allowCustom:true,customPh:'e.g. pop, a podcast, silence…'},
          {type:'levelChoice',id:'heatedPad',label:'Heated mattress pad',options:CI_LEVELS},
          {type:'iconChoice',id:'covering',label:'Covering',columns:3,options:CI_COVERING},
        ]},
        {title:'Anything else',questions:[
          {type:'notes',id:'notes',ph:'Inspo photos, questions, requests...'},
        ]},
      ]},
    },
  ],
}; };
