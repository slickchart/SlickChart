// The Nail Artist Collection (Ashley, 2026-10-19) -> app forms + guides, written from her PDF text.
// Same rules as the other collections (CLAUDE.md §1e): placeholders resolved to the PDF's own defaults
// so clients never see brackets; business name/phone become {business}/{phone|...}; nail-tech-only
// boxes (office use, products used, reaction record, plan going forward, tech signatures) stay on the
// printable record; no card-on-file question.
//   node scratchpad/na/gen-na.cjs > scratchpad/na/na-data.js
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
    risks:(items,note)=>add('POSSIBLE RISKS AND SIDE EFFECTS. '+items.join('; ')+'.'+(note?' '+note:'')+' I understand these risks.','Yes / No',true),
    name:()=>add('Client name','Short text',true), dob:()=>add('Date of birth','Date',false),
    sig:(l)=>add(l||'I confirm the information above is accurate','Signature',true),
  };
  build(h);forms[id]={name,qs};
}
const SHAPES=['Square','Squoval','Round','Oval','Almond','Coffin','Stiletto'];

form('na-intake','Nail client intake',h=>{
  h.st('Full name',true);h.dob();h.st('Mobile phone');h.st('Email');h.st('Address');
  h.st('Emergency contact & relationship');h.st('Their phone');h.st('How did you hear about us?');
  h.ss('Best way to reach you',['Text','Email','Call']);h.yn('OK to text you reminders?');
  h.mc('Which services are you booking? Check all that apply',['Gel polish manicure','Builder gel overlay','Acrylic full set','Acrylic fill','Gel extensions','Dip powder','Spa pedicure','Gel pedicure','Natural manicure','Nail art','Removal only','Repair or fix'],true);
  h.lt('What would you love your nails to look and feel like? Anything you want to avoid?');
  h.ss('Length you like',['Short','Medium','Long','Extra long']);
  h.ss('Shape you like',SHAPES);
  h.st('How often you get your nails done');h.st('Event coming up? Date');
  h.ci('Your nail history. Products, habits and past reactions all change which nail system will suit you and how long it lasts. Check anything that applies to you.',[
    'Gel polish','Builder gel or hard gel','Acrylic','Dip powder','Press-ons or nail glue',
    'Gel extensions or soft gel tips','Nails lifting or popping off','Thin nails after removal','Biting or picking nails or cuticles','Hands in water a lot at work']);
  h.lt('When, and any notes about your nail history');
  h.st('Reacted to gel, acrylic, dip or nail glue before? If yes, describe');
  h.st('Product on your nails now & where done');h.st('How long your nails usually last');
  h.mc('Do you often',['Type a lot','Clean or do dishes','Garden','Play sports or lift','Play music']);
  h.st('Your job, sports or hobbies');
  h.mc('Are you allergic or sensitive to any of these? Check all that apply',['Acrylates (gel, acrylic, dip)','Nail glue or adhesives','Latex','Fragrance','Nickel or other metals','Acetone or removers','Dental or medical acrylic','Lotions or skin products','None that I know of']);
  h.st('Reaction you had, and to what');
  h.ci('Health & nail health. Some answers mean a gentler service or your doctor\'s OK first. Answers stay confidential. Check anything that applies to you.',[
    'Diabetes','Poor circulation or neuropathy','Blood thinners','Pregnant or breastfeeding','Chemo or immune suppression','Skin cancer, now or in the past',
    'Eczema or psoriasis on hands or feet','Nail or foot fungus now','Warts on hands or feet','Nail injury in the past 3 months','Medicine that makes skin sun-sensitive','Any other medical condition']);
  h.lt('All medications you take, including prescriptions and supplements');
  h.yn('Before a pedicure: shaved, waxed or used hair removal cream on your legs in the last 48 hours?');
  h.yn('Cuts, scratches, bug bites or open sores on your feet or legs?');
  h.yn('Ingrown toenails, corns or foot pain we should know about?');
  h.init('My answers are true and complete. I\'ll tell you if my health, medications or nail history change.',
    'Results and wear time depend on my natural nails, lifestyle and home care. No exact result is promised.',
    'Nail product allergies can start at any time, even after years of safe use. I\'ll report any itching or redness.',
    'I\'ll follow my aftercare, come in for lifting or breaks, and have enhancements removed by a professional.',
    'I am 18 or older, or a parent or guardian signs for me per our policy.');
  h.yn('YOUR PRIVACY. Your information is kept confidential, stored securely and used only to provide your services. It is never shared without your written consent unless the law requires it. Records are kept 7 years. I have read this.',true);
  h.sig();
});

form('na-consult','Consultation & design plan',h=>{
  h.name();h.st('Nail tech');
  h.ss('Nail plate',['Healthy','Dry','Damaged']);h.ss('Cuticles',['Neat','Dry','Overgrown']);
  h.ss('Thickness',['Thin','Medium','Thick']);h.ss('Nail bed',['Short','Medium','Long']);
  h.ss('Flexibility',['Bendy','Medium','Rigid']);h.ss('Damage',['None','Lifting','Thin']);
  h.ss('Shape',SHAPES);h.ss('Length',['Short','Medium','Long','XL']);
  h.ss('System',['Gel polish','Builder gel','Soft gel tips','Hard gel','Acrylic','Dip']);
  h.lt('Design plan & nail art map: art, accent nails, colors and finishes on each nail, thumb to pinky (left hand and right hand)');
  h.lt('Colors, finish & inspiration');h.lt('Likes & dislikes');
  h.st('Services booked');h.st('Time');h.st('Quote');
  h.st('Fill every (weeks)');h.st('Removal plan');h.st('Home care');
  h.yn('CLIENT APPROVAL. I reviewed this design plan and quote with my nail tech. Wear time depends on my nails, lifestyle and home care. The price may change if the design or length changes on the day.',true);
  h.mc('Before we start',['Before photos taken','Health form reviewed','Inspiration photos saved']);
  h.sig('Client signature');
});

