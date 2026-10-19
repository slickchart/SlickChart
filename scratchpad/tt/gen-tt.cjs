// The Tattoo Artist Collection (Ashley, 2026-10-19) -> app forms + guides, written from her PDF text.
// Same rules as the other collections (CLAUDE.md §1e): placeholders resolved to the PDF's own defaults
// so clients never see brackets; business name/phone become {business}/{phone|...}; artist-only boxes
// (photo ID type, last 4 and expiry, artist use / office boxes, artist signature and license #, skin
// check at consult, quote / rate / deposit / design fee fields, ink lot log, reaction record, plan going
// forward, session record, film brand, paid touch-up price) stay on the printable record; no card-on-file
// question.
//   node scratchpad/tt/gen-tt.cjs > scratchpad/tt/tt-data.js
const forms={};
function form(id,name,build){
  const qs=[];let n=0;
  const add=(label,type,required,extra)=>{const q={id:id+'-'+(++n),label,type,required:!!required};if(extra)Object.assign(q,extra);qs.push(q);};
  const h={
    st:(l,r)=>add(l,'Short text',r), lt:(l,r)=>add(l,'Long text',r), date:(l,r)=>add(l,'Date',r),
    ss:(l,o,r)=>add(l,'Single select',r,{options:o}), mc:(l,o,r)=>add(l,'Multiple choice',r,{options:o}),
    yn:(l,r)=>add(l,'Yes / No',r), ci:(l,items)=>add(l,'Contraindications',false,{items}),
    init:(...ls)=>ls.forEach(l=>add(l,'Yes / No',true)),
    about:(head,parts)=>add(head+'. '+parts.map(([k,v])=>k+': '+v).join(' ')+' I have read this.','Yes / No',true),
    risks:(head,items,note)=>add(head+'. '+items.join('; ')+'.'+(note?' '+note:'')+' I understand these risks.','Yes / No',true),
    name:()=>add('Client name','Short text',true), dob:()=>add('Date of birth','Date',false),
    sig:(l)=>add(l||'I confirm the information above is accurate','Signature',true),
  };
  build(h);forms[id]={name,qs};
}

form('tt-intake','Tattoo client intake',h=>{
  // About you
  h.st('Full name',true);h.dob();h.st('Mobile phone');h.st('Email');h.st('Address');
  h.st('Emergency contact & relationship');h.st('Their phone');h.st('How did you hear about us?');
  h.ss('Best way to reach you',['Text','Email','Call']);h.yn('OK to text you reminders?');
  // Age & ID check: ID type, last 4, expiry and the artist's verification row stay on the printable.
  h.yn('AGE & ID CHECK. 18+ only. Bring valid government photo ID to every appointment. We keep a copy on file. I have read this.',true);
  // Your tattoo
  h.mc('Which service are you booking? Check all that apply',['Standard tattoo','Cover-up or rework','Fine line or micro','Large-scale or sleeve','Color or realism','Touch-up','Flash or walk-in','Not sure yet'],true);
  h.lt('Your idea, in a few words');
  h.st('Where on your body?');h.st('Size (inches)');h.yn('First tattoo?');
  h.ss('Ink',['Black & gray','Color','Both','Not sure']);
  // Your tattoo & skin history (her Yes / No + Notes grid)
  h.yn('Healed well from past tattoos?');
  h.ci('Your tattoo & skin history. Past tattoos and how they healed help us plan your design, placement and aftercare. Check anything that applies to you.',[
    'A tattoo that stayed raised or itchy','Reaction to tattoo ink, any color','Reaction to bandage or tape','Keloid or raised scar anywhere',
    'Laser removal or fading','Fainted with needles or blood','Sunburn or tan at the site now']);
  h.yn('Healed with second-skin film before?');h.yn('Used numbing cream before?');
  h.lt('Notes on your tattoo and skin history');
  h.yn('Alcohol or drugs in the last 24 hours?');h.yn('Eaten in the last 3 hours?');
  h.st('Your job, sports or hobbies (sun, water and friction affect healing)');
  // page 2: Health, allergies & agreement
  h.mc('Are you allergic or sensitive to any of these? Check all that apply',['Latex','Bandage or tape adhesive','Tattoo ink (red is most common)','Soaps or antiseptics','Ointments or lotions','Fragrance','Lidocaine or numbing creams','Nickel or other metals','None that I know of']);
  h.st('Reaction you had, and to what');
  h.ci("Your health. Please answer every line. Some answers mean we wait or need your doctor's OK. Never stop a medicine on your own. Check anything that applies to you.",[
    'Pregnant or breastfeeding','Blood thinners or daily aspirin','Bleeding or clotting disorder','Diabetes','Immune suppression or chemo',
    'Heart condition or pacemaker','Epilepsy or seizures','Fainting or low blood pressure','Eczema, psoriasis or rash at the site',
    'Accutane (isotretinoin) in the last 6–12 months','Moles or birthmarks at the site','Skin cancer, now or in the past',
    'Hepatitis or a bloodborne condition (optional)','Any other medical condition']);
  h.lt('All medications you take, including prescriptions and supplements');
  h.yn('Numbing product used today or planned?');h.st('If yes: product & strength');
  h.yn('NUMBING. Numbing follows {business} policy. Never use more than 4% lidocaine, and apply only as directed to a small area. I have read this.',true);
  h.init("My answers are true and complete. I'll tell my artist if my health or medicines change.",
    'I am 18 or older and have shown valid photo ID. I have had no alcohol or drugs in the last 24 hours.',
    "Ink allergies can appear years later. Tattoos can rarely tingle during an MRI, so I'll tell my radiologist.",
    "No exact result is promised. I'll follow my aftercare and see a doctor if I notice signs of infection.",
    "I'll tell the studio about any reaction so it can be recorded with the ink brand and lot number.");
  h.yn('YOUR PRIVACY. Your information is kept confidential, stored securely and used only to provide your services. Records and a copy of your ID are kept 3 years or as your state requires. I have read this.',true);
  h.sig();
});

