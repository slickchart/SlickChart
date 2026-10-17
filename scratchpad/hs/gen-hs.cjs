// The Hair Stylist Collection (Ashley, 2026-10-17) -> app forms + guides, written from her PDF text.
// Same rules as the Esthetician and Lash & Brow Collections (CLAUDE.md §1e): placeholders resolved to
// the PDF's own defaults so clients never see brackets; business name/phone become {business}/{phone|...};
// stylist-only result boxes stay on the printable record; no card-on-file question.
//   node scratchpad/hs/gen-hs.cjs > scratchpad/hs/hs-data.js
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
const AGE='By signing, I confirm I am 18 or older with photo ID (or have parent or guardian consent per our policy and local law), have read this form, had my questions answered, and consent to ';
const AGE18='By signing, I confirm I am 18 or older (or have parent or guardian consent per our policy and local law), have read this form, had my questions answered, and consent to ';

form('hs-intake','Hair client intake',h=>{
  h.st('Full name',true);h.dob();h.st('Mobile phone');h.st('Email');h.st('Address');
  h.st('Emergency contact & relationship');h.st('Their phone');h.st('How did you hear about us?');
  h.ss('Best way to reach you',['Text','Email','Call']);h.yn('OK to text you reminders?');
  h.mc('Which services are you booking? Check all that apply',['Cut & style','Blowout / styling','All-over color','Gray coverage','Root touch-up','Highlights / balayage','Toner or gloss','Color correction','Keratin / smoothing','Perm or body wave','Relaxer','Extensions'],true);
  h.lt('What would you love your hair to look and feel like? Anything you want to avoid?');
  h.st('Your natural hair color');h.st('How often you visit a salon');h.st('Event coming up? Date');
  h.ci('Your hair history. Everything on your hair, even from years ago, changes how color and chemicals work. Please include at-home products. Check anything you have had.',[
    'Salon color (permanent or demi)','Box dye or at-home color','Henna (any kind)','Color restorer or "progressive" dye','Lightener, bleach or highlights',
    'Relaxer or texturizer','Perm or body wave','Keratin or smoothing treatment','Extensions','Semi color, toner or gloss']);
  h.lt('When was each one? (and extension type, color brand or anything else about your hair history)');
  h.st('Reacted to hair color or a chemical service before? If yes, describe');
  h.mc('Hair concerns',['Breakage','Thinning','Dryness','Frizz','Brassiness','Oily scalp','Tangles']);
  h.st('Last salon service: what & when');h.st('Products you use at home');
  h.mc('Are you allergic or sensitive to any of these? Check all that apply',['Hair dye (PPD or PTD)','Bleach or lightener','Perm or relaxer solution','Latex','Fragrance','Nickel or other metals','Shampoo or skin products','Black henna tattoo (ever)','None that I know of']);
  h.st('Reaction you had, and to what');
  h.ci('Scalp & health. Some answers mean a test, a waiting period or your doctor\'s OK first. Answers stay confidential. Check anything that applies to you.',[
    'Itchy, flaky or very sensitive scalp','Psoriasis, eczema or dermatitis on scalp','Cuts, sores, sunburn or scratches on scalp','Scalp infection, ringworm or lice now','Hair loss, thinning or alopecia',
    'Pregnant or breastfeeding','Chemotherapy or radiation, past year','Asthma or a breathing condition','Thyroid condition or big hormone changes','Any other medical condition']);
  h.lt('All medications you take, including prescriptions and supplements');
  h.ci('Used recently?',['Isotretinoin (Accutane)','Minoxidil','Blood thinners','Hormone changes']);
  h.ss('Wash hair',['Daily','2–3x wk','Weekly']);h.ss('Hot tools',['Daily','Weekly','Rarely']);
  h.ss('Swimming',['Often','Sometimes','Never']);h.ss('Styling time',['10 min','30 min','Longer']);
  h.ss('Outdoors',['A lot','Some','Little']);h.ss('Heat spray',['Always','Some','Never']);
  h.init('My answers are true and complete. I\'ll tell you if my health, medications or hair history change.',
    'Results depend on my hair\'s history, condition and porosity. No exact result is promised.',
    'Reactions to hair color and chemicals can happen at any time, even after years of safe use.',
    'I\'ll do any allergy alert or strand test asked, keep waiting periods and follow my aftercare.',
    'I am 18 or older, or a parent or guardian signs for chemical services per our policy.');
  h.yn('YOUR PRIVACY. Your information is kept confidential, stored securely and used only to provide your services. It is never shared without your written consent unless the law requires it. Records are kept 7 years. I have read this.',true);
  h.sig();
});

form('hs-consult','Consultation & service plan',h=>{
  h.name();h.st('Stylist');
  h.st('Natural level');h.st('Current level & tone');h.st('Desired level & tone');h.st('Gray %');
  h.ss('Texture',['Fine','Medium','Coarse']);h.ss('Elasticity',['Good','Fair','Poor']);
  h.ss('Density',['Thin','Medium','Thick']);h.ss('Scalp',['Normal','Dry','Oily']);
  h.ss('Porosity',['Low','Normal','High']);h.ss('Sensitive',['No','Mild','Very']);
  h.lt('Inspiration photo notes');h.lt('Likes & dislikes');
  h.lt('Placement: sections, foils, balayage or extension rows (part line, ear to ear, crown and nape)');
  h.lt('Service plan: each step with the service & technique, formula or product, and time');
  h.st('Sessions');h.st('Quote');h.st('Maintenance: return every');h.st('Home care products');
  h.yn('CLIENT APPROVAL. I reviewed this plan and quote with my stylist. My result depends on my hair\'s history and condition, big changes may take more than one visit, and the price may change if time or product differs.',true);
  h.mc('Before we start',['Before photos taken','Allergy alert test done or waived','Strand test done or N/A']);
  h.sig('Client signature');
});