form('na-service-consent','Nail service consent',h=>{
  h.name();h.dob();h.lt('Nail service(s) I\'m consenting to',true);
  h.about('ABOUT NAIL SERVICES',[['What this covers','Manicures, pedicures, gel polish, builder gel, acrylic, gel extensions, dip powder and nail art.'],['How it\'s done','Light filing, products containing acrylates, LED/UV lamp curing, and e-file where used.'],['Removal','Soaked off with acetone or filed off by a professional. Never pried, picked or peeled.']]);
  h.risks(['Allergic reaction: itching, redness, swelling or blisters near nails or face, which can be permanent','Skin irritation: dryness or redness from products, filing or acetone, usually short-lived','Nail thinning: from filing, e-file work, or product picked, peeled or removed improperly','Lifting and infection: lifted product can trap moisture and lead to infection if it isn\'t fixed','UV exposure: lamp curing exposes hands to UV light, and SPF or UV-protective gloves are offered','Future medical care: an acrylate allergy can affect dental work, joint replacements and other medical acrylates','Nicks or tenderness: cuticle care and e-file work can leave minor nicks or soreness','Breaks and wear: nails can chip, crack or break, most often when used as tools','Staining: dark or bright shades can leave light staining on the natural nail','Odors and fumes: acrylic liquid and acetone have strong odors, so tell me if they bother you'],
    'Results depend on your nails, health and aftercare. Diabetic, pregnant, on blood thinners or have eczema? Tell me. UV note: broad-spectrum SPF 30+ (applied 20 minutes before) or UV-protective fingerless gloves are offered.');
  h.init('I\'ve read the risks above and had my questions answered. No result or wear time was promised.',
    'My health information is true and complete, including past reactions to nail or dental products.',
    'I\'ll tell my nail artist right away about itching, burning, redness or swelling, during or after my service.',
    'No product goes over broken skin, infection or fungus; my service may be changed or rescheduled.',
    'I won\'t pick, peel or bite off product, and I\'ll book a removal or fix instead of gluing at home.',
    'I\'ll follow aftercare and contact you, and a healthcare provider, if a reaction or infection appears.');
  h.ss('Photos of my hands or feet, with no face shown, for my records and portfolio',['I agree','I do not agree'],true);
  h.init('I release {business} from claims from details I withheld or aftercare I skipped, as state law allows.',
    'I am 18 or older (or my guardian signs below), not under the influence, and signing of my own free will.');
  h.st('Parent or guardian name and relationship (if under 18)');
  h.sig();
});

form('na-allergy','Allergy & reaction record',h=>{
  h.name();h.st('Phone');h.st('Known allergies');h.st('Dermatologist · clinic');
  h.yn('WHY ACRYLATE ALLERGY MATTERS. Gel, acrylic, dip and nail glue contain acrylates. An allergy can develop after years of safe use, usually when uncured product touches skin, and once it starts it is lifelong. It can also affect future dental work and medical devices. Nail techs do not do acrylate patch tests: patch testing is done by a dermatologist. I have read this.',true);
  h.yn('Ever reacted to gel, acrylic, dip or nail glue?');
  h.yn('Itching, redness or swelling after a past nail service?');
  h.yn('Reacted to dental work, dentures or lash glue?');
  h.yn('Diagnosed with an acrylate allergy by a dermatologist?');
  h.lt('Details: where, when, what happened');
  h.yn('I\'ve shared my allergy history honestly. I\'ll report any itching, redness or swelling, and call 911 for trouble breathing.',true);
  h.sig();
});

form('na-photo','Before & after photo release',h=>{
  h.name();h.st('Phone or email');
  h.yn('Clinical record: before and after photos in my private file to record my nails, products and results. Never shared.',true);
  h.yn('Portfolio, before and after: shown on your website, in print or in a nail art portfolio book to show your work.');
  h.yn('Social media: posted on your business social accounts, including short videos and reels.');
  h.ss('How much of me may be shown (if yes to portfolio or social). Only hands or feet are shown. You may see any image first.',['Crop out jewelry & tattoos','Jewelry may show','Jewelry & tattoos may show']);
  h.yn('Tag me, name me or quote me: you may tag my social handle, use my first name, or quote my review with my photos.');
  h.st('Name or handle to use (if yes above)');h.st('Limits (areas, platforms, dates)');
  h.yn('HOW YOUR PHOTOS ARE HANDLED. Your face is never shown without your written OK. Tell us any time if you\'d rather not be filmed during your service. Storage: kept on a business device in our secure app, never a personal camera roll, for 7 years. Changing your mind: text or email to withdraw; posts I control come down within 7 days; others\' shares may be out of reach. No payment: this release is voluntary; you won\'t receive payment, royalties or free services for photos or reviews. Honest images: no filters or color-changing edits to your nails; same lighting and angle for before and after. Saying no never affects your care, and you can change your mind any time. I have read this.',true);
  h.sig('By signing, I confirm my choices above. This release stays in effect until I change or withdraw it in writing.');
});