form('tt-consult','Design consultation & placement',h=>{
  // The body map, how placement was checked, the artist's skin reading, quote / deposit / design fee
  // and the artist's checklist and signature stay on the printable.
  h.name();h.st('Artist');
  // Placement
  h.st('Body area');h.st('Width (in)');h.st('Height (in)');h.yn('Wraps around?');
  h.lt('Work around (moles, scars, existing work). We work around moles, never over.');
  // Style & references
  h.mc('Style',['Fine line','Traditional','Neo-traditional','Black & gray realism','Color realism','Blackwork','Script or lettering','Japanese','Geometric or dotwork','Watercolor','Illustrative','Other']);
  h.ss('Ink',['Black & gray','Color','Both']);
  h.ss('Design',['Custom','Flash']);h.st('Flash #');
  h.lt('References (inspiration only: your artist draws an original design)');
  // Lettering & spelling check
  h.lt('Words, names or dates, exactly as they should appear');
  h.yn("I checked the spelling, accents, numbers and dates above, and I'll check them again on the stencil.",true);
  // Session plan (quote, rate, deposit and design fee stay on the printable)
  h.st('Estimated sessions');h.st('Hours per session');
  h.yn("CLIENT APPROVAL. I reviewed the placement, size and design plan with my artist. I'll approve the final design and stencil before we start. The quote is an estimate and may change if the size or detail changes. Heal between sessions: 3–4 weeks.",true);
  h.sig('Client signature');
});

form('tt-consent','Tattoo consent & release',h=>{
  h.name();h.dob();h.lt('Tattoo design & placement',true);
  h.about('ABOUT YOUR TATTOO',[['What this covers','Custom, flash, fine line, cover-up, large-scale and touch-up work at {business}.'],["How it's done",'Single-use needles and ink caps, and barrier film on equipment, per local health department rules.'],['Permanence','Tattoos are permanent. Laser removal is costly, slow and may not be complete.']]);
  h.risks('POSSIBLE RISKS',['Infection: redness, heat, swelling or pus, most often from aftercare problems','Allergic reaction: to ink pigments, red most often, and can appear months or years later','Scarring and keloids: raised or thick scars, more likely if you have scarred before',"Blowout: ink spreading under the skin into a blurry halo, and it can't be undone",'Bleeding and bruising: more likely with blood thinners, alcohol or a lot of caffeine','Fading and touch-ups: healing varies, and patchy spots may need a touch-up','Granulomas: small bumps around ink particles, sometimes long after healing','MRI effects: rare tingling or burning, so tell your radiologist about your tattoos','Fainting: eat a meal and drink water first, and tell your artist if you feel unwell','Skin flare-ups: eczema, psoriasis or sun sensitivity can flare in tattooed skin'],
    'Results depend on your skin, placement and aftercare. Pregnant, on blood thinners or Accutane? Tell your artist first. Ink brand, color and lot # are logged for recalls. Report US ink reactions to the FDA (MedWatch).');
  h.init("I've read the risks above and had my questions answered. No result was promised.",
    'My health information is true and complete, including medications and any numbing product I used.',
    'I approved the final design, size and placement before the stencil, and checked all spelling.',
    'I understand my tattoo is permanent, and that aging, sun and my skin can change how it looks.',
    'No tattooing over moles, rashes, sunburn or broken skin. My session may be changed or rescheduled.',
    "I'll follow aftercare and contact you, and a doctor, if signs of infection or a reaction appear.");
  h.ss('Photos of my tattoo for my records and portfolio, with no face shown',['I agree','I do not agree'],true);
  h.init('I release {business} from claims from details I withheld or aftercare I skipped, as state law allows.',
    'I am 18 or older with valid photo ID, not under the influence of alcohol or drugs, and signing freely.');
  h.sig();
});

form('tt-sensitivity','Ink & skin sensitivity record',h=>{
  // Ink lot log, reaction record and plan going forward are the artist's: printable only.
  h.name();h.st('Phone');h.st('Known allergies');h.st('Doctor · clinic');
  h.yn("WHY INK SENSITIVITY MATTERS. Red ink is most often linked to allergic reactions, which can appear years later. Latex, adhesive, soaps and ointments can irritate skin too. Artists don't diagnose allergies: any itchy, raised or swollen area is referred to a doctor. I have read this.",true);
  h.yn('Ever reacted to a tattoo or a specific ink color?');
  h.yn('Itching, bumps or swelling in a healed tattoo?');
  h.yn('Reacted to latex, bandage tape or second-skin film?');
  h.yn('Reacted to soaps, ointments, antiseptics or black henna?');
  h.lt('Details: what, when, what happened');
  h.yn("I've shared my allergy history honestly. I'll report any itching, bumps or swelling in my tattoo, and call 911 for trouble breathing.",true);
  h.sig();
});

form('tt-photo','Photo & portfolio release',h=>{
  h.name();h.st('Phone or email');
  h.yn('Studio record (required): before and finished photos in my private file to track healing and touch-ups. Never shared.',true);
  h.yn('Portfolio: shown on your website, in print, in a portfolio book or at a convention booth to show your work.');
  h.yn('Social media: posted on your business social accounts, including process videos, time-lapses and reels.');
  h.ss("How much of me may be shown (if yes to portfolio or social media). You may see any image before it's posted.",['Tattoo only, no identifying marks','Tattoo & surrounding body','My face may show']);
  h.yn('Tag me, name me or quote me: you may tag my social handle, use my first name, or quote my review with my photos.');
  h.st('Name or handle to use (if yes above)');h.st('Limits (areas, platforms, dates)');
  h.yn("HOW YOUR PHOTOS ARE HANDLED. Your face is never shown without your written OK. Custom designs are never repeated for other clients. Storage: kept on a studio device in our secure app, never a personal camera roll, for 3 years or per state rules. Changing your mind: text or email to withdraw; studio posts come down within 7 days; others' shares may be out of reach. No payment: this release is voluntary; you won't receive payment, royalties or free tattoos for photos or reviews. Honest images: no filters that change the color or crispness of your tattoo; fresh and healed photos are labeled as such. Sharing photos is your choice. Saying no never affects your appointment, and you can change your mind any time. I have read this.",true);
  h.sig('By signing, I confirm my choices above. This release stays in effect until I change or withdraw it in writing.');
});