form('hs-chem-consent','Chemical service consent',h=>{
  h.name();h.dob();h.lt('Chemical service(s) I\'m consenting to',true);
  h.about('ABOUT CHEMICAL SERVICES',[['What this covers','Color, lightening, toner, keratin and smoothing, perms and relaxers.'],['Products used','Color, developer, lightener, and waving, smoothing or relaxing solutions.'],['Before we start','An allergy alert test before color, and a strand test if your history calls for it.']]);
  h.risks(['Allergic reaction: itching, swelling or rash on scalp, face or neck, even after years of safe use','Scalp irritation or burn: tingling is common; burning is not; speak up right away','Breakage or damage: dry, weak or stretchy hair, most often on hair processed before','Hair history reactions: box dye, henna or metallic dyes can react with peroxide and break hair','Fumes: some products, especially smoothing ones, can irritate eyes, nose and lungs','Unexpected result: your hair\'s history and porosity can make results differ from photos','More than one visit: big changes and color correction may take several sessions','Fading and change: color fades and shifts with washing, sun, chlorine and heat','Product in the eyes: flushed with cool water; seek care if pain or blurry vision lasts','Hair loss or thinning: rare; possible with over-processing, tension or a health condition'],
    'Results depend on your hair\'s history, porosity and condition, your health and medications, and your aftercare. Pregnant, breastfeeding, or have a scalp or medical condition? Check with your physician first. Smoothing note: some smoothing products release formaldehyde when heated, even some labeled "formaldehyde-free." Ask what we use.');
  h.init('I\'ve read the risks above and had my questions answered. No specific result has been promised to me.',
    'My health and hair history are true and complete, including box dye, henna and past chemical services.',
    'I\'ve had an allergy alert test (or signed the waiver), and I agree to a strand test when recommended.',
    'I\'ll tell my stylist right away if anything burns, stings or feels wrong during the service.',
    'I approved the service plan, formula goal and price before the service started.',
    'I\'ll follow aftercare and contact you, and a healthcare provider, if signs of a reaction appear.',
    'I release {business} from claims from details I withheld or aftercare I skipped, as state law allows.',
    'I am 18 or older (or my guardian signs below), not under the influence, and signing of my own free will.');
  h.st('Parent or guardian name and relationship (if under 18)');
  h.sig();
});

form('hs-allergy-test','Allergy alert & strand test',h=>{
  h.name();h.st('Phone');h.st('Planned service');h.st('Known allergies, including any black henna tattoo');h.date('Appointment date');
  h.yn('WHY WE TEST. Most hair colors contain PPD, PTD or related dyes, and allergy can develop at any time, even after years of safe use. We test 48 hours before every color service, or as the manufacturer directs. A strand test shows how your hair lifts and holds up, and is a must if box dye, henna or "progressive" dye may be present. I have read this.',true);
  h.ss('Your choice',['I consent to these tests','I decline testing'],true);
  h.yn('IF YOU CONSENT. If the spot burns, blisters or itches badly, I\'ll rinse it and call {phone|you}. For trouble breathing or face or throat swelling, I\'ll call 911.');
  h.mc('If you decline, which test(s)?',['Allergy alert test','Strand test']);
  h.yn('IF YOU DECLINE. I was offered the test(s) checked above and chose not to have them. I understand an allergy or poor hair reaction may not be found first, and could cause swelling, breakage, an unwanted result or need for medical care. I accept these risks and release {business} from related claims as far as state law allows.');
  h.sig();
});

form('hs-photo','Before & after photo release',h=>{
  h.name();h.st('Phone or email');
  h.yn('Clinical record: before and after photos in my private file to record color, formulas and results. Never shared.',true);
  h.yn('Portfolio, before and after: shown on your website, in print or in a salon portfolio book to show your work.');
  h.yn('Social media: posted on your business social accounts, including short videos and reels.');
  h.ss('How much of me may be shown (if yes to portfolio or social). You may see any image before it is posted.',['Back of head or hair only','Side profile, face cropped','Full face visible']);
  h.yn('Testimonial, name or tag: you may quote my review, use my first name, or tag my social handle with my photos.');
  h.st('Name or handle to use (if yes above)');h.st('Limits (areas, platforms, dates)');
  h.yn('HOW YOUR PHOTOS ARE HANDLED. Storage: kept on a business device in our secure app, never a personal camera roll, for 7 years. Changing your mind: text or email to withdraw; posts we control come down within 7 days; others\' shares may be out of reach. No payment: this release is voluntary; you won\'t receive payment, royalties or free services for photos or reviews. Honest images: no filters or color-changing edits to your hair; same lighting and angle for before and after. Most hair photos can be taken from the back or side; tell us any time if you\'d rather not be filmed during your service. I have read this.',true);
  h.sig('By signing, I confirm my choices above. This release stays in effect until I change or withdraw it in writing.');
});