form('na-policy','Booking, fix & cancellation policy',h=>{
  h.name();h.date('Appointment date');
  h.yn('BOOKING POLICY. Your appointment is reserved just for you, and full sets, nail art and pedicures can take 1–3 hours. Deposit: $20 or 30% for full sets, extensions and nail art; non-refundable and applied to your total. Notice to change: 24 hours, to move your appointment and keep your deposit. Grace period: 10 minutes; after that, we may need to shorten or reschedule. Rescheduling: with 24 hours\' notice, your deposit moves once; a second change needs a new deposit. No-show and late change: your deposit is forfeited; after 2 no-shows, a full prepayment is needed to book. Late arrival: after 10 minutes we may shorten your service, simplify the design or reschedule. I have read this.',true);
  h.yn('FIXES & YOUR VISIT. Fixes and repairs: lifting or a break within 7 days? We fix it free when it\'s a service issue; damage from picking or using nails as tools is $5 per nail. Nail art: priced by detail and time; share inspiration when you book so we can quote. Design changes: changing the design, length or service on the day may change the price and time, or need a new appointment. Removing other work: removing another salon\'s work is $15; tell us when you book so we allow time. Come prepared: arrive with clean, bare nails unless removal is booked; skip shaving or waxing your legs for 48 hours before a pedicure. Feeling unwell? Infection, a red or swollen nail fold, open cuts or a rash on your hands or feet? We\'ll reschedule with no fee; we never work on broken skin. Refunds: services can\'t be refunded once performed; service issues are fixed within the fix window. Please ask before bringing guests or children. I have read this.',true);
  h.init('My deposit is non-refundable, and the price may change if my design, length or service changes.',
    'Fixes must be requested within 7 days. Damage from misuse is charged as above.');
  h.sig('By signing, I confirm I\'ve read and agree to this policy, including the non-refundable deposit and fix window.');
});

// The six service consents share one shape, as on the printable pages.
function consent(id,name,{tech,what,service,serviceAfter,risks,note,extrasBefore,checksLabel,checks,extras,inits,consentTo}){
  form(id,name,h=>{
    h.name();h.st(tech||'Nail tech');
    h.about('ABOUT THIS SERVICE',what);
    if(service&&!serviceAfter)h.mc('Today\'s service',service,true);
    h.risks(risks,note);
    (extrasBefore||[]).forEach(x=>x(h));
    h.ci(checksLabel||'Quick health and nail check: check anything that applies to you.',checks);
    h.lt('If you checked anything, tell us more');
    if(service&&serviceAfter)h.mc('Today\'s service',service,true);
    (extras||[]).forEach(x=>x(h));
    h.init(...inits);
    h.sig(consentTo);
  });
}
const AGE='By signing, I confirm I am 18 or older with photo ID (or have parent or guardian consent per our policy and local law), have read this form, had my questions answered, and consent to ';
const AGE18='By signing, I confirm I am 18 or older (or have parent or guardian consent per our policy and local law), have read this form, had my questions answered, and consent to ';
const PHOTO_REQ='Before and after photos for my private record are required. Social media use only with my separate OK.';
const PHOTO_OK='Before and after photos for my private record are OK. Social media use only with my separate OK.';
consent('na-gel-consent','Gel polish & builder gel consent',{
  what:[['What it is','Soak-off gel polish, or a builder gel overlay to strengthen natural nails, cured under an LED or UV lamp.'],['What to expect','About 60–90 minutes: gentle prep, thin coats, a short cure per layer. It should never hurt.'],['How long it lasts','Gel polish about 2–3 weeks. Builder gel infills every 3–4 weeks. Removal is a professional soak-off.']],
  service:['Gel polish','Gel toes','Builder gel','Builder infill','Soak-off','Nail art'],
  risks:['Allergy to acrylates in gel, even after years of use','Irritation or tenderness of the skin around the nail','Thinning or peeling from picking or peeling gel off','A brief heat spike in the lamp while gel cures','Itching, redness or blisters near nails, face or eyelids','Lifting or chipping, especially if nails are used as tools','Infection if lifting is ignored and water gets trapped','UV exposure to the backs of your hands from the lamp'],
  checks:['Fungus on nails or skin','Eczema or psoriasis on hands','Lifting, dark streak, nail change','Blood thinners or chemo','Red, swollen or sore nail fold','Past reaction to gel or acrylic','Recent nail injury','Light-sensitizing medication','Cuts, broken skin or warts','Acrylate allergy (dental, medical)','Diabetes or poor circulation','Pregnant or breastfeeding'],
  extras:[h=>h.ss('ABOUT UV AND LED LAMPS. Lamps cure gel with UV light. Skin cancer risk isn\'t proven, but SPF 30+ (20 minutes before) or UV-protective fingerless gloves are yours to use.',['SPF or gloves, please','No thanks'],true)],
  inits:['I\'ve shared my full health, medication and nail history, including past reactions to gel, acrylic or nail glue.','I understand the risks above. Wear time depends on my nails, lifestyle and home care, and isn\'t guaranteed.','I\'ll tell my nail tech right away if I feel burning or heat in the lamp, or stinging on my skin.','If I get itching, redness, swelling or blisters, I\'ll stop gel services and see a doctor or dermatologist.','I won\'t pick, peel or bite my gel. Removal is a professional soak-off; peeling pulls off layers of nail.','I\'ll book a fix for any lifting within 5–7 days rather than gluing, clipping or soaking it at home.',PHOTO_REQ,'Fees follow {business} policy. Fix requests within 5–7 days; no refunds after service.'],
  consentTo:AGE+'the gel service I checked above.'});
consent('na-acrylic-consent','Acrylic nails consent',{
  what:[['What it is','Liquid and powder blended into a bead and sculpted over your nail or a tip for length and strength.'],['What to expect','About 1.5–2.5 hours for a full set, 60–90 minutes for a fill. There is a strong odor; we ventilate.'],['How long it lasts','Acrylic grows out with your nail. Fills every 2–3 weeks; removal is an acetone soak, never prying.']],
  service:['Full set','Fill','Overlay','Tips','Sculpted on forms','Soak-off removal'],
  risks:['Allergy to acrylates in the liquid, even after years of use','Eye, nose or throat irritation or headache from odor','Nail thinning from picking, prying or improper removal','Soreness or pressure for a day after a new set','Itching, redness or blisters near nails, face or eyelids','Lifting, cracks or breaks, especially at long lengths','Infection if lifting is ignored and moisture is trapped','UV lamp exposure with gel top coat; SPF offered'],
  extrasBefore:[h=>h.yn('ABOUT MONOMER ODOR AND VENTILATION. We use MMA-free, EMA-based liquid and table ventilation; its safety sheet is yours to read. Pregnant, asthma or fume-sensitive? Ask your doctor first. I have read this.',true)],
  checks:['Fungus on nails or skin','Eczema or psoriasis on hands','Lifting, dark streak, nail change','Asthma or sensitive to fumes','Red, swollen or sore nail fold','Past reaction to acrylic or gel','Diabetes or poor circulation','Pregnant or breastfeeding','Cuts, broken skin or warts','Acrylate allergy (dental, medical)','Blood thinners or chemo','Enhancements from another salon'],
  inits:['I\'ve shared my full health, medication and nail history honestly, including past reactions to nail products.','I understand the risks above. Wear depends on my nails, length and lifestyle, and isn\'t guaranteed.','I\'ll speak up right away if my eyes, nose or throat feel irritated, or my skin stings, burns or gets hot.','If I get itching, redness, swelling or blisters, I\'ll stop acrylic services and see a doctor or dermatologist.','I\'ll book a fix for lifting or breaks within 5–7 days. I won\'t glue, pry, clip or bite my nails at home.','Removal is an acetone soak by a professional. Removing another salon\'s enhancements costs $15.',PHOTO_REQ,'Deposits and fees follow {business} policy. Price may change with length, shape or nail art.'],
  consentTo:AGE18+'an acrylic nail service with the product named in my record.'});