form('tt-policy','Booking & deposit policy',h=>{
  h.name();h.date('Appointment date');
  h.yn("BOOKING & DEPOSIT POLICY. Your time and your custom design are reserved just for you. These policies keep things fair for everyone. Deposit: $100 or 30%; non-refundable; holds your date and design time and is applied to your final session. Notice to change: 48 hours, to move your appointment and keep your deposit. Grace period: 15 minutes; after that, it counts as a no-show. ID & age: 18+ only; bring valid government photo ID to every appointment; no ID, no tattoo, and your deposit is forfeited. Design & design fee: your deposit covers drawing time and 2 rounds of changes; extra revisions or large custom pieces are charged by the hour. Rescheduling: 48 hours' notice moves your deposit once; after that, a new deposit is needed. No-show & late: arriving more than 15 minutes late without contact, or changing with less notice, counts as a no-show, and your deposit is forfeited. Final approval: you approve the final design, size and stencil placement before we start; names, dates and spelling are checked and initialed by you. I have read this.",true);
  h.yn("YOUR VISIT, TOUCH-UPS & REFUNDS. Drugs & alcohol: please arrive sober, with no alcohol or drugs for 24 hours; we won't tattoo anyone who seems impaired, and the deposit is forfeited. Guests: one guest welcome; no children or pets in the work area (health department rules). Payment & tips: balance due after each session; tips appreciated, never required. Touch-ups: one free touch-up within 1–3 months, once fully healed (no sooner than 4–6 weeks); hands, fingers, feet and face are excluded; not covered: skipped aftercare or sun damage. Refunds: no refunds once we start; your artist may decline a design or adjust its size so it ages well. Feeling unwell? Sunburn, a rash or cuts at the site, or a fever? Tell us and we'll reschedule with no fee. I have read this.",true);
  h.init('My deposit is non-refundable and will be applied to my final session.',
    "A tattoo is permanent. I'll check the spelling and placement before the stencil goes on.");
  h.sig("By signing, I confirm I've read and agree to this policy, including the non-refundable deposit and touch-up terms.");
});

// The six service consents share one shape, as on the printable pages.
function consent(id,name,{what,service,serviceLabel,before,checksLabel,checks,noneLabel,extras,inits,consentTo}){
  form(id,name,h=>{
    h.name();h.dob();h.st('Artist');
    h.about('ABOUT THIS SERVICE',what);
    (before||[]).forEach(x=>x(h));
    if(service)h.mc(serviceLabel,service,true);
    h.risks('POSSIBLE RISKS AND SIDE EFFECTS',RISKS[id]);
    h.ci((checksLabel||'Quick health check')+': check anything that applies to you.',checks);
    h.lt(noneLabel||'If you checked anything, tell us more');
    (extras||[]).forEach(x=>x(h));
    h.init(...inits);
    h.sig(AGE+consentTo);
  });
}
const AGE='By signing, I confirm I am 18 or older with valid photo ID (copy kept on file), am not under the influence of alcohol or drugs, have read this form, had my questions answered, and consent to ';
const SHARED="I've shared my full health and medication history, including any numbing product I applied today.";
const LOT='Ink brand, color and lot # are logged on my session record so I can be contacted if an ink is recalled.';
const RISKS={
  'tt-standard-consent':['Infection, most often from aftercare problems','Raised scars or keloids, mainly in scar-prone skin','Swelling, bruising or oozing for a few days','A flare of eczema or psoriasis at the site','Allergy to ink, even years later (red is most common)','Blowout: ink spreading into a blurry halo','Patchy or faded areas that may need a touch-up','Rare burning or tingling during an MRI scan'],
  'tt-coverup-consent':['Parts of the old tattoo showing through, now or later','Old scar tissue taking ink unevenly or blowing out','Allergy to ink, even years later (red is most common)','Raised scars or keloids, mainly in scar-prone skin','More swelling and a longer heal from heavy saturation','Extra sessions or touch-ups being needed','Infection, most often from aftercare problems','Rare burning or tingling during an MRI scan'],
  'tt-fineline-consent':["Blowout: ink spreading into a blur that can't be undone",'Patchy or broken lines after healing','Tiny details merging together over time','Allergy to ink, or infection, as with any tattoo','Lines softening, blurring or spreading as skin ages','Faster fading on hands, fingers, feet and ribs','Quick fading if the tattoo gets too much sun','Rare burning or tingling during an MRI scan'],
  'tt-large-consent':['Swelling, bruising and soreness across a large area','A longer, itchier heal, often 3–6 weeks per area','Color fading faster in sun; uneven healing','Raised scars or keloids, mainly in scar-prone skin','Fatigue, light-headedness or fainting in long sessions','Allergy to ink, most often red, even years later',"Infection if a large area isn't kept clean",'Rare burning or tingling during an MRI scan'],
  'tt-touchup-consent':['Touched-up areas looking darker for a few weeks',"Scar tissue or blowout that can't be corrected",'Infection, most often from aftercare problems','Patchiness that still needs a second pass','Allergy to ink, even if you healed well before','Rare burning or tingling during an MRI scan'],
  'tt-second-skin-consent':['Adhesive allergy: itching, bumps or rash under the film','Bacteria getting in if the seal leaks','Bumps from hair or sweat trapped under the edges','Allergy to ink, even years later (red is most common)','Skin irritation or tearing if film is pulled off fast','Infection if film stays on too long','Heat rash in hot weather or during exercise','Rare burning or tingling during an MRI scan'],
};