form('hs-policy','Salon booking policy',h=>{
  h.name();h.date('Appointment date');
  h.yn('BOOKING POLICY. Your appointment is reserved just for you, and color, chemical and extension services can take 3–6 hours. Deposit: $50 or 25% for color, chemical and extension services; non-refundable and applied to your total. Notice to change: 48 hours, to move your appointment and keep your deposit. Grace period: 15 minutes; after that, we may need to shorten or reschedule. Rescheduling: with 48 hours\' notice, your deposit moves once; a second change needs a new deposit. No-show and late change: your deposit is forfeited; after 2 no-shows, a full prepayment is needed to book. Late arrival: after 15 minutes your service may be shortened or rescheduled, and the deposit is forfeited. I have read this.',true);
  h.yn('YOUR VISIT. Come prepared: arrive with dry, detangled hair, styled as you usually wear it; skip hard scrubbing of your scalp for 24–48 hours before color, lightener, perm or relaxer. Consultation first: color correction, big color changes and extensions need a consultation before booking; an allergy alert test is done 48 hours before color. Pricing: quotes are estimates; the price may change if your hair\'s length, density, condition or time needed differs from your booking. Color adjustments: not happy with your color? Tell us within 7 days and we\'ll adjust or refresh it at no charge; fading from skipped aftercare isn\'t covered. Extension hair: hair is custom ordered for you; once ordered, hair purchases and deposits are non-refundable; removal by another salon isn\'t covered. Feeling unwell? Cold, flu, lice or a scalp infection? Tell us as soon as you can and we\'ll reschedule with no fee. Refunds: services can\'t be refunded once performed. Please ask before bringing guests or children. I have read this.',true);
  h.init('My deposit is non-refundable, and quotes may change if my hair needs more time or product.',
    'Color concerns must be raised within 7 days. Extension hair is non-refundable once ordered.');
  h.sig('By signing, I confirm I\'ve read and agree to this policy, including the non-refundable deposit and adjustment window.');
});

// The six service consents share one shape, as on the printable pages.
function consent(id,name,{what,service,risks,note,checks,extras,inits,consentTo}){
  form(id,name,h=>{
    h.name();h.st('Stylist');
    h.about('ABOUT THIS SERVICE',what);
    if(service)h.mc('Today\'s service',service,true);
    h.risks(risks,note);
    h.ci('Quick health and hair check: check anything that applies to you.',checks);
    h.lt('If you checked anything, tell us more');
    (extras||[]).forEach(x=>x(h));
    h.init(...inits);
    h.sig(consentTo);
  });
}
const PHOTO_REQ='Before and after photos for my private record are required. Social media use only with my separate OK.';
const PHOTO_OK='Before and after photos for my private record are OK. Social media use only with my separate OK.';
consent('hs-color-consent','Hair color consent',{
  what:[['What it is','Permanent or demi-permanent color to change or refresh your shade, or to blend or cover gray.'],['What to expect','About 1.5 to 3 hours. Results depend on hair history; correction may take more visits.'],['How long it lasts','Permanent color grows out; roots show in 4 to 8 weeks. Demi and gloss fade over 6–8 weeks.']],
  service:['Permanent','Demi-permanent','Gray coverage','Correction','Gloss'],
  risks:['Itching, redness or burning on the scalp','Allergic reaction to the dye, even after years of use','Staining on the hairline, ears or neck for a day or two','A shade or tone that differs from the photo you love','Uneven color from past color, box dye or porosity','Gray that is resistant and covers less fully','Dryness or a change in how your hair feels','Fading, especially red and copper tones'],
  checks:['Sores, cuts or sunburn on scalp','Scalp infection, lice or ringworm','Psoriasis or eczema flare on scalp','Past reaction to hair dye','"Black henna" tattoo, ever','Allergy: PPD, PTD or dye','Box dye, henna or metallic dye','Relaxer, perm or keratin','Isotretinoin or minoxidil','Hair loss, chemo or radiation','Pregnant or breastfeeding','Asthma or sensitive to fumes'],
  extras:[h=>h.ss('ABOUT ALLERGY ALERT TESTS. Hair dyes contain PPD, and an allergy can develop at any time. We test 48 hours before every color. Never use hair dye on lashes or brows. My test:',['Test done, no reaction','Declined, waiver signed'],true)],
  inits:['I\'ve shared my full health, medication and hair history, including box dye, henna and past chemical services.','I understand the risks above. My result depends on my hair\'s history and condition, and isn\'t guaranteed.','I\'ll tell my stylist right away if my scalp burns, stings or itches, or if anything feels unusual.','A strand test may be needed for big changes or unknown hair history, and I agree to one if advised.','Color correction may take more than one session and is priced hourly. My goal may be reached in stages.','I\'ll follow my aftercare. Washing too soon, hot water and box dye at home can change or fade my color.',PHOTO_REQ,'Fees follow {business} policy. Color concerns within 7 days; no refunds after service.'],
  consentTo:'By signing, I confirm I am 18 or older with photo ID (or have parent or guardian consent per our policy and local law), have read this form, had my questions answered, and consent to the hair color service I checked above.'});
consent('hs-lightening-consent','Lightening consent',{
  what:[['What it is','Lightener and developer remove natural or artificial pigment. A toner then sets your shade.'],['What to expect','About 2 to 5 hours. Going from dark to blonde often takes more than one session.'],['How long it lasts','Lightened hair stays light until cut. Toner fades in 4–8 weeks; regrowth shows by 8–12.']],
  service:['Foil highlights','Balayage','Global lightening','Toner','Bond builder'],
  risks:['Scalp irritation, burning or a chemical burn','Breakage, dryness or rough texture','Over-processing: gummy, stretchy or "melted" hair','Uneven lift, banding or spots','Brassy or warm tones that need toning','Allergic reaction to lightener or toner','Goal shade may need more than one visit','More porous hair that fades faster'],
  checks:['Sores, cuts or sunburn on scalp','Scalp infection, lice or ringworm','Psoriasis or eczema flare on scalp','Past reaction to hair products','"Black henna" tattoo, ever','Allergy to lightener or dye','Box dye, henna or metallic dye','Relaxer, perm or keratin','Isotretinoin or minoxidil','Hair loss, chemo or radiation','Pregnant or breastfeeding','Asthma or sensitive to fumes'],
  extras:[h=>h.ss('ABOUT LIFTING IN STAGES. Hair passes through red, orange and yellow as it lightens. Your stylist stops when your hair\'s condition says so, even before your goal. My strand test:',['Strand test done','Strand test declined'],true)],
  inits:['I\'ve shared my full health and hair history honestly, including box dye, henna, relaxers and keratin.','I understand the risks above. My result depends on my hair\'s history and condition, and isn\'t guaranteed.','I\'ll tell my stylist right away if my scalp burns, stings or itches at any point during the service.','Big changes, like dark to blonde, may take 2–3 or more sessions spaced 4–8 weeks apart.','I had an allergy alert test for any toner or color, or declined it and signed the waiver.','I\'ll follow my aftercare, including purple shampoo, deep conditioning and heat protection.',PHOTO_REQ,'Fees follow {business} policy. Concerns within 7 days; no refunds after service.'],
  consentTo:'By signing, I confirm I am 18 or older with photo ID (or have parent or guardian consent per our policy and local law), have read this form, had my questions answered, and consent to the lightening service I checked above.'});