consent('na-gel-ext-consent','Gel extension consent',{
  what:[['What it is','Length built with gel: soft gel tips bonded with gel adhesive, or hard or builder gel on forms.'],['What to expect','About 1.5 to 2.5 hours. Each layer cures under an LED or UV lamp. Nails may feel snug for a day.'],['How long it lasts','Fill or rebalance every 3–4 weeks. Soft gel soaks off; hard gel is filed off by your nail tech.']],
  service:['Soft gel tips','Hard gel on forms','Builder gel','Fill / rebalance','Removal'],serviceAfter:true,
  risks:['Allergy to (meth)acrylates, which is lifelong','Lifting, which can trap water and invite infection','Breaks or cracks, more likely with extra length','Sensitivity to glue (cyanoacrylate), if used','Redness, itching or irritation around the nail','Nail thinning from peeling or improper removal','Brief heat or warmth as gel cures','Infection if lifts or breaks aren\'t fixed promptly'],
  note:'An acrylate allergy can also affect future dental, joint and medical treatments that use acrylates.',
  checks:['Nail or skin fungus','Eczema or psoriasis on hands','Recent nail injury','Blood thinners or chemo','Pregnant or breastfeeding','Red, swollen or sore nail folds','Past reaction to gel or acrylic','Dark streak or nail changes','Immune suppression','Very thin or bitten nails','Cuts, warts or broken skin','Allergy to glue or adhesives','Diabetes or poor circulation','Photosensitizing medication','Hands often in water at work'],
  inits:['I\'ve shared my full health and nail history honestly, including any past reaction to nail products.','I understand the risks above, including acrylate allergy, which can develop at any time and is lifelong.','I\'ll tell my nail tech right away about heat, burning, itching or pain, during the service or after it.','We agreed on length and shape. Longer nails break more easily, and breaks from misuse aren\'t covered.','I\'ll follow my aftercare and book fills on time. I\'ll come in for lifts or breaks, not glue them at home.','I won\'t pry, peel or bite off my extensions. Removal is by a professional only.','Fixes within 5–7 days are free for service issues; damage from misuse is charged per our policy.',PHOTO_OK],
  consentTo:AGE18+'the gel extension service I checked above and future fills.'});
consent('na-dip-consent','Dip powder consent',{
  what:[['What it is','Colored powder layered over a bonding base, then hardened with an activator. No lamp is needed.'],['What to expect','About 60 to 90 minutes, including filing and shaping. Nails may feel a little thicker at first.'],['How long it lasts','Wears about 3–4 weeks. Removal is a light file-off and acetone soak, never peeling.']],
  service:['Full set','Full set with tips','French / ombre','Removal'],
  risks:['Allergy to the cyanoacrylate base or activator','Lifting, which can trap water and invite infection','Dry or brittle nails after acetone removal','Stinging if activator touches broken skin','Redness, itching or irritation around the nail','Nail thinning from peeling or improper removal','Chips or breaks, more likely with extra length','Infection if lifts or breaks aren\'t fixed promptly'],
  checks:['Nail or skin fungus','Eczema or psoriasis on hands','Recent nail injury','Blood thinners or chemo','Red, swollen or sore nail folds','Past reaction to dip or glue','Dark streak or nail changes','Pregnant or breastfeeding','Cuts, warts or broken skin','Allergy to acrylates or gel','Diabetes or poor circulation','Asthma or sensitive to fumes'],
  extras:[h=>h.yn('ABOUT HYGIENE. Your fingers never go into a shared jar. Powder is poured over each nail or taken from a fresh single-use portion, and leftovers are thrown away. I have read this.',true)],
  inits:['I\'ve shared my full health and nail history honestly, including any reaction to glue or nail products.','I understand the risks above. Results depend on my natural nails and care, and wear isn\'t guaranteed.','I\'ll tell my nail tech right away about burning, stinging or itching at any point during the service.','We agreed on length and shape. Longer nails chip more easily, and breaks from misuse aren\'t covered.','I\'ll book removal or a new set on time, and won\'t peel, pick or bite off my dip. Removal is professional only.','I\'ll follow my aftercare, including cuticle oil, gloves for chores, and coming in for any lifting.',PHOTO_OK,'Fees follow {business} policy. Fixes within 5–7 days; no refunds after service.'],
  consentTo:AGE18+'the dip powder service I checked above.'});