consent('tt-standard-consent','Standard tattoo consent',{
  what:[['What it is','Ink placed in the skin with sterile, single-use needles for a custom or flash design in one session.'],['What to expect','About 1–5 hours. Stinging or burning that varies by placement. Ask for a break any time.'],['Healing and permanence','The surface heals in about 2–4 weeks, deeper skin in 1–3 months. Your tattoo is permanent.']],
  service:['Custom','Flash','Black & gray','Color','Plastic wrap','Second-skin film'],serviceLabel:"Today's tattoo",
  checks:['Pregnant or breastfeeding','Immune suppression or chemo','Keloid or raised scars','Eczema or psoriasis','Blood thinners or bleeding disorder','Heart condition or pacemaker','Accutane in last 6–12 months','Allergy: latex, ink or ointment','Diabetes','Epilepsy or fainting','Sunburn, rash or cut at the site','Alcohol or drugs in last 24 hours'],
  noneLabel:'None of these apply to me, or list any that do',
  extras:[h=>{h.st('Placement');h.st('Size (in.)');
    h.yn('DESIGN SIGN-OFF. I approved the final design and stencil placement, and checked every word, name, date and number.',true);}],
  inits:[SHARED,"My tattoo is permanent. Results depend on my skin, placement and aftercare, and aren't guaranteed.",'I saw new needles and cartridges opened for me and ink poured into single-use caps.',"I'll tell my artist right away if I feel faint, dizzy or unwell, or need a break.","If I get spreading redness, pus, red streaks or a fever, I'll see a doctor and let the studio know.",LOT,'Before and after photos for my private record are OK. Social media use only with my separate release.','Deposits and fees follow {business} policy. No refunds once tattooing has started.'],
  consentTo:'this tattoo.'});

consent('tt-coverup-consent','Cover-up & rework consent',{
  what:[['What it is',"Covering an old tattoo with a new design, or reworking one, including another artist's work."],['What to expect','Usually darker and larger than the old tattoo and built around it. Plan for 2 or more sessions.'],['Before we start','Very dark ink may need laser fading by a licensed provider first, often 2–4 sessions.']],
  service:['Full cover-up','Blast-over','Rework',"Other artist's work",'Laser-faded'],serviceLabel:"Today's work",
  checksLabel:'Quick health and skin check',
  checks:['Pregnant or breastfeeding','Immune suppression or chemo','Accutane in last 6–12 months','Sunburn, rash or cut at the site','Blood thinners or bleeding disorder','Heart condition or epilepsy','Laser in last 6–8 weeks','Allergy: latex, ink or ointment','Diabetes','Keloid or raised scars','Scarring in the old tattoo','Reaction to the old ink'],
  noneLabel:'None of these apply to me, or list any that do',
  extras:[h=>{h.yn("ABOUT YOUR EXISTING TATTOO. A cover-up can't erase it. Your artist will tell you honestly what can be hidden and may suggest laser fading first. Before photos are taken today. I have read this.",true);
    h.st('Planned number of sessions');}],
  inits:["I've shared my full health history and what I know about my old tattoo, including laser and past reactions.",'I understand a cover-up is limited by the old tattoo. Some of it may still show, and no result is guaranteed.','I accept the new design may need to be darker, larger or placed differently than I first pictured.',"Rework of another artist's tattoo is done as is; {business} isn't responsible for the original work.",'I approved the final design and stencil placement, and checked all spelling, names and dates.','Plan: the number of sessions above, 3–4 weeks apart. Extra sessions follow policy; any laser is booked separately.',LOT,'Before photos are required. Social media use only with my separate release. No refunds once work starts.'],
  consentTo:'this cover-up or rework.'});

consent('tt-fineline-consent','Fine line & micro tattoo consent',{
  what:[['What it is','Single-needle or fine-line work and small designs, often under 2 inches, with fine detail.'],['What to expect','Usually 30–90 minutes. Lines go in slowly and with a light hand to help keep them crisp.'],['How it ages','Fine lines soften, blur and fade over the years more than bold work. A touch-up is often needed.']],
  service:['Single needle','Fine line','Micro','Script','Dotwork','Touch-up booked'],serviceLabel:"Today's tattoo",
  checksLabel:'Quick health and skin check',
  checks:['Pregnant or breastfeeding','Immune suppression or chemo','Accutane in last 6–12 months','Moles in the design area','Blood thinners or bleeding disorder','Thin or sun-damaged skin','Sunburn, tan or rash at the site','Allergy: latex, ink or ointment','Diabetes or slow healing','Keloid or raised scars','Eczema or psoriasis','Heart condition or epilepsy'],
  noneLabel:'None of these apply to me, or list any that do',
  extras:[h=>h.ss('SIZE AND PLACEMENT. Very small text and detail blur together as skin ages. Your artist may suggest a larger size or a spot that holds fine work better.',['Going with the suggested size','Keeping my size; I accept the risk'],true)],
  inits:[SHARED,"I understand fine lines can blur, spread and fade over time, and crisp healed lines aren't guaranteed.",'I approved the final design, size and placement, and checked all spelling, names, dates and numbers.',"A touch-up is often needed. It's done no sooner than 4–6 weeks and free within 1–3 months, per policy.",'Hands, fingers, feet and ribs fade faster and may be excluded from free touch-ups.',"I'll care for it gently with a thin layer of ointment, keep it out of the sun, then use SPF 30+ once healed.",LOT,'Photos for my record are OK; social media only with my separate release. Fees follow studio policy.'],
  consentTo:'this fine line tattoo.'});

consent('tt-large-consent','Large-scale & realism consent',{
  what:[['What it is','Sleeves, back pieces and detailed color or realism work, built over several sessions from one design.'],['What to expect','Sessions of 3–6 hours. Eat a full meal, drink water and sleep well first. Breaks are built in.'],['Between sessions','Each area heals 3–4 weeks before it is worked on again. The session count is an estimate.']],
  // Rate and deposit per session stay on the printable session plan.
  before:[h=>{h.st('Sessions (estimated)');h.st("Today: session number, of how many");}],
  checks:['Pregnant or breastfeeding','Immune suppression or chemo','Low blood sugar or anemia','Allergy: red ink, latex, ointment','Blood thinners or bleeding disorder','Heart condition or pacemaker','Keloid or raised scars','Sunburn, rash or cut on the area','Diabetes','Epilepsy or fainting','Accutane in last 6–12 months','Alcohol or drugs in last 24 hours'],
  noneLabel:'None of these apply to me, or list any that do',
  extras:[h=>h.yn('NUMBING. Numbing follows {business} policy. The FDA warns against lidocaine over 4% or heavy use over large areas. I have read this.',true)],
  inits:["I've shared my full health history, including medications and any numbing product I applied today.",'I approved the overall design and placement, and checked all spelling. Later changes may add sessions.','Session count and total cost are estimates. If I stop early, the piece may look unfinished.','A non-refundable deposit holds each session and is applied to that session; a no-show forfeits it.',"I'll let each area heal 3–4 weeks between sessions and follow aftercare after every session.","I'll eat, hydrate and rest before each session and tell my artist right away if I feel faint or unwell.",'Ink brand, color and lot # are logged each session so I can be contacted if an ink is recalled.','Before and progress photos for my record are OK. Social media use only with my separate release.'],
  consentTo:'this multi-session plan.'});