consent('hs-keratin-consent','Keratin & smoothing consent',{
  what:[['What it is','A smoothing product is applied, dried in and sealed with a flat iron to cut frizz and speed up styling.'],['What to expect','About 2–4 hours, depending on your hair\'s length and density. Heat and fumes are part of it.'],['How long it lasts','Usually 2.5–5 months, fading gradually with washing. It is not a permanent straightener.']],
  risks:['Eye, nose, throat or lung irritation from fumes','Scalp redness, itching or a burning feeling','Dryness, brittleness or breakage','Uneven smoothing or patchy results','Less curl, wave or volume than before','Allergic reaction to an ingredient, even later','Color fading or a tone shift on colored hair','Headache or feeling unwell from strong odor'],
  checks:['Pregnant or breastfeeding','Asthma, lung or eye condition','Scalp cuts, sores or sunburn','Scalp infection, ringworm or lice','Psoriasis or eczema flare on scalp','Allergy to a product ingredient','Chemotherapy or radiation, recent','Alopecia or unusual shedding','Relaxer, perm or past keratin','Box dye, henna or lightener','Isotretinoin or new medication','Very damaged or fragile hair'],
  extras:[h=>h.yn('ABOUT FUMES AND FORMALDEHYDE. Many smoothing products contain or release formaldehyde when heated, including some labeled "formaldehyde-free." Formaldehyde is a known human carcinogen and can irritate the eyes, nose, throat and lungs. We use the product named in your record, with ventilation; its Safety Data Sheet is yours to read. Pregnant, breastfeeding, or asthma, lung or eye issues? Ask your physician first. I have read this.',true)],
  inits:['I\'ve shared my full health and hair history honestly, including box dye, henna and past chemical services.','I understand the risks above. Results depend on my hair and the product used, and aren\'t guaranteed.','I\'ll speak up right away if my eyes, nose, throat or chest feel irritated, or my scalp stings or burns.','I had a strand test, or I declined it and signed the waiver. Hair with unknown history may react.','I\'ll follow my aftercare, including no washing, ponytails or clips for 0–72 hours if my product requires it.','I understand color should be done before this service or wait 2 weeks after it, per the product.',PHOTO_REQ,'Deposits and fees follow {business} policy. Price may change if length or density differs.'],
  consentTo:AGE18+'a keratin or smoothing treatment with the product named in my record.'});
consent('hs-perm-consent','Permanent wave consent',{
  what:[['What it is','A waving lotion reshapes hair around rods, then a neutralizer locks in the new curl.'],['What to expect','About 2–3 hours. A test curl checks the timing. Expect a strong smell during the service.'],['How long it lasts','Usually 3–6 months, relaxing gently as hair grows. Trims every 8–12 weeks help.']],
  risks:['Frizz or over-processing, more so on lightened hair','A weaker or looser curl than you hoped for','Dryness, breakage or split ends','Uneven curl from roots to ends','Scalp redness, stinging or irritation','Allergic reaction to the lotion or neutralizer','Color fading or a tone shift on colored hair','A perm smell for a few days, worse when wet'],
  checks:['Pregnant or breastfeeding','Scalp cuts, sores or sunburn','Scalp infection, ringworm or lice','Psoriasis or eczema flare on scalp','Allergy to perm or color products','Chemotherapy or radiation, recent','Alopecia or unusual shedding','Relaxer, now or in the past','Box dye, henna or metallic dye','Lightener, highlights or balayage','Keratin or smoothing treatment','Isotretinoin or new medication','Thyroid or hormone changes','Asthma or sensitivity to odors','Very damaged or fragile hair'],
  extras:[h=>h.ss('ABOUT RELAXED AND LIGHTENED HAIR. Hydroxide relaxers and perm solutions don\'t mix; perming relaxed hair can cause severe breakage. Lightened or damaged hair needs a strand test first, and your stylist may advise against a perm. My hair:',['Never relaxed','Relaxed or not sure'],true)],
  inits:['I\'ve shared my full health and hair history honestly, including relaxers, box dye, henna and lightener.','I understand the risks above. Curl results depend on my hair\'s condition and aren\'t guaranteed.','I\'ll speak up right away if my scalp stings, burns or itches, or solution runs toward my eyes.','I agree to a test curl, plus a strand test if my hair is lightened, damaged or of unknown history.','I\'ll keep my hair dry and loose for 48–72 hours. Wetting or tying it too soon can relax the curl.','I understand color should wait 2 weeks after my perm, or be done before it, per the product.',PHOTO_REQ,'Deposits and fees follow {business} policy. Price may change if length or density differs.'],
  consentTo:AGE18+'a permanent wave, test curl and any strand test needed.'});