consent('na-pedicure-consent','Pedicure consent',{
  tech:'Nail artist',
  what:[['What it is','A warm soak, nail shaping, gentle cuticle and callus care, massage, then polish or gel.'],['What to expect','About 45–75 minutes. Your foot spa is cleaned and disinfected before you sit down.'],['How long it lasts','Polish about 1–2 weeks, gel toes about 3–4 weeks. Book every 4–6 weeks.']],
  service:['Spa pedicure','Gel toes','Gel removal','Nail art','Other'],
  risks:['Minor nicks or tenderness around the nail folds','Redness or irritation from soaks, scrubs or lotion','Tender soles if callus is reduced too far','Thinned toenails if gel is peeled off at home','Infection if skin is broken, cut or not yet healed','Allergic reaction to polish, gel or another product','Soreness at an ingrown or curved nail edge','Slipping on lotioned feet or a wet floor'],
  extrasBefore:[h=>h.ss('Diabetes, neuropathy or poor circulation? Please bring your physician\'s OK. I\'ll use lukewarm water, skip all cutting and smooth calluses gently with a file only.',['Doesn\'t apply to me','Physician OK on file'],true)],
  checksLabel:'Quick health and foot check: check anything that applies to you.',
  checks:['Diabetes','Blood thinners','Cuts, scratches or bug bites','Ingrown or infected toenail','Legs shaved or waxed in 48 hrs','Neuropathy or numb feet','Chemo or immune suppression','Open sores or warts','Eczema or psoriasis on feet','Allergy to gel or acrylates','Poor circulation','Pregnant','Athlete\'s foot or nail fungus','Swollen feet or ankles','Recent foot surgery or injury'],
  inits:['I\'ve shared my full health history honestly, including diabetes, circulation and medications.','I haven\'t shaved, waxed or used hair removal cream on my legs in the last 24–48 hours.','I\'ll reschedule if I have cuts, bites, sores, fungus or any infection on my feet or legs.','I understand calluses are smoothed gently with a file. No blades are used on my skin.','I\'ll speak up right away if the water feels too hot, or anything stings, pinches or hurts.','I\'ll walk carefully afterward. Lotion and oil can make my feet and the floor slippery.',PHOTO_OK,'Deposits and fees follow {business} policy. Gel toes are soaked off, never peeled.'],
  consentTo:AGE18+'a pedicure and the services checked above.'});
consent('na-manicure-consent','Manicure & e-file consent',{
  tech:'Nail artist',
  what:[['What it is','Nail shaping, cuticle care and your choice of finish. An e-file may be used to refine cuticles.'],['What to expect','About 30–60 minutes. A dry, no-soak manicure uses an e-file instead of a soak.'],['How long it lasts','Neat cuticles last about 2–3 weeks and polish about 5–7 days. Book every 2–4 weeks.']],
  service:['Natural manicure','Cuticle care','E-file (dry) manicure','Polish'],serviceAfter:true,
  risks:['Small nicks or tenderness at the cuticle line','Infection if skin is broken and not kept clean','Brief warmth or vibration from the e-file','Allergic reaction to an oil, lotion or polish','Redness or a sore nail fold for a day or two','Thin or heat-sensitive nails if overfiled','Hangnails if cuticles are then cut at home','Results vary with thick or very dry cuticles'],
  note:'Only loose, non-living cuticle is removed; living skin is never cut. Rules on cutting vary by state.',
  checks:['Diabetes','Chemo or immune suppression','Red, swollen or sore nail fold','Lifting or recent nail injury','Gel or acrylic recently removed','Blood thinners','Pregnant','Nail fungus or warts','Dark streak or nail changes','Allergy to nail products','Poor circulation, neuropathy','Cuts, hangnails or torn skin','Eczema or psoriasis on hands','Very thin or peeling nails','Bites nails or picks cuticles'],
  inits:['I\'ve shared my full health history honestly, including diabetes, blood thinners and skin conditions.','I understand only loose, non-living cuticle is removed, and living skin is never cut.','I agree to e-file use by a trained nail artist, with a disinfected bit or a new sanding band.','I\'ll speak up right away if anything feels hot, stings, pinches or hurts, so we can stop.','A small nick can happen. It will be cleaned and covered, and I\'ll watch it for signs of infection.','I\'ll follow my aftercare, use cuticle oil daily, and won\'t cut or pick my cuticles at home.','Deposits, fees and fixes follow {business} policy. Removal or repairs may cost extra.',PHOTO_OK],
  consentTo:AGE18+'a manicure, cuticle care and e-file use as checked above.'});