consent('tt-touchup-consent','Touch-up consent',{
  what:[['What it is','A short session to fill patchy spots, faded lines or light areas in a fully healed tattoo.'],["When it's done",'Once fully healed, no sooner than 4–6 weeks. Free once within 1–3 months of your session.'],['Not included','Design changes, additions, and wear from sun, picking or poor aftercare are quoted as new work.']],
  // Original session artist and ink lot # stay on the printable.
  before:[h=>{h.date('Original session date');h.st('Placement');}],
  checksLabel:'Anything changed since your session?',
  checks:['Pregnant or breastfeeding','Accutane in last 6–12 months','Still scabbing or peeling','Reaction after last session','New medications','New diagnosis or surgery','Sunburn or tan on the tattoo','Rash or cut on the site','Blood thinners','Diabetes or immune issues','Raised or itchy lines','Keloid or raised scars'],
  noneLabel:'Nothing has changed, or list any that do',
  extras:[h=>h.yn('FREE TOUCH-UP EXCLUSIONS. Hands, fingers, feet and face; fading from sun, picking, soaking or skipped aftercare; and work by another studio. I have read this.',true)],
  inits:["I've told my artist about any health, medication or skin changes since my last session.",'My tattoo is fully healed, with no scabs, shiny skin or peeling, and at least 4–6 weeks have passed.','Free touch-ups are offered once, within 1–3 months of my session, per {business} policy.',"I understand excluded areas and aftercare-related fading are charged, and some flaws can't be fixed.","Any change to the design or lettering is new work. I'll approve it and check the spelling before we start.",'Ink brand, color and lot # used today are logged with my original record for recall tracking.',"I'll follow aftercare again for about 1–2 weeks and see a doctor if signs of infection appear.",'Before and after photos for my record are OK. Social media use only with my separate release.'],
  consentTo:'this touch-up.'});

consent('tt-second-skin-consent','Second-skin healing consent',{
  what:[['What it is','A clear, breathable adhesive film placed over your fresh tattoo to protect it as it starts to heal.'],['The timeline','First piece off at 8–24 hours, then wash. A second piece can stay up to 6 days. Never more than 7 days total.'],["What's normal",'A pocket of plasma, ink and fluid under the film in the first day or two. It looks messy but is expected.']],
  // Film brand stays on the printable.
  service:['First piece applied','Second piece supplied','Switch to traditional'],serviceLabel:"Today's plan",
  before:[h=>h.ss("ADHESIVE CHECK. Have you reacted to bandages, medical tape or clear film dressings? If you're not sure, a small test patch can go on 24 hours before.",['No adhesive reactions','Use traditional wrap instead'],true)],
  checksLabel:'Quick health and skin check',
  checks:['Adhesive or bandage allergy','Eczema or psoriasis at the site','Blood thinners or bleeding disorder','Accutane in last 6–12 months','Latex allergy','Diabetes or slow healing','Pregnant or breastfeeding','Heavy sweating or hot job','Fragile or very sensitive skin','Immune suppression or chemo','Keloid or raised scars','Allergy: ink or ointment'],
  noneLabel:'None of these apply to me, or list any that do',
  inits:["I've shared any reaction to bandages, tape or adhesive film, plus my full health history.","I'll remove the first piece after 8–24 hours, wash gently, and reapply only on clean, dry skin.",'The film comes off by day 6, and never stays on more than 7 days in total, even if it looks fine.',"I'll remove it early for a rash, itching, burning or fluid leaking past the edge, then switch to traditional care.","I'll peel it slowly in a warm shower, low and in the direction of hair growth, never ripping it off.","A fluid pocket is normal. Spreading redness, heat, pus, red streaks or fever mean I'll see a doctor.",'I approved the final design and placement and checked all spelling. Ink lot # is logged for recalls.','Photos for my record are OK; social media only with my separate release. Fees follow studio policy.'],
  consentTo:'second-skin healing.'});