consent('hs-relaxer-consent','Chemical relaxer consent',{
  what:[['What it is','A lye or no-lye cream that permanently straightens hair. A protective base shields your scalp.'],['What to expect','About 1.5 to 3 hours. Retouches cover new growth only; a neutralizing shampoo ends it.'],['How long it lasts','Relaxed hair stays straight until cut off. New growth comes in natural, so retouch every 8 to 10 weeks.']],
  risks:['Tingling, scalp irritation or chemical burns','Breakage, especially where hair overlaps','Thinning or hair loss, often at the edges','Over-processing: limp, weak or gummy hair','Uneven straightening or a natural texture left','Dryness that needs extra moisture and care','Allergic reaction to an ingredient, which is rare','Damage if relaxer meets perm or curl solution'],
  note:'Some studies (e.g. NIH Sister Study, 2022) linked frequent straightener use to higher uterine cancer risk; ask your physician.',
  checks:['Cuts, sores or sunburn on scalp','Psoriasis or eczema flare','Scalp infection or lice','Burn from a past relaxer','Hair loss, thinning edges','Chemo, now or recently','Pregnant or breastfeeding','Allergy to a hair product','Perm or curl in the past year','Color or lightener on hair','Box dye, henna or metallic dye','Keratin or smoothing treatment','Washed or scratched in 48 hrs','Other brand of relaxer used','Isotretinoin or minoxidil'],
  extras:[h=>h.yn('LYE OR NO-LYE. We agreed on type and strength; my stylist may adjust them to protect my hair.',true)],
  inits:['I\'ve shared my full hair and health history honestly, including any perms, curls or home treatments.','I understand relaxers and perm or curl solutions can\'t be used over each other without serious breakage.','I\'ll tell my stylist right away about burning or stinging, so the relaxer can be rinsed straight away.','A strand test was offered. My stylist may decline or delay the service if my hair is not strong enough.','Results vary with my hair\'s texture, history and condition. Bone-straight results aren\'t guaranteed.','I\'ll follow my aftercare and wait 2 weeks before color. I won\'t relax my hair at home between visits.','Deposits, fees and corrections follow {business} policy. No refunds once the service is done.',PHOTO_OK],
  consentTo:AGE18+'a chemical relaxer and future retouches.'});
consent('hs-ext-consent','Hair extension consent',{
  what:[['What it is','Added hair attached to small sections of your own hair to build length, volume or color.'],['What to expect','About 1.5 to 5 hours, plus blending and cutting. Expect your scalp to feel snug for a few days.'],['How long it lasts','Tapes and wefts move up every 6 to 8 weeks; k-tips last 3 to 4 months. Hair can be reused.']],
  risks:['Tenderness, tightness or headaches at first','Itching or irritation at the attachment points','Traction alopecia if too heavy, tight or overdue','Breakage or thinning of your natural hair','Matting at the roots without daily brushing','Slipping bonds, tapes or beads','Reaction to adhesive, tape or keratin, which is rare','Color or texture shifts in the added hair over time'],
  note:'Some shedding of natural hair (often 50 to 100 strands a day) collects at the bonds. That is not damage.',
  checks:['Hair loss or thinning patches','Alopecia or trichotillomania','Very fine or fragile hair','Psoriasis, eczema or dandruff','Scalp infection or lice','Sensitive or tender scalp','Chemo, now or recently','Pregnant or postpartum','Minoxidil or hormone changes','Allergy to adhesive or latex','Allergy to metal (nickel)','Frequent headaches or migraines','Recent color or lightener','Other extensions now in','Swim or work out daily'],
  extras:[h=>h.ss('Method chosen',['Tape-in','K-tip','Micro-link','Sew-in / hand-tied','Clip-in'],true)],
  inits:['I\'ve shared my full hair and health history honestly, and will tell my stylist about any changes.','My stylist chose a method and amount of hair my natural hair can safely carry, and may adjust it.','I understand missed move-ups and tension can cause traction alopecia, which may be permanent.','I\'ll tell my stylist right away about pain, pulling or itching, during the service or after it.','I\'ll follow my aftercare and book move-ups on time. Wear and lifespan of the hair aren\'t guaranteed.','I won\'t remove or re-tape extensions myself. Removal is by a professional only.','Hair is custom ordered for me. Deposits and hair purchases are non-refundable once ordered.',PHOTO_OK],
  consentTo:AGE18+'hair extensions and future move-ups.'});