// ---- guides (aftercare & prep handouts) ----
const CALL='Questions? Text {phone|me} · {business}';
const P=['nail'];
const guides=[
 {id:'g-na-gel',icon:'💅',title:'Caring for your gel nails',cat:'Aftercare',profs:P,tips:[
  'Your gel is fully cured before you leave. A few easy habits keep it glossy, strong and chip-free, and keep your natural nails healthy underneath.',
  'First 24 hours (fully cured). Normal: nails feel smooth, strong and a little thicker; any tightness from prep fades quickly. Do: apply cuticle oil tonight; wear gloves for cleaning and washing dishes. Avoid: long hot soaks, hot tubs and saunas; harsh cleaners or self-tanner on bare hands.',
  'Week 1 (enjoy them). Normal: glossy, chip-free nails; a tiny gap may show at the cuticle by the end of the week. Do: cuticle oil daily and hand cream after washing; dry your nails well after water. Avoid: opening cans, scraping labels or picking at edges. Your nails are jewels, not tools.',
  'Weeks 2–3 (growing out). Normal: regrowth shows at the cuticle; free edges can wear a little at the tips. Do: smooth any snag with a fine file; book your next visit before you leave. Avoid: picking, peeling or biting gel. It pulls off layers of your natural nail with it.',
  'Fill time (next visit). Normal: gel polish is ready to soak off at 2–3 weeks; builder gel needs an infill at 3–4 weeks. Do: come in for a professional soak-off or infill; tell me about new medications or allergies. Avoid: leaving gel on for many weeks, or removing it at home by peeling, prying or clipping.',
  'Good to know: acetone-based removers can dull the shine; water trapped under lifting can lead to infection; short to medium lengths wear the longest; sunscreen and bug spray can soften top coat, so wipe off; a lifted edge? Book a fix, don\'t glue or clip it; oil keeps gel flexible, so it chips and lifts less; your nails rest best with oil and time between sets; keep a fine file handy and never use clippers on gel.',
  'Oil daily: cuticle oil keeps nails and gel flexible. Gloves on: cleaning, dishes and gardening. Hands off: no picking, peeling or biting. Pro removal: soak-off only, never pry or peel.',
  'Call me right away if you notice: itching, redness or a rash around your nails; lifting, or a gap opening under the gel; swelling or blisters on fingertips, face or eyelids; a green or dark spot under the gel.',
  'Pain, heat, throbbing or pus around a nail: see your doctor. Swelling of the face or throat, or trouble breathing: call 911.',CALL]},
 {id:'g-na-acrylic',icon:'✨',title:'Caring for your acrylic nails',cat:'Aftercare',profs:P,tips:[
  'Acrylics are strong, but your natural nail is still growing underneath. A few easy habits keep your set secure and healthy until your next fill.',
  'First 24 hours (new set). Normal: a faint product smell; new length can feel heavy or tight for a day or two. Do: apply cuticle oil tonight; wear gloves for cleaning and washing dishes. Avoid: hot tubs, saunas and harsh cleaners; using your new nails to pry or pull.',
  'Week 1 (enjoy them). Normal: strong, smooth nails; a little new growth may show at the cuticle by week\'s end. Do: cuticle oil daily; dry hands well after washing; treat nails as jewels, not tools. Avoid: opening cans, scraping, picking or biting. These cause lifting and breaks.',
  'Weeks 2–3 (growing out). Normal: a gap at the cuticle as nails grow, so the weight shifts toward the tips. Do: book your fill every 2–3 weeks; come in for a fix if any edge starts to lift. Avoid: gluing, clipping or soaking lifted spots at home. Trapped water can cause infection.',
  'Fill time (next visit). Normal: without a fill, nails get top-heavy and more likely to crack or break. Do: book a fill or a professional soak-off; tell me about new medications or allergies. Avoid: prying, peeling or biting off acrylics. It tears off layers of your natural nail.',
  'Good to know: long or pointed shapes need extra care; typing and buttons take a few days to get used to; a break? Keep the piece, file it smooth and call me; short breaks between sets let your nails rest; acetone and cleaners soften acrylic, so wear gloves; keep a fine file for snags and never use nail clippers; oil keeps acrylic flexible, so it lifts and cracks less; lifting is a fix appointment, not a home repair.',
  'Oil daily: cuticle oil morning and night. Gloves on: cleaning, dishes and gardening. Fill on time: every 2–3 weeks keeps them balanced. Never pry: removal is a professional soak.',
  'Call me right away if you notice: itching, redness or a rash around your nails; lifting, or a gap opening under the acrylic; swelling or blisters on fingertips, face or eyelids; a green or dark spot under the acrylic.',
  'Pain, heat, throbbing or pus around a nail: see your doctor. Swelling of the face or throat, or trouble breathing: call 911.',CALL]},
 {id:'g-na-gel-ext',icon:'💎',title:'Caring for gel extensions',cat:'Aftercare',profs:P,tips:[
  'Your extensions are bonded to your natural nails, so caring for one protects the other. A few simple habits keep them strong, smooth and lasting until your next fill.',
  'Day one (settling in). Normal: nails may feel snug, thicker or a little tight; that eases within a day. Do: apply cuticle oil; get used to the length; use finger pads, not tips. Avoid: very hot water, saunas and long soaks; picking at any rough edge.',
  'Daily care (every day). Normal: a small gap appears at the cuticle as your natural nail grows. Do: cuticle oil twice a day; gloves for dishes, cleaning and gardening. Avoid: using nails as tools; acetone, solvents or harsh cleaners on bare hands.',
  'Weeks 3–4 (fill time). Normal: growth shows at the base and the balance point moves toward the tip. Do: book your fill or rebalance; come in with clean hands and no lotion. Avoid: stretching past 4 weeks; clipping, filing down or gluing at home.',
  'Removal (when it\'s time). Normal: natural nails may feel softer or thinner for a few weeks after. Do: book a professional removal; soft gel soaks off, hard gel is filed off. Avoid: peeling, prying or biting them off. It strips layers of your nail.',
  'Lifting: if an edge lifts, water can get trapped underneath and invite infection. Come in within 5–7 days, and never glue it down at home. Length: longer nails need more care. Open cans and press buttons with a tool or your finger pad.',
  'Oil daily: cuticle oil keeps gel flexible and skin healthy. Wear gloves: for cleaning, dishes and anything with chemicals. Jewels, not tools: no prying lids, scraping labels or opening cans. Fix it early: lift or crack? Book a repair, don\'t glue.',
  'Call me right away if you notice: itching, redness or swelling around your nails; a green, yellow or dark spot under a nail; a rash on your fingers, eyelids, face or neck; pain, throbbing or a nail lifting from its bed. These can mean an allergy or infection. I\'ll remove the product; see your doctor or a dermatologist too.',
  'Face or throat swelling or trouble breathing: call 911.',CALL]},
 {id:'g-na-dip',icon:'🫙',title:'Caring for dip powder nails',cat:'Aftercare',profs:P,tips:[
  'Dip powder is strong and long-wearing, and a little daily care keeps it that way. These habits protect your manicure and the natural nails underneath.',
  'Day one (fully setting). Normal: nails may feel thicker or a little snug; the top coat keeps hardening for a day. Do: apply cuticle oil; get used to the feel; use your finger pads, not your nail tips. Avoid: very hot water, saunas, hot tubs and long soaks; picking at any rough edge.',
  'Weeks 1–2 (everyday wear). Normal: color stays glossy; a small gap shows at the cuticle as your natural nails grow. Do: cuticle oil twice a day; gloves for dishes, cleaning, gardening and any chemicals. Avoid: using nails as tools; acetone, solvents or harsh cleaners on bare hands.',
  'Weeks 3–4 (time for a new set). Normal: growth is visible, and edges may start to chip or lift. Do: book removal or a new set every 3–4 weeks; no lotion that day. Avoid: clipping, filing down or regluing at home, or painting over a lift.',
  'Removal (professional only). Normal: nails may feel dry or a little softer for a few days after the acetone soak. Do: professional file-off and acetone soak; cuticle oil and hand cream after. Avoid: peeling, prying or biting off dip. It strips layers of your natural nail.',
  'Good to know: cuticle oil keeps dip flexible and less likely to crack; hand sanitizer is fine, follow with cuticle oil; long baths soften dip, so dry your hands well; lifting traps water, so come in within 5–7 days; self-tanner and strong dyes can stain, so wear gloves; your powder was a single-use portion, never shared.',
  'Oil daily: morning and night, into skin and nail edges. Wear gloves: for dishes, cleaning and chemicals. Jewels, not tools: no prying lids or opening cans. Fix it early: lift or chip? Book a repair, don\'t glue.',
  'Call me right away if you notice: itching, redness or swelling around your nails; a green, yellow or dark spot under a nail; a rash or blisters on fingers, eyelids or face; pain, throbbing or a nail lifting from its bed.',
  'Swelling of the face, eyes or throat, or trouble breathing: call 911. Signs of infection or allergy: see your doctor or a dermatologist.',CALL]},
 {id:'g-na-feet',icon:'🦶',title:'Caring for your feet',cat:'Aftercare',profs:P,tips:[
  'Soft feet and pretty toes last longer with a little daily care. Here\'s what to expect and how to keep your feet healthy until your next pedicure.',
  'Today (polish setting). Normal: feet feel soft and smooth; regular polish stays soft under the surface for hours. Do: wear open-toe shoes home; walk carefully, since lotion can make feet slippery. Avoid: tight shoes and socks over fresh polish; hot tubs and long hot baths tonight.',
  'Days 1–7 (settling in). Normal: soles stay softer; slight tenderness near the cuticles can happen for a day. Do: cuticle oil on toenails daily; lotion on heels and soles, not between toes. Avoid: pools, hot tubs and lakes until any nick has healed; picking at polish.',
  'Weeks 2–4 (everyday care). Normal: calluses slowly rebuild where shoes rub; gel toes stay glossy. Do: gentle foot file on dry skin weekly; clip straight across; breathable shoes. Avoid: cutting cuticles, digging at nail corners, or razor tools on calluses.',
  '4–6 weeks (next visit). Normal: toenails grow out and a gap shows at the base of gel color. Do: book your next pedicure; tell me about health or medication changes. Avoid: peeling or prying gel off at home. It pulls off layers of your nail.',
  'Good to know: nails cut straight across are less likely to grow in; wear flip-flops in gym showers and pool areas; chipped gel? Book a fix rather than peeling it; skip shaving your legs right before your next visit; dry well between your toes after every shower; rotate shoes so each pair dries out between wears; sunscreen on the tops of your feet in summer; a thick, yellow or dark nail should be checked.',
  'Step softly: lotioned feet are slippery today. Oil daily: cuticle oil keeps toenails flexible. Keep dry: dry toes help prevent fungus. No peeling: gel toes are soaked off by me.',
  'Call me right away if you notice: redness, swelling or warmth around a nail; red streaks spreading up your foot or leg; pus, throbbing, or pain that gets worse; an itchy rash or blisters where product touched.',
  'Pus, red streaks, fever or spreading redness: please see a doctor. Diabetes or poor circulation: any cut, blister or sore on your foot, see your doctor the same day.',CALL]},
 {id:'g-na-nails',icon:'🤲',title:'Caring for your nails',cat:'Aftercare',profs:P,tips:[
  'Neat cuticles and smooth nails last longer with a little daily care. These simple habits keep your nails strong until your next visit.',
  'Today (fresh cuticles). Normal: a crisp cuticle line; skin may feel a little tender or look pink. Do: cuticle oil tonight; gloves for dishes and cleaning; let polish set fully. Avoid: hot tubs and harsh cleaners; picking at any tender spot or fresh polish.',
  'Days 1–7 (settling in). Normal: polish is fully hard after about 24 hours; skin feels smooth and soft. Do: oil cuticles daily; hand cream after washing; gloves for chores and gardening. Avoid: biting, picking or cutting cuticles; using nails to open cans or scrape labels.',
  'Weeks 2–3 (regrowth). Normal: cuticle slowly grows back; a little dryness at the edges is normal. Do: after a shower, push cuticles back gently with a towel; smooth snags with a fine file. Avoid: clippers on living skin; peeling polish off, which lifts layers of your nail.',
  '2–4 weeks (next visit). Normal: polish chips at the tips and the cuticle line softens. Do: book your next manicure; tell me about health or medication changes. Avoid: waiting too long. Dry, overgrown cuticles split into painful hangnails.',
  'Your cuticles: your cuticle seals the base of your nail against germs. Keep it soft with oil, push it back gently, and leave any trimming to me so living skin is never cut.',
  'Good to know: oil soaks in best right after washing your hands; file in one direction to avoid splitting; choose an acetone-free remover for polish; hangnail? Clip only the loose tip, never pull it; top coat every few days helps polish last; a dark streak or lifting nail should be checked.',
  'Oil daily: cuticle oil morning and night keeps skin supple. Wear gloves: dish soap and cleaners dry out nails and skin. Hands off: no biting, picking or cutting between visits. Jewels, not tools: don\'t pry, scrape or open cans with nails.',
  'Call me right away if you notice: redness, swelling or warmth around a nail; red streaks spreading from a finger; throbbing, pus, or pain that gets worse; a nick that hasn\'t healed in a few days.',
  'Pus, red streaks, fever or spreading redness: please see your doctor. Diabetes or poor circulation: any wound that is slow to heal, see your doctor the same day.',CALL]},
 {id:'g-na-prep',icon:'📅',title:'Before your nail appointment',cat:'Pre-care',profs:P,tips:[
  'For gel, acrylic, extensions, dip, manicures and pedicures. A little prep helps your nails look their best and last longer.',
  '1 week before: wearing gel, acrylic or dip? Book a removal with your service, or soak off safely at home. Start cuticle oil daily; healthy cuticles give a cleaner, longer-lasting finish. Skip cutting or filing your nails short; I\'ll shape them. Ever had itching or a rash from nail products? Tell me before you book.',
  '48 hours before: pedicure, don\'t shave, wax or use hair removal cream on your legs for 24–48 hours. Don\'t pick, peel or bite old product; it pulls off layers of your nail. Check your hands and feet for cuts, redness or anything new.',
  'Day of your appointment: come with clean, bare nails, or with your removal booked. Skip hand cream and oil that day, or wash it off first; product won\'t stick to oily nails. Bring inspiration photos for shape, length and art. Wear open-toe shoes for a pedicure.',
  'Gel & acrylic: extensions and dip too, come with bare nails, or book removal time; length or design changes on the day may change time and price; fills every 2–4 weeks keep them strong; SPF or UV gloves are available for lamp curing.',
  'Pedicure: no shaving, waxing or hair removal for 24–48 hours before; reschedule with cuts, scratches, bug bites or foot fungus; diabetes or poor circulation? Tell me first; tell me about ingrown or painful toenails; gel toes: bring open-toe shoes.',
  'Manicure & nail art: nail art is priced by design, and photos help me quote; please don\'t cut your cuticles at home first; tell me about thin, peeling or damaged nails; detailed art needs extra time, so book it ahead.',
  'Please text to reschedule if you have: redness, swelling or pus around a nail; cuts, broken skin or an eczema flare; a green or dark spot under a nail; nail fungus or athlete\'s foot; itching or a rash after a past nail service; a fever, cold or flu, or feel unwell. I ask for 24 hours\' notice. If it\'s about your health or safety, just text. We\'ll find a new time together.',
  'Pregnant? It\'s not an automatic no. Some nail products have strong odors; I use ventilation at my table, and if odors bother you, a natural manicure or regular polish is a lovely option. It\'s your choice, so tell me and we\'ll plan together.',CALL]},
 {id:'g-na-guide',icon:'🧴',title:'Your nail care guide',cat:'Aftercare',profs:P,tips:[
  'Healthy nails hold gel, acrylic and art best. Here\'s how to care for them between visits, how long each service lasts and when to call me.',
  'Daily routine (oil, moisture, gentle hands). Cuticle oil: massage into cuticles and under the free edge 1–2 times a day. Hand cream: after washing; dry skin and nail folds make product lift sooner. Dry well: pat around each nail after washing; trapped water causes lifting. Filing: natural nails only, a fine (180+) file, in one direction.',
  'Protect (water, chemicals & habits). Gloves: for dishes, cleaning and gardening; water and chemicals weaken product. Jewels, not tools: don\'t open cans, scrape labels or pry with your nails. Hands off: never pick, peel or bite product; it pulls off layers of your nail. Removers: keep acetone and polish remover off your gel or acrylic.',
  'How long it lasts, with good home care. Gel polish: 2–3 weeks; builder gel infills every 3–4 weeks. Acrylic: fills every 2–3 weeks as your nails grow. Gel extensions: a fill or new set every 3–4 weeks; hard gel is filed off, not soaked. Dip powder: 3–4 weeks, then removal and a fresh set. Pedicure: gel toes last about 4–6 weeks; regular polish 1–2.',
  'First 24 hours: skip hot tubs, saunas and long hot soaks for 24 hours. Lifting or a break? Book a fix within 5–7 days; please don\'t glue at home.',
  'Safe removal: a professional soak-off or file-off; never pry or peel. Fills on time: overdue fills strain your nail and invite lifting. Healthy nails: smooth, pink nail beds and no soreness. Ask first: trying a new product? Text me first.',
  'This is normal: mild dryness after acetone removal; a brief warm feeling in the lamp as gel cures; natural nails feeling a little thin after removal; light staining from dark or bright shades; growth showing at the cuticle after 2–3 weeks; faint white spots from bumps (they grow out).',
  'Call me if you notice: itching, redness or a rash near nails, eyelids or face; a red, swollen, painful or pus-filled nail fold; a green or dark spot under your nail or product; lifting, cracks, or a nail separating from its bed; pain or throbbing that lasts after your service; a new dark streak in a nail (see a dermatologist).',
  'Call 911 for trouble breathing or a swollen face or throat. Product in your eye? Flush 15 minutes, then get urgent care. Possible allergy? Have the product removed, see a doctor and tell me. Allergies can start after years of safe use.',CALL]},
];
// sanity: no brackets left, no card-on-file question, no "email photos"
const all=JSON.stringify(forms)+JSON.stringify(guides);
const left=all.match(/\[[A-Za-z$0-9_ ][^\]]{0,40}\]/g);
if(left){console.error('PLACEHOLDERS LEFT:',left);process.exit(1);}
if(/card on file|card saved|credit card|booking system/i.test(all)){console.error('CARD-ON-FILE TEXT LEFT');process.exit(1);}
if(/email (me |us )?(your )?photos/i.test(all)){console.error('EMAIL-PHOTOS TEXT LEFT');process.exit(1);}
if(/\btick/i.test(JSON.stringify(forms))){console.error('"TICK" IN CLIENT WORDING');process.exit(1);}
process.stdout.write('const NA_FORMS='+JSON.stringify(forms,null,0).replace(/\},"na-/g,'},\n"na-')+';\nconst NA_GUIDES='+JSON.stringify(guides).replace(/\},\{"id"/g,'},\n{"id"')+';\n');
console.error('forms',Object.keys(forms).length,'questions',Object.values(forms).reduce((a,f)=>a+f.qs.length,0),'guides',guides.length);