// ---- guides (aftercare & prep handouts) ----
const CALL='Questions? Text {phone|me} · {business}';
const P=['tattoo'];
const INFECT='Call me and see a doctor if you notice: redness or swelling spreading after day 3; yellow or green pus, or a bad smell; red streaks, heat or severe throbbing pain; fever, chills, a rash, hives or lasting bumps. Any of these: see your doctor, then text me so I can log the ink batch.';
const E911='Swelling of the face or throat, or trouble breathing: call 911.';
const guides=[
 {id:'g-tt-standard',icon:'🖋️',title:'Caring for your new tattoo',cat:'Aftercare',profs:P,tips:[
  'For the first couple of weeks your tattoo is a healing wound. Clean, gentle, simple care helps it heal smoothly and keeps the lines and color at their best.',
  'First day (wrap on). Normal: redness, tenderness and swelling; clear plasma and a little ink seep out. Do: wrap off after 2–5 hours; wash with clean hands, lukewarm water and fragrance-free soap; pat dry. Avoid: re-wrapping in plastic, scrubbing, or sleeping on it; alcohol tonight.',
  'Days 2–3 (settling). Normal: oozing slows; it may feel warm and tight, and look shiny or slightly raised. Do: wash 2–3 times a day; let it air-dry, then add a very thin layer of ointment. Avoid: thick ointment or petroleum jelly; tight clothes rubbing the area.',
  'Days 4–14 (peeling). Normal: flaking, peeling and itching; colors can look cloudy or dull for a while. Do: switch to fragrance-free lotion, thin layers, a few times a day; loose, clean clothes. Avoid: picking, scratching or slapping; pools, baths, hot tubs, the sea and sun.',
  'Weeks 2–4 (healed surface). Normal: skin looks healed but may stay shiny; deeper healing goes on for weeks. Do: keep moisturizing; once fully healed, SPF 30+ every time it sees sun. Avoid: tanning beds and sunburn; any touch-up before 4–6 weeks.',
  'Good to know: change your sheets and pillowcase tonight; fragrance-free products only until healed; colored flakes are normal, not lost ink; gym: wait 48 hours, wipe equipment first; short showers are fine, avoid a direct spray; no antibiotic creams unless a doctor prescribes them; keep pets off the bed and away from it; healing takes longer on hands, feet and joints.',
  'Clean hands: before every touch. Thin layers: a little goes a long way. Hands off: let flakes fall off. Shade it: no sun, then SPF for life.',
  INFECT,E911,CALL]},
 {id:'g-tt-coverup',icon:'🎨',title:'Caring for your cover-up',cat:'Aftercare',profs:P,tips:[
  'Cover-ups use denser lines and more saturated ink, so they can look darker and more raised while they heal. Gentle care gives the new design its best result.',
  'First day (wrap on). Normal: more redness, swelling and oozing than usual, from heavier packing. Do: wrap off at 2–5 hours; wash gently with fragrance-free soap; pat dry. Avoid: re-wrapping, scrubbing, sleeping on it or alcohol tonight.',
  'Days 2–4 (dark & raised). Normal: darker and bolder than it will heal; feels tight, warm or puffy. Do: wash 2–3 times a day; a very thin layer of ointment for 3–4 days. Avoid: thick ointment that traps moisture; tight sleeves or straps.',
  'Days 5–14 (peeling). Normal: thicker flakes; the old design may seem to show through. Do: thin fragrance-free lotion; let flakes come off by themselves. Avoid: picking, which can pull out ink; soaking, swimming, sun.',
  'Weeks 3–6 (settling). Normal: color softens into its healed tone; some spots may need another pass. Do: send me a photo at 4–6 weeks; book any planned session. Avoid: sun and tanning beds; judging it before it has healed.',
  'While it heals: heavy saturation sits darker and higher at first, and the old tattoo can peek through as new ink settles. Give it 4–6 weeks before judging the final look; we will check it together.',
  'Good to know: cover-ups often need 2 or more sessions; fully heal between sessions, usually 4–6 weeks; fragrance-free products only, no antibiotic creams; laser-faded skin may heal more slowly, tell me; old scar tissue can take ink unevenly; change sheets tonight and wear loose, clean clothes.',
  'Be patient: darker is normal. Thin layers: a little goes a long way. Hands off: let flakes fall off. Photo check: a picture at 4–6 weeks.',
  INFECT,E911,CALL]},
 {id:'g-tt-fineline',icon:'✨',title:'Caring for your fine line tattoo',cat:'Aftercare',profs:P,tips:[
  'Fine lines hold less ink than bold work, so they need the gentlest care. Light washing, little product and strict sun care keep them crisp.',
  'First day (wrap on). Normal: light redness and a little swelling; lines can look slightly fuzzy or raised. Do: wrap off at 2–5 hours; wash softly with fingertips and fragrance-free soap. Avoid: washcloths, loofahs, scrubbing, or a strong shower stream on it.',
  'Days 2–3 (swelling settles). Normal: lines may look thicker or blurry from swelling; this settles. Do: pat dry; a rice-grain amount of ointment, only if it feels dry. Avoid: heavy ointment, which softens lines; makeup or perfume on it.',
  'Days 4–14 (light flaking). Normal: light flaking and itching; lines can look patchy for a while. Do: thin fragrance-free lotion once or twice a day; loose clothing, clean bedding. Avoid: picking or rubbing; pools, baths, hot tubs and sun.',
  'Weeks 3–6 (crisp again). Normal: lines settle crisp and fine; small gaps may show where ink did not hold. Do: SPF 30+ once healed; send me a photo at 4–6 weeks if you see gaps. Avoid: tanning beds and sunburn; any touch-up before 4–6 weeks.',
  'Sun & fading: UV is the biggest reason fine lines fade. Keep it covered until healed, then SPF 30+ every day it sees sun. Touch-ups are common with fine line work; tell me if a line looks thin.',
  'Good to know: less is more, too much moisture blurs fine lines; lines soften and spread a little over the years; keep retinol and exfoliating acids off until healed; hands, fingers and feet fade fastest; a light fade at 4–6 weeks is common; wash your hands every time before you touch it.',
  'Feather light: fingertips only. Rice grain: a tiny dab only. Hands off: let flakes fall off. SPF daily: sun fades fine lines.',
  INFECT,E911,CALL]},
 {id:'g-tt-large',icon:'🐉',title:'Caring for your large tattoo',cat:'Aftercare',profs:P,tips:[
  'Big, color-packed pieces ask more of your body. Expect more swelling and a longer heal, and let each session heal before the next.',
  'First day (wrap on). Normal: big areas swell, ooze and feel sore like a sunburn; you may feel tired. Do: wrap off at 2–5 hours; wash with fragrance-free soap, pat dry; rest, drink water. Avoid: alcohol, hard workouts, long drives; sleeping on it.',
  'Days 2–4 (peak swelling). Normal: swelling, warmth and stiffness peak, mostly on legs and arms. Do: raise a swollen limb; very thin ointment for 3–4 days. Avoid: tight sleeves, waistbands or straps; thick product that traps heat.',
  'Days 5–21 (peeling). Normal: peeling and itching over a big area; color looks milky. Do: thin fragrance-free lotion; loose, soft clothing; warm showers. Avoid: scratching or picking; pools, baths, hot tubs, the sea, sun.',
  'Weeks 3–6 (settling). Normal: surface heals but stays shiny longer; color settles in. Do: SPF 30+ once healed, color fades fast in UV; confirm your next session. Avoid: working over unhealed skin; sunburn before a session.',
  'Next session: heal fully before your next session, usually 3–4 weeks. Moisturize, stay out of the sun, and arrive rested, fed and hydrated. Tell me about new medications, illness or sunburn first.',
  'Good to know: big pieces can take 4–6 weeks or more to heal; red and bright inks can react later, tell me; fragrance-free products only, no antibiotic creams; change your sheets tonight and every few days; eat a full meal and bring snacks to long sessions; wash your hands every time before you touch it.',
  'Rest up: sleep, food and water. Thin layers: a little goes a long way. Hands off: let flakes fall off. Wait 3–4 weeks: heal between sessions.',
  INFECT,E911,CALL]},
 {id:'g-tt-touchup',icon:'🔁',title:'Caring for your touch-up',cat:'Aftercare',profs:P,tips:[
  'A touch-up is fresh work on small areas of healed skin. It usually heals faster, in about 1–2 weeks, but needs the same gentle care.',
  'First day (wrap on). Normal: new spots look darker, shiny and raised next to healed areas. Do: wrap off at 2–5 hours; wash gently with fragrance-free soap; pat dry. Avoid: re-wrapping in plastic; scrubbing or rubbing the new spots.',
  'Days 2–3 (settling). Normal: light oozing and tenderness on the reworked spots only. Do: wash 2–3 times a day; thin ointment for 2–3 days, then lotion. Avoid: heavy ointment over the whole tattoo; tight clothes rubbing it.',
  'Days 4–10 (flaking). Normal: small flakes and itching; new spots may look cloudy. Do: thin fragrance-free lotion; let flakes fall off on their own. Avoid: picking or scratching; pools, baths, hot tubs, sun for 1–2 weeks.',
  'Weeks 2–4 (blending in). Normal: new ink blends into the rest of the tattoo as the skin settles. Do: SPF 30+ once healed; send a photo if a spot looks patchy. Avoid: any more work there for 4–6 weeks while deep skin heals.',
  'Touch-up policy: free within 1–3 months of your session, once healed (no sooner than 4–6 weeks). Hands, fingers, feet and face not included. Fading from sun or skipped aftercare is charged.',
  'Good to know: thin spots most often come from picking or sun; your touch-up is noted on your original record; no antibiotic creams unless a doctor prescribes them; hands, feet and fingers fade fastest, even with care; fragrance-free products only until healed; change sheets tonight and wear loose, clean clothes.',
  'Clean hands: before every touch. Thin layers: a little goes a long way. Hands off: let flakes fall off. Shade it: no sun, then SPF for life.',
  INFECT,E911,CALL]},
 {id:'g-tt-second-skin',icon:'🩹',title:'Your second-skin aftercare',cat:'Aftercare',profs:P,tips:[
  'Your tattoo is sealed under a clear, breathable adhesive film. It protects the skin as it heals, so there is less to do, but the timing matters.',
  'Piece 1 (8–24 hours). Normal: plasma and ink collect in a pocket under the film; it can look dark or messy. Do: leave it on; remove at 8–24 hours under warm water; wash, pat dry. Avoid: poking or draining the pocket; re-sticking an edge that has lifted.',
  'Piece 2 (up to day 5–6). Normal: far less fluid; skin may look cloudy or flaky under the film. Do: when skin is fully air-dry, apply piece 2 as shown; smooth the edges. Avoid: applying to damp skin or over ointment; baths or pools.',
  'Film off (day 5–6). Normal: edges lift and the skin under it looks dull, dry and peeling. Do: remove under warm water (see below); wash, pat dry, then thin lotion. Avoid: film on for more than 7 days in total; ripping it off dry.',
  'Weeks 2–4 (finish healing). Normal: light flaking and itching as the last layers heal. Do: thin fragrance-free lotion; SPF 30+ once fully healed. Avoid: picking, pools, baths, hot tubs and sun for 2–4 weeks.',
  'Taking it off: in a warm shower, let water run over it for a few minutes. Lift an edge and peel slowly back over itself, low to the skin, in the direction of hair growth. Never rip it off.',
  "Good to know: the fluid pocket is normal, not infection; ink in the fluid is normal, not lost color; film off early? Switch to wash-and-lotion care; showers are fine, don't soak or swim with film on; body hair can make removal sting, go slowly; wash your hands before touching the film or skin.",
  "Leave it: don't poke the pocket. Dry skin: piece 2 on dry skin only. Warm water: peel off in the shower. 7 days max: never longer in total.",
  'Take the film off, wash and text me if you notice: rash, itching or redness around the film edges; fluid leaking out or spreading past the edge; small blisters or bumps under the adhesive; redness or swelling spreading after day 3. Pus, red streaks, heat, fever or chills: please see your doctor.',
  E911,CALL]},
 {id:'g-tt-prep',icon:'📅',title:'Before your tattoo appointment',cat:'Pre-care',profs:P,tips:[
  'For every style, size and session. A little prep helps you sit comfortably, heal well and love your tattoo for years.',
  "1 week before: took Accutane in the last 6–12 months? Tell me before you book. Keep the area out of the sun; sunburned skin can't be tattooed. Moisturize the area daily so your skin is soft. On blood thinners? Ask your doctor first. Never stop a medication on your own.",
  "48 hours before: no alcohol for 24–48 hours. It thins your blood, and I can't tattoo anyone who has been drinking. Sleep well and drink plenty of water. No need to shave; I'll use a fresh single-use razor. Check the area for cuts, rash or anything new.",
  'Day of your appointment: bring photo ID. You must be 18 or older. Eat a full meal 2–3 hours before, and bring a snack and a drink. Wear loose clothes that give easy access to the area. Numbing cream only with my OK; tell me exactly what you used.',
  'Your design: final design is approved before the stencil goes on; words and names, we check spelling together and you initial it; size or placement changes on the day may change time and price.',
  'Long sessions: large or color work, 3–4 weeks between sessions; breaks are fine, tell me if you feel faint or dizzy; bring a charger, headphones and layers; one guest in the work area.',
  'Cover-ups & touch-ups: cover-up, bring a photo of the old tattoo, laser fading may come first; touch-up, wait until fully healed, at least 4–6 weeks; tell me how you cared for it while it healed.',
  "Please text to reschedule if you have: a sunburn, rash, cut or infection at the site; an eczema or psoriasis flare at the site; started Accutane or a blood thinner; a fever, cold or flu, or feel unwell; found out you're pregnant or breastfeeding; a cold sore, if we're working near your lips. I ask for 48–72 hours' notice to keep your deposit. Health or safety? Just text and we'll find a new time together.",
  "Important: pregnant or breastfeeding? We'll postpone to keep infection risk away from you and your baby. Tell me and I'll hold your design and deposit, per studio policy, until you're ready.",CALL]},
 {id:'g-tt-guide',icon:'🧴',title:'Your tattoo healing guide',cat:'Aftercare',profs:P,tips:[
  "For the first few weeks your tattoo is a healing wound. Here's what to expect at each stage, how to care for it and when to see a doctor.",
  'First 24 hours (wrap, wash, rest). Wrap off: plastic wrap off after 2–5 hours, or follow your film plan. First wash: clean hands, lukewarm water, fragrance-free soap; rinse gently. Pat dry: use a clean paper towel, then let it air-dry. Sleep: clean sheets and loose clothes; a little ink on the sheets is normal.',
  'Daily care (until fully healed). Wash: 2–3 times a day; keep a hard shower stream off it. Ointment: a thin layer for 3–4 days; it should never look wet or shiny. Lotion: then fragrance-free lotion 2–3 times a day until healed. Clothing: loose and clean; tight straps and waistbands rub.',
  'Protect (for 2–4 weeks). No soaking: no baths, pools, hot tubs, sea, lakes or saunas. Sun: keep it covered and out of direct sun; no tanning beds. Hands off: no picking, scratching or slapping; let flakes fall off. Workouts: skip gym sessions that stretch or rub it for 48 hours.',
  'Oozing is normal: clear fluid and a little ink for the first 1–2 days. No antibiotic creams: unless a doctor prescribes them; they can irritate. Once healed: SPF 30+ every day keeps lines crisp.',
  "Days 1–3: red, warm, swollen and tender, with some oozing. Days 4–14: flaking, peeling and itching; don't pick or scratch. Weeks 2–4: the surface closes; it may look cloudy or shiny. Months 1–3: deeper skin heals and color settles; big pieces take longer.",
  'This is normal: redness and swelling for 2–3 days; clear or ink-tinged oozing early on; itching, flaking and light scabbing; a milky, cloudy look as new skin forms; lines that puff up in heat for a few weeks; small patchy spots a touch-up can fix.',
  'See a doctor if you notice: redness or swelling that spreads after day 3; red streaks, heat or throbbing pain; yellow or green pus, or a bad smell; fever or chills; a rash, hives or itchy bumps in one color; hard lumps that last more than a week.',
  'Call 911 for trouble breathing or a swollen face or throat. Seen a doctor? Please tell me too, so I can note the ink lot. MRI scan? Rare tingling or burning can happen. Tell your radiologist about your tattoos.',CALL]},
];
// sanity: no brackets left, no card-on-file question, no "email photos", no em dashes
const all=JSON.stringify(forms)+JSON.stringify(guides);
const left=all.match(/\[[A-Za-z$0-9_ ][^\]]{0,40}\]/g);
if(left){console.error('PLACEHOLDERS LEFT:',left);process.exit(1);}
const strs=[];(function walk(v){if(typeof v==='string')strs.push(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk);})([forms,guides]);
if(strs.some(x=>/[\[\]]/.test(x))){console.error('BRACKET LEFT',strs.filter(x=>/[\[\]]/.test(x)));process.exit(1);}
if(/card on file|card saved|credit card|booking system|card \+3/i.test(all)){console.error('CARD-ON-FILE TEXT LEFT');process.exit(1);}
if(/email (me |us )?(your )?photos/i.test(all)){console.error('EMAIL-PHOTOS TEXT LEFT');process.exit(1);}
if(/\btick/i.test(JSON.stringify(forms))){console.error('"TICK" IN CLIENT WORDING');process.exit(1);}
if(/—/.test(all)){console.error('EM DASH LEFT');process.exit(1);}
if(/your business name|\{website\}|website\]|\$__|\bID number\b|last 4|license #/i.test(all)){console.error('BUSINESS/ARTIST PLACEHOLDER LEFT');process.exit(1);}
if(/_{2,}/.test(all)){console.error('BLANK LINE LEFT');process.exit(1);}
Object.keys(forms).forEach(k=>{if(!/^tt-/.test(k))throw new Error('bad form id '+k);const ids=forms[k].qs.map(q=>q.id);if(new Set(ids).size!==ids.length)throw new Error('dup q id '+k);
  forms[k].qs.forEach(q=>{if((q.type==='Single select'||q.type==='Multiple choice')&&!(q.options&&q.options.length>1))throw new Error('options '+q.id);if(q.type==='Contraindications'&&!(q.items&&q.items.length))throw new Error('items '+q.id);});
  if(!forms[k].qs.some(q=>q.type==='Signature'))throw new Error('no signature '+k);});
guides.forEach(g=>{if(!/^g-tt-/.test(g.id))throw new Error('bad guide id '+g.id);if(JSON.stringify(g.profs)!=='["tattoo"]')throw new Error('profs '+g.id);});
if(new Set(guides.map(g=>g.id)).size!==guides.length)throw new Error('dup guide id');
process.stdout.write('const TT_FORMS='+JSON.stringify(forms,null,0).replace(/\},"tt-/g,'},\n"tt-')+';\nconst TT_GUIDES='+JSON.stringify(guides).replace(/\},\{"id"/g,'},\n{"id"')+';\n');
console.error('forms',Object.keys(forms).length,'questions',Object.values(forms).reduce((a,f)=>a+f.qs.length,0),'guides',guides.length);