// ---- guides (aftercare & prep handouts) ----
const CALL='Questions? Text {phone|me} · {business}';
const P=['hair'];
const guides=[
 {id:'g-hs-color',icon:'🎨',title:'Caring for your hair color',cat:'Aftercare',profs:P,tips:[
  'The first few days lock in your color. After that, a few gentle habits keep it rich, shiny and true to tone until your next visit.',
  'First 72 hours (color settles). Normal: a little color in the rinse water or on your pillowcase; any hairline staining fades in a day or two. Do: wait 48–72 hours before your first shampoo; if you need to wet your hair, rinse with cool water only. Avoid: shampoo, hot showers, swimming, saunas, heavy sweat, and clarifying or dandruff shampoos.',
  'Weeks 1–2 (settling in). Normal: your color looks its richest; red and copper tones soften a little first, and that\'s normal. Do: sulfate-free, color-safe shampoo and conditioner; wash 2 to 3 times a week in cool water. Avoid: hot tools without heat protectant, chlorine pools, and long hours in the sun without a hat or UV spray.',
  'Weeks 4–8 (refresh time). Normal: roots and gray start to show; demi color and gloss fade, and ends may look lighter or warmer. Do: book your root touch-up every 4–8 weeks and a gloss or toner refresh every 4–6 weeks. Avoid: box dye or home color between visits; it builds up and can mean a longer, costly correction.',
  'Ongoing (keep it healthy). Normal: gentle fading from sun, water and heat over time; ends get drier and need trims. Do: trim every 8–12 weeks; tell me about new medications, allergies or health changes. Avoid: henna, "progressive" or metallic dyes; they can react badly with salon color.',
  'Good to know: hard water and chlorine dull color, and a shower filter helps; wet hair and add leave-in before you swim; root spray or powder can blend gray between visits; dry shampoo stretches the time between washes; a weekly hydrating mask keeps ends soft and shiny; use the color-depositing products I recommend.',
  'Wait 48–72 hours before your first shampoo. Cool water, since hot water opens the cuticle and fades color. Sulfate-free, color-safe shampoo and conditioner only. Heat protectant and UV spray, every time.',
  'Call me right away if you notice: itching, burning or redness on the scalp; a rash or swelling at the hairline, ears or neck; blisters, oozing or crusting on the scalp; hair that feels gummy or breaks easily.',
  'Swelling of the face, eyes or throat, or trouble breathing: call 911. Severe scalp pain or blistering: get medical care today.',CALL]},
 {id:'g-hs-lightening',icon:'🌟',title:'Caring for lightened hair',cat:'Aftercare',profs:P,tips:[
  'Lightened hair is more porous and thirsty than before. These first weeks matter most for keeping it strong, soft and the tone you love.',
  'First 72 hours (toner settles). Normal: hair may feel a little drier; tone may look slightly deep at first and soften with washing. Do: wait 48–72 hours before shampooing; detangle gently from the ends up with a wide-tooth comb. Avoid: hot water, swimming, saunas, clarifying shampoo, and tight elastics on damp hair.',
  'Weeks 1–2 (settling in). Normal: tone is at its best; a little warmth may start to show in sunlight, and that\'s normal. Do: purple or blue shampoo 1–2 times a week, and a weekly deep conditioner and bond-repair treatment. Avoid: hot tools without heat protectant, and leaving purple shampoo on longer than the label says.',
  'Weeks 4–8 (toner refresh). Normal: toner fades and brassy or yellow tones show; regrowth appears at the roots. Do: book a toner refresh every 4–8 weeks, and plan your next session if we are lifting in stages. Avoid: box dye, home bleach or toner kits; they can cause breakage and patchy color.',
  'Ongoing (keep it strong). Normal: ends dry out and split faster than unlightened hair, and wet hair stretches more. Do: trim every 8–12 weeks; use leave-in conditioner, heat protectant and a silk pillowcase. Avoid: chlorine and salt water without protection, and henna or metallic dyes.',
  'Good to know: wet hair and add leave-in before you swim; a swim cap and clarifying rinse help with chlorine; hard water can make blonde look dull or brassy; UV spray or a hat helps keep your tone cool; be gentle when hair is wet, since it\'s at its weakest; keep hot tools at 300–350°F or lower.',
  'Purple wash 1–2 times a week to keep brass away. Deep condition with a weekly mask or bond-repair treatment. Heat protect before every blow-dry, iron or wand. Pool prep: wet hair and add leave-in before you swim.',
  'Call me right away if you notice: itching, burning or redness on the scalp; tender spots, blisters or scabs on the scalp; hair that feels gummy, stretchy or snaps; a rash or swelling at the hairline, ears or neck.',
  'Swelling of the face, eyes or throat, or trouble breathing: call 911. Severe scalp pain or blistering: get medical care today.',CALL]},
 {id:'g-hs-smoothing',icon:'💫',title:'Caring for smoothed hair',cat:'Aftercare',profs:P,tips:[
  'The first 72 hours let your treatment set. After that, gentle products and heat protection keep hair smooth for 2.5 to 5 months.',
  'First 72 hours (treatment is setting). Normal: hair looks very sleek and may feel a little coated; a faint product smell can linger. Do: no washing or wetting for 0–72 hours, per your product; keep hair loose. Avoid: ties, clips, tucking behind ears, hats, sweat, steam and swimming.',
  'Weeks 1–2 (settling in). Normal: hair relaxes a little after the first washes and air-dries with much less frizz. Do: use a sulfate- and salt-free shampoo in cool or lukewarm water. Avoid: color or lightening for 2 weeks; chlorine, salt water and clarifying shampoos.',
  'Months 1–3 (enjoy it). Normal: smoothness slowly softens as the treatment washes out and new growth comes in. Do: heat protectant before hot tools; deep condition weekly. Avoid: sulfates and salt-based products, and washing more often than you need to.',
  'When to rebook (next visit). Normal: frizz and natural texture return, usually around 2.5 to 5 months; that\'s normal. Do: book your next treatment, and tell me about any new color, medication or health changes. Avoid: treating again too soon, which can dry and weaken hair.',
  'Good to know: hair can look flatter than usual for a few days; a kink from a tie can set in early, so keep it loose; the right shampoo makes results last longer; swimming? Wet hair and add leave-in first; a silk or satin pillowcase cuts down on friction; results vary with hair type and product used; color before your treatment, or wait 2 weeks; styling time is usually much shorter now.',
  'Stay dry: no water for 0–72 hours, per product. Keep it loose: no ties or clips for 0–72 hours. Right shampoo: sulfate- and salt-free only. Protect it: heat protectant, every time.',
  'Call me right away if you notice: scalp itching, a rash or bumps; redness or burning that gets worse, not better; blistering, oozing or crusting on the scalp; unusual breakage or shedding.',
  'Eye pain or any change in your vision: get urgent eye care today. Trouble breathing, or swelling of the face or throat: call 911.',CALL]},
 {id:'g-hs-perm',icon:'🌀',title:'Caring for your new curls',cat:'Aftercare',profs:P,tips:[
  'The first 48 to 72 hours lock in your curl. After that, moisture and a gentle touch keep it bouncy for 3 to 6 months.',
  'First 48–72 hours (curl is setting). Normal: curls look tighter than they\'ll settle; a perm smell is normal, mostly when wet. Do: keep hair dry for 48–72 hours; let it fall loose and scrunch gently with fingers. Avoid: shampoo, wetting, sweat and steam; tight ponytails and clips for 48 hours; brushing.',
  'Weeks 1–2 (settling in). Normal: curls relax a little and soften; the smell fades with each wash. Do: sulfate-free, curl-friendly shampoo and conditioner; diffuse or air-dry. Avoid: color for 2 weeks; brushing curls dry, flat irons and chlorine.',
  'Weeks 4–12 (enjoy it). Normal: curl loosens gradually and new growth comes in straight at the root. Do: deep condition weekly; wide-tooth comb on wet hair only; trim every 8–12 weeks. Avoid: daily hot tools, salt water and rubbing hair with a rough towel.',
  'Ongoing (next visit). Normal: the perm grows out over 3–6 months; ends stay curled until they\'re trimmed. Do: book trims and your next perm; tell me about color, relaxers or health changes. Avoid: box dye, a relaxer or a home perm over this one; they can break hair.',
  'Good to know: scrunch, don\'t brush, since brushing breaks up curls; the perm smell is normal and fades in a few washes; a microfiber towel or T-shirt helps cut frizz; a silk or satin pillowcase protects your curl; refresh second-day curls with water and leave-in; swimming? Wet hair and add leave-in first; color after 2 weeks, or as I advise; trims every 8–12 weeks keep ends healthy.',
  'Stay dry: no water for 48–72 hours. Hands off: no tight ties or clips for 48 hours. Go gentle: sulfate-free, curl-friendly care. Air-dry: diffuse or air-dry and skip hot tools.',
  'Call me right away if you notice: scalp itching, a rash or bumps; redness or burning that gets worse, not better; blistering, oozing or crusting on the scalp; breakage, or hair that feels gummy.',
  'Eye pain or any change in your vision: get urgent eye care today. Trouble breathing, or swelling of the face or throat: call 911.',CALL]},
 {id:'g-hs-relaxer',icon:'🪮',title:'Caring for relaxed hair',cat:'Aftercare',profs:P,tips:[
  'Your relaxer has changed the structure of your hair for good, and your scalp needs a few days to settle. Gentle care now keeps your hair strong, smooth and healthy until your next retouch.',
  '72 hours (scalp settling). Normal: a slightly tender or dry scalp; hair may feel softer and lighter than usual. Do: wrap or pin hair loosely at night; sleep on a silk or satin pillowcase or scarf. Avoid: washing for 72 hours; scratching, hard brushing, sweaty workouts and tight edges.',
  'Weeks 1–2 (first washes). Normal: hair may feel a little drier as it adjusts; a light flake or two can appear. Do: wash with a moisturizing, sulfate-free shampoo; deep condition weekly; use a heat protectant. Avoid: color for 2 weeks; tight ponytails, braids or edge tension; flat irons on high heat.',
  'Weeks 3–8 (new growth). Normal: natural texture grows in at the roots, and the line where textures meet is fragile. Do: balance moisture and protein; detangle gently from ends up; trim ends every 8 to 12 weeks. Avoid: heat every day, chlorine without protection, and rough combing at the line of new growth.',
  '8–10 weeks (retouch time). Normal: about 1/2 inch of new growth; roots feel full and textured again. Do: book your retouch; skip washing and scratching for 48 hours before you come in. Avoid: relaxing at home or stretching past 12 weeks, and any perm or curl solution on relaxed hair.',
  'Retouches treat only your new growth, never the hair that is already relaxed. Overlapping is the most common cause of breakage, so let me do every retouch.',
  'Wait to wash: give your scalp 72 hours before your first shampoo. Moisturize: weekly deep conditioning keeps relaxed hair flexible. Ease the edges: loose styles protect your hairline from tension. Go easy on heat: heat protectant always, low to medium settings.',
  'Call me right away if you notice: scabs, blisters or weeping spots on the scalp; burning or soreness that gets worse, not better; hair breaking off or shedding in clumps; redness, swelling or an itchy rash. For scabs, blisters or a spreading rash, please see your doctor or a dermatologist too.',
  'Relaxer in the eye: flush with cool water for 15 minutes and get urgent care. Trouble breathing: call 911.',CALL]},
 {id:'g-hs-extensions',icon:'💇',title:'Caring for your extensions',cat:'Aftercare',profs:P,tips:[
  'Your extensions are attached to your own hair, so caring for one protects the other. A few simple habits keep them smooth, comfortable and lasting until your next move-up.',
  '48 hours (settling in). Normal: a snug, slightly tender scalp; sleeping may feel different for a night or two. Do: brush gently from the ends up; sleep in a loose braid or low ponytail on silk. Avoid: washing for 48 hours while bonds set; heat, steam and heavy sweat.',
  'Daily care (every day). Normal: some shedding collects at the attachments; brushing keeps roots tidy. Do: loop brush 2 to 3 times a day; dry roots fully; use a heat protectant. Avoid: oils or conditioner on bonds, sleeping wet, and unprotected chlorine or salt water.',
  'Weeks 6–8 (move-up time). Normal: attachments sit lower as your hair grows, and roots may start to tangle more easily. Do: book your move-up; come with clean, dry hair and no product at the roots. Avoid: stretching past 8 weeks, and adjusting tapes, bonds or beads yourself.',
  'Removal (when it\'s time). Normal: a small ball of shed hair at each attachment; this built up over weeks. Do: book a professional removal; let me check your scalp and deep condition after. Avoid: pulling, cutting or dissolving extensions at home, and box dye on extension hair.',
  'Shedding: everyone sheds about 50 to 100 hairs a day. With extensions, those hairs stay at the attachment until your move-up, so a little build-up is normal. Swimming: wet hair first, add a leave-in, braid it and wear a cap; rinse right after.',
  'Brush gently: start at the ends and work up, holding the roots. Dry the roots: damp attachments mat and slip, so never sleep wet. Keep bonds clean: conditioner and oils go mid-lengths to ends only. Braid for bed: a loose braid and silk scarf stop tangles overnight.',
  'Call me right away if you notice: itching, soreness or pulling that won\'t settle; bumps, redness or a rash at the attachments; headaches that started after your install; shedding at the root or thin, bare spots. I can loosen or remove pieces that pull. For a rash or bare patches, see your doctor or a dermatologist too.',
  'Face or throat swelling or trouble breathing: call 911.',CALL]},
 {id:'g-hs-prep',icon:'📅',title:'Before your salon visit',cat:'Pre-care',profs:P,tips:[
  'For color, lightening, keratin, perm, relaxer and extension services. A little prep protects your scalp and helps us get the result you\'re hoping for.',
  '2 weeks before: no box dye, henna or at-home color or lightener. Used any in the past 2 years? Tell us, even if it has grown out; some can react with salon products. Book your allergy alert test if you need one.',
  '1 week before: skip at-home keratin, perm or straightening kits. Hold off on a trim; we may shape after your service. Extensions: confirm your hair order and final color match.',
  '48 hours before: allergy alert test done and checked for itching or redness. Don\'t scratch or brush your scalp hard. Skip shampoo for 24–48 hours before lightener, relaxer or perm; natural oils protect your scalp.',
  'Day of your visit: arrive with dry hair, styled the way you normally wear it. Bring inspiration photos, plus photos of looks you don\'t want. Wear a dark top; color can stain.',
  'Color and lightening: big changes, like dark to blonde, may take more than one visit; we may do a strand test first if your hair has past color or unknown history; allergy alert test 48 hours before every color service; color correction starts with a consultation.',
  'Smoothing and texture: tell us every chemical service from the last 2 years; relaxer and perm can\'t go over each other, so we\'ll check your history; keratin fumes can bother eyes and lungs, so tell us about asthma; plan a few days without washing afterward.',
  'Extensions: a consultation and color match come first; hair is custom ordered and deposits are non-refundable; come with clean, dry hair, no oils, serums or dry shampoo; allow 2–4 hours for a full install.',
  'Please call to reschedule if you have: a scalp infection, lice or ringworm; cuts, scrapes, a sunburn or rash on the scalp; a psoriasis or eczema flare on your scalp; a fever, cold or flu, or feel unwell; any itching or redness from your allergy test; recent chemo or radiation without your doctor\'s OK. We ask for 48 hours\' notice. If it\'s about your safety, just call. We\'ll find a new time together.',
  'Pregnant or breastfeeding? It\'s not an automatic no, but many clients choose to wait. Check with your doctor and tell us so we can plan together. Never stop a prescribed medication without your doctor\'s OK.',CALL]},
 {id:'g-hs-haircare',icon:'🧴',title:'Your hair care guide',cat:'Aftercare',profs:P,tips:[
  'Healthy hair holds color, smoothing and extensions best. Here\'s how to care for it between visits, how long each service lasts and when to call us.',
  'Daily routine. Wash frequency: 2–3 times a week for most hair; daily washing fades color faster. Shampoo: sulfate-free and color-safe, focused on the scalp. Water temperature: lukewarm to wash, cool to rinse; hot water fades color. Deep conditioning: a mask once a week, more often if your hair is lightened or dry.',
  'Protect. Heat styling: heat protectant every time; tools at 350°F or lower. Sun: UV fades and dries color, so wear a hat or use a UV hair spray. Chlorine and salt: wet your hair and add leave-in before swimming, and rinse right after. Brushing and sleep: detangle from the ends up; sleep on silk or in a loose braid.',
  'How long it lasts, with good home care. Color: roots show at 4–8 weeks; gloss or toner fades in 4–6. Highlights and balayage: toner refresh 4–8 weeks, highlights 8–12. Keratin and smoothing: about 2.5–5 months, fading gradually. Perm and relaxer: perm about 3–6 months; relaxer retouch every 8–10 weeks, new growth only. First wash: wait 48–72 hours after color or chemical services. Blondes: purple or blue shampoo 1–2 times a week fights brass. Extensions: move-ups every 6–8 weeks; bonds last 3–4 months.',
  'Trim often, every 8–12 weeks, to stop split ends. Skip box dye; at-home color can react with salon products. Go easy: loose styles, no tight ponytails on wet hair. Ask first: unsure about a product? Text us first.',
  'This is normal: some color in the water for the first few washes; toner softening and warming over 4–6 weeks; a mild chemical scent for a few days after a perm; hair feeling a little drier after lightening; shedding 50–100 hairs a day (it\'s natural); extensions feeling snug for the first few days.',
  'Call us if you notice: itching, burning, redness or flaking on your scalp; blisters, oozing or tender spots after a service; hair that feels gummy or stretchy when wet; snapping, breakage or patches of thinning; soreness, bumps or shedding at extension roots; color that turned out very different than planned.',
  'Call 911 for trouble breathing or a swollen face or throat. Product in your eye? Flush 15 minutes, then get urgent care. Possible allergy? Rinse with cool water, see a doctor and tell us. Allergies can start after years of safe use.',CALL]},
];
// sanity: no brackets left, no card-on-file question
const all=JSON.stringify(forms)+JSON.stringify(guides);
const left=all.match(/\[[A-Za-z$0-9][^\]]{0,40}\]/g);
if(left){console.error('PLACEHOLDERS LEFT:',left);process.exit(1);}
if(/card on file|card saved|credit card/i.test(all)){console.error('CARD-ON-FILE TEXT LEFT');process.exit(1);}
process.stdout.write('const HS_FORMS='+JSON.stringify(forms,null,0).replace(/\},"hs-/g,'},\n"hs-')+';\nconst HS_GUIDES='+JSON.stringify(guides).replace(/\},\{"id"/g,'},\n{"id"')+';\n');
console.error('forms',Object.keys(forms).length,'questions',Object.values(forms).reduce((a,f)=>a+f.qs.length,0),'guides',guides.length);
