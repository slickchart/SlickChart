// The Head Spa Collection (Ashley, 2026-10-19) -> app forms + guides, written from her PDF text.
// Same rules as the other collections (CLAUDE.md §1e): placeholders resolved to the PDF's own defaults
// so clients never see brackets; business name/phone become {business}/{phone|...}; specialist-only
// boxes (office use, microscope findings and scalp map, patch test log, reaction record, plan going
// forward, scalp progress record, specialist signatures) stay on the printable record; no card-on-file
// question.
//   node scratchpad/hd/gen-hd.cjs > scratchpad/hd/hd-data.js
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
    // her heading differs per page: POSSIBLE EFFECTS / POSSIBLE RISKS AND SIDE EFFECTS / POSSIBLE EFFECTS AND RISKS
    risks:(head,items,note)=>add(head+'. '+items.join('; ')+'.'+(note?' '+note:'')+(/RISK/.test(head)?' I understand these risks.':' I understand these effects.'),'Yes / No',true),
    name:()=>add('Client name','Short text',true), dob:()=>add('Date of birth','Date',false),
    sig:(l)=>add(l||'I confirm the information above is accurate','Signature',true),
  };
  build(h);forms[id]={name,qs};
}

form('hd-intake','Head spa client intake',h=>{
  // About you
  h.st('Full name',true);h.dob();h.st('Mobile phone');h.st('Email');h.st('Address');
  h.st('Emergency contact & relationship');h.st('Their phone');h.st('How did you hear about us?');
  h.ss('Best way to reach you',['Text','Email','Call']);h.yn('OK to text you reminders?');
  // Your visit & goals
  h.mc('Which services are you booking? Check all that apply',['Signature ritual','Exfoliation & cleanse','Steam & hydration','Hot oil & massage','High-frequency scalp','LED light therapy','Neck & shoulders','Blow-dry'],true);
  h.mc('Scalp & hair concerns. Check all that apply',['Itching','Flaking','Oiliness','Dryness','Buildup','Sensitivity','Thinning','Breakage','Tension headaches','Stress']);
  h.lt("What would you love to feel or notice after your visits? Anything you'd like us to avoid?");
  h.ss('Massage pressure you like',['Light','Medium','Firm','Not sure yet']);
  // Your hair history
  h.ci('Your hair history. Check anything that applies to you.',[
    'Color, gloss or toner','Lightening or bleach','Relaxer or perm','Keratin or smoothing treatment','Extensions, weave or wig',
    'Heat styling most days','Hats or helmets often','Tight braids or ponytails','Dry shampoo often','Swimming in chlorine']);
  h.lt('Last date of any color, lightening, relaxer, perm, keratin or extensions, and any notes');
  h.st('How often you wash your hair');h.st('Shampoo & scalp products you use now');
  // Your lifestyle
  h.ss('Sleep most nights',['Under 6 hours','6 to 8 hours','Over 8 hours']);
  h.ss('Stress lately (1 low, 10 high)',['1','2','3','4','5','6','7','8','9','10']);
  h.ss('Screen time a day',['Under 4 hours','4 to 8 hours','Over 8 hours']);
  h.ss('Water a day',['Under 4 glasses','4 to 8 glasses','Over 8 glasses']);
  // page 2: Health, allergies & agreement
  h.mc('Are you allergic or sensitive to any of these? Check all that apply',['Fragrance','Essential oils','Nut oils (almond, argan)','Botanicals or plant extracts','Latex','Hair dye or PPD','Salicylic acid or aspirin','Shampoo or scalp products','None that I know of']);
  h.st('Reaction you had, and to what');
  h.ci("Health & scalp health. Some answers mean a gentler service or your doctor's OK first. Answers stay confidential. Check anything that applies to you.",[
    'Psoriasis or eczema on scalp, face or neck','Seborrheic dermatitis or dandruff flare','Lice or ringworm in the last 30 days','Folliculitis, sores, cuts or scabs on scalp',
    'Hair loss diagnosed by a doctor','Surgery or hair transplant, past 12 months','Botox or fillers in the last 2 weeks','Medicine that makes skin light-sensitive',
    'Neck or spine problems','Vertigo, or dizzy at a shampoo bowl before','Stroke or mini-stroke, ever','High blood pressure or heart condition',
    'Pacemaker or metal implant in head or neck','Epilepsy, seizures or migraines','Pregnant or trying','Any other medical condition']);
  h.lt('All medications you take, including prescriptions and supplements');
  h.yn('Color, lightening, relaxer, perm or keratin in the last 72 hours?');
  h.init("My answers are true and complete. I'll tell you if my health, medications or hair services change.",
    'Head spa services are relaxing and cosmetic, not medical. No result, including hair regrowth, is promised.',
    "I'll speak up right away if I feel dizzy, numb, sore or uncomfortable, and I can stop at any time.",
    "Reactions to products or oils can happen, even ones I've used before. I'll report any itching or redness.",
    'I am 18 or older, or a parent or guardian signs for me per our policy.');
  h.yn('YOUR PRIVACY. Your information is kept confidential, stored securely and used only to provide your services. It is never shared without your written consent unless the law requires it. Records are kept 7 years. I have read this.',true);
  h.sig();
});

form('hd-analysis','Scalp analysis & treatment plan',h=>{
  // The scalp map, magnification, image numbers, scalp type, microscope findings (0-3 per zone) and the
  // dermatologist referral box are the specialist's readings: printable only.
  h.name();h.st('Specialist');
  h.lt("Client's main concerns today");
  h.lt('Recommended services');h.st('Frequency');h.st('Next visit & re-analysis');
  h.lt('Home care & products');
  h.yn("CLIENT APPROVAL. I've seen my images and agree to this plan. Head spa care is cosmetic; regrowth isn't promised.",true);
  h.sig('Client signature');
});

form('hd-service-consent','Head spa service consent',h=>{
  h.name();h.dob();h.lt("Head spa service(s) I'm consenting to",true);
  h.about('ABOUT HEAD SPA SERVICES',[['What it involves','Camera scalp analysis, cleansing, massage, steam, products and warm water at the bowl or bed.'],["What it isn't",'A relaxing cosmetic service, not medical care. No diagnosis, and no promise of hair regrowth.'],['Your neck','Your neck stays supported and neutral. Tell me about neck problems or dizziness.']]);
  h.risks('POSSIBLE EFFECTS',['Tingling or warmth: from massage, steam, exfoliants or high frequency, usually fades within hours','Redness: mild, short-lived redness of the scalp, hairline, forehead or neck','Dryness or tightness: from cleansing or exfoliation, and a gentle routine at home helps','Product reaction: itching, rash, hives or swelling from fragrance, essential oils, nut oils or botanicals','Eye irritation: water or product near the eyes, so tell me right away if anything stings','Dizziness sitting up: warmth and lying back can leave you lightheaded, so we sit you up slowly','Neck discomfort: from lying back at the bowl or bed, so tell me if anything feels strained','Extra shedding: hairs that were already loose often rinse out at the wash, and this is normal','Heavy or oily hair: oils and masks can leave hair heavier for a day until your next wash','Makeup and styling: makeup may smudge, and your hair will be wet or loose afterward'],
    'Results depend on your scalp, health and home care. Pregnant, epileptic or have a pacemaker? Please tell me. Neck note: a sharp backward tilt at a shampoo bowl has rarely been linked to stroke. Tell me if you feel dizzy or numb.');
  h.init("I've read the effects above and had my questions answered. No result or regrowth was promised.",
    'My health information is true and complete, including allergies, medicines and neck problems.',
    'I understand this is cosmetic, not medical care, and my specialist does not diagnose.',
    "I'll speak up right away about burning, pain, dizziness, numbness or neck discomfort.",
    'No service goes over sores, infection, lice or sunburn; my visit may be changed or rescheduled.',
    "I'll follow aftercare and contact you, and a healthcare provider, if a reaction or new symptom appears.");
  h.ss('Scalp camera images for my records only; other use needs photo consent',['I agree','I do not agree'],true);
  h.init('I release {business} from claims from details I withheld or aftercare I skipped, as state law allows.',
    'I am 18 or older (or my guardian signs below), not under the influence, and signing of my own free will.');
  h.st('Parent or guardian name and relationship (if under 18)');
  h.sig();
});

form('hd-sensitivity','Sensitivity & patch test record',h=>{
  // Patch test log, reaction record and plan going forward are the specialist's: printable only.
  h.name();h.st('Phone');h.st('Known allergies');h.st('Dermatologist · clinic');
  h.yn("WHY PRODUCT SENSITIVITY MATTERS. Fragrance, essential oils, nut oils (almond, argan) and botanicals are common causes of skin reactions, even to familiar products. Patch test new products behind the ear and check at 24 and 48 hours. A patch test lowers risk but can't rule out a reaction; formal allergy testing is done by a dermatologist. I have read this.",true);
  h.yn('Ever reacted to a shampoo, hair dye, oil or skin product?');
  h.yn('Allergic to fragrance, essential oils or botanicals?');
  h.yn('Nut allergy, or reacted to almond, argan or other nut oils?');
  h.yn('Eczema, psoriasis or a diagnosed contact allergy?');
  h.lt('Details: where, when, what happened');
  h.yn("I've shared my allergy history honestly. I'll report any itching, redness or swelling, and call 911 for trouble breathing.",true);
  h.sig();
});

form('hd-photo','Scalp image & photo release',h=>{
  h.name();h.st('Phone or email');
  h.yn('Microscope images, records only: close-up scalp images in my private file to track progress. Never shared. If no, notes only.',true);
  h.yn('Portfolio, before and after: before and after scalp or hair images on your website, in print or in a portfolio.');
  h.yn('Social media: posted on your business accounts, including microscope views, short videos and reels.');
  h.ss("Face shown or not (if yes to portfolio or social media). You may see any image before it's used.",['Scalp & hair only','Face turned away or hidden','Face may show']);
  h.yn('Tag me, name me or quote me: you may tag my social handle, use my first name, or quote my review with my photos.');
  h.st('Name or handle to use (if yes above)');h.st('Limits (areas, platforms, dates)');
  h.yn("HOW YOUR PHOTOS ARE HANDLED. Your face is only shown if you choose it above. Tell us any time if you'd rather not be filmed during your service. Storage: images stay on a business device in our secure app, never a personal camera roll, for 7 years. Changing your mind: text or email to withdraw; posts we control come down within 7 days; others' shares may be out of reach. No payment: this release is voluntary; you won't receive payment, royalties or free services for photos or reviews. Honest images: no filters or edits that change your scalp or hair; same zones, magnification and lighting before and after. Saying no never affects your care, and you can change your mind any time. I have read this.",true);
  h.sig('By signing, I confirm my choices above. This release stays in effect until I change or withdraw it in writing.');
});

form('hd-policy','Booking & studio policy',h=>{
  h.name();h.date('Appointment date');
  h.yn("BOOKING POLICY. Your appointment is reserved just for you, and a full head spa ritual can take 60–120 minutes. These policies keep things fair for every client and keep your visit calm and unhurried. Deposit: $25 or 30% to book any service; non-refundable and applied to your total. Notice to change: 24 hours, to move your appointment and keep your deposit. Grace period: 10 minutes; after that, your service may be shortened. Rescheduling: with 24 hours' notice, your deposit moves once; a second change needs a new deposit. No-show and late change: your deposit is forfeited; after 2 no-shows, a full prepayment is needed to book. Late arrival: after 10 minutes your service may be shortened so the next client starts on time, at the full price. I have read this.",true);
  h.yn("HEALTH & YOUR VISIT. Health changes: tell us before your visit about new medicines, diagnoses, pregnancy, or neck or scalp problems; some services may change or need your doctor's OK. Lice or infection: head lice, ringworm, impetigo or open sores on the scalp? We'll reschedule with no fee. Chemical services: allow 72 hours between color or other chemical services and exfoliation, steam or high frequency. Licensed services: shampooing and blow-drying are offered only where our license allows; all care is cosmetic, not medical. Come prepared: skip heavy styling products and hair accessories; hair may be damp afterward. Gift cards & packages: valid for 12 months from purchase and non-transferable. Children & guests: under 18? A parent or guardian signs and stays on site; please ask before bringing guests. Refunds: services can't be refunded once performed; tell us within 48 hours if something isn't right. I have read this.",true);
  h.init('My deposit is non-refundable, and arriving late may shorten my service at the full price.',
    "I'll tell you about health changes, and reschedule if I have lice or a contagious scalp condition.");
  h.sig("By signing, I confirm I've read and agree to this policy, including the non-refundable deposit and health rules.");
});

// The six service consents share one shape, as on the printable pages.
function consent(id,name,{what,service,serviceAfter,riskHead,risks,note,extrasBefore,checks,extras,inits,consentTo}){
  form(id,name,h=>{
    h.name();h.st('Specialist');
    h.about('ABOUT THIS SERVICE',what);
    if(service&&!serviceAfter)h.mc("Today's service",service,true);
    h.risks(riskHead,risks,note);
    (extrasBefore||[]).forEach(x=>x(h));
    h.ci('Quick health and scalp check: check anything that applies to you.',checks);
    h.lt('If you checked anything, tell us more');
    if(service&&serviceAfter)h.mc("Today's service",service,true);
    (extras||[]).forEach(x=>x(h));
    h.init(...inits);
    h.sig(consentTo);
  });
}
const AGE='By signing, I confirm I am 18 or older (or have parent or guardian consent per our policy and local law), have read this form, had my questions answered, and consent to ';
const PHOTO_PRIV='Scalp images are part of my private record. Social media use only with my separate OK.';
const PHOTO_OK='Before and after scalp photos for my private record are OK. Social media use only with my separate OK.';
const NODIAG="My specialist doesn't diagnose scalp conditions and may suggest I see a dermatologist.";

consent('hd-ritual-consent','Head spa ritual consent',{
  what:[['What it is','Microscope scalp analysis, double cleanse, massage, mask and a warm water cascade.'],['What to expect','About 60–90 minutes lying back, neck supported. Pressure is set to you and never painful.'],['How long results last','A fresh, light scalp for several days. Many clients rebook every 2–4 weeks. Results vary.']],
  service:['Full ritual','Analysis only','Add steam','Neck & shoulders','Blow-dry'],
  riskHead:'POSSIBLE EFFECTS',
  risks:['Light tingling or warmth from products or massage','Extra shedding of hairs that were already loose','Lightheadedness when you sit up after lying back','Water or product reaching the eyes or ears','Mild redness for a few hours afterward','Product reaction: itching, redness or rash','Tender neck or scalp muscles for a day','Color fade if hair was colored very recently'],
  checks:['Head lice, ringworm or sores','Scalp surgery or transplant','Neck or spine problems','High blood pressure or heart','Psoriasis, eczema or dermatitis','Color or chemicals in 72 h','Dizziness, vertigo or past stroke','Allergy: fragrance, oils, nuts','Sunburned or broken scalp','Botox or fillers in 2 weeks','Migraine or frequent headaches','Pregnant or breastfeeding'],
  extras:[h=>h.ss('ABOUT LYING BACK. Your neck rests on a padded support or a flat head spa bed, never tilted sharply back. Feel dizzy, see spots or feel numbness? Tell me; we stop and sit you up slowly. Sudden severe headache, slurred speech or face drooping: we call 911.',['Extra neck support','Standard is fine'],true)],
  inits:["I've shared my full health, medication and allergy history, including neck problems and recent hair services.",'I understand the possible effects above. This is relaxing cosmetic care, not a medical treatment.',"I'll speak up right away if water feels too hot, pressure too firm, or I feel dizzy or unwell.",NODIAG,'Results depend on my scalp, hair and home care. No hair growth result is promised.',"Blow-drying is offered only if my specialist's license allows it where we are.",PHOTO_PRIV,'Fees follow {business} policy, including deposits, late arrival and cancellation.'],
  consentTo:AGE+'the head spa service I checked above.'});

consent('hd-exfoliation-consent','Scalp exfoliation consent',{
  what:[['What it is','A deep cleanse that lifts flakes, oil and buildup with a scrub, enzyme or clay suited to your scalp.'],['What to expect','About 45–75 minutes with gentle pressure and a thorough rinse. Tingling is normal; pain is not.'],['How long results last','A fresher, clearer scalp for about 1–2 weeks. Most clients repeat every 2–4 weeks.']],
  service:['Fine scrub','Enzyme','Clay mask','Patch test','Add massage','Add steam'],
  riskHead:'POSSIBLE EFFECTS',
  risks:['Tingling or warmth while the product works','Dryness or tightness for a day or two','Stinging if skin is more sensitive than expected','Fine flaking as the scalp settles, usually brief','Redness for a few hours afterward','Product reaction: itching, rash or swelling','Extra shedding of hairs that were already loose','Color fade if hair was colored recently'],
  extrasBefore:[h=>h.yn('ABOUT TIMING AND PATCH TESTS. We never exfoliate broken, sunburned or inflamed skin, or within 72 hours of color, lightening, perms, relaxers or keratin. New products are patch tested first. I have read this.',true)],
  checks:['Head lice, ringworm or sores','Sunburned or peeling scalp','Scalp surgery or transplant','Allergy: fragrance, botanicals','Psoriasis or eczema flare','Cuts, scratches or broken skin','Retinoid or acne medication','Neck problems or dizziness','Seborrheic dermatitis flare','Color or chemicals in 72 h','Past reaction to scalp products','Pregnant or breastfeeding'],
  inits:["I've shared my full health, medication and allergy history, including recent color or chemical services.",'I understand the possible effects above. Exfoliation is cosmetic care, not a medical treatment.',"I'll speak up right away if anything burns, stings strongly or feels too firm, or I feel unwell.",'I agree to a patch test for new products. My service may be changed or rescheduled if needed.',NODIAG,"I'll follow my aftercare, including no color or chemical services for 48 hours.",PHOTO_PRIV,'Fees follow {business} policy. Results vary, and no hair growth result is promised.'],
  consentTo:AGE+'scalp exfoliation with the product named in my record.'});

consent('hd-steam-consent','Steam & hydration consent',{
  what:[['What it is','A scalp facial: a gentle cleanse, warm steam to soften buildup, then a hydrating mask.'],['What to expect','About 60–75 minutes on a padded bed. The steam feels warm and misty, never hot.'],['How long it lasts','Your scalp and hair feel softer for a few days. Visits every 4 weeks help keep things balanced.']],
  service:['Steam scalp facial','Hydrating mask','Conditioning','Scalp massage','Blow-dry'],serviceAfter:true,
  riskHead:'POSSIBLE RISKS AND SIDE EFFECTS',
  risks:['Warmth, flushing or brief light-headedness from heat','Temporary redness or tingling on the scalp','Neck or shoulder discomfort from lying back','Fresh hair color may fade slightly with heat','Burn or scald if steam is too close or too hot','Reaction to the mask, conditioner or fragrance','Rarely, dizziness when lying back at the bowl','Breakouts along the hairline from rich products'],
  note:'This is a relaxing cosmetic service. It does not diagnose or treat scalp conditions or hair loss, and results vary.',
  checks:['High blood pressure','Heat sensitivity or fainting','Neck or spine problems','Sores, rash or sunburn','Color or perm in 72 hours','Heart condition','Asthma or breathing issues','Dizziness or vertigo','Psoriasis or dermatitis','Botox or fillers in 2 weeks','Pregnant or breastfeeding','Migraine or headaches','Scalp surgery or transplant','Head lice or scalp infection','Fragrance or botanical allergy'],
  inits:["I've shared my full health history honestly, including blood pressure, heart, pregnancy and allergies.",'I understand the risks above. This is a cosmetic service, not medical treatment, and results vary.',"I'll tell my specialist right away if the steam feels too hot, or if I feel dizzy, faint or unwell.","I'll speak up about any neck or shoulder discomfort so my position can be adjusted.",NODIAG,"I'll follow my aftercare, including no hot tools, saunas or steam rooms for the rest of the day.",PHOTO_OK,'Fees follow {business} policy, including deposits and 24–48 hour cancellation.'],
  consentTo:AGE+'the steam and hydration scalp facial checked above.'});

consent('hd-hot-oil-consent','Hot oil & massage consent',{
  what:[['What it is','Warm oil massaged into your scalp, then a neck and shoulder massage. Aromatherapy or fragrance-free.'],['What to expect','About 45–60 minutes. Oil rests under a warm towel 10–20 minutes, then is rinsed out.'],['How long it lasts','Hair feels softer for a few days. Many clients book every 2–4 weeks to keep it that way.']],
  service:['Hot oil scalp treatment','Neck & shoulders','Shampoo out','Take home in hair'],
  riskHead:'POSSIBLE RISKS AND SIDE EFFECTS',
  risks:['Allergy to a nut, seed or botanical oil','A burn if oil is too hot (it is always tested first)','Hair feels heavy or oily until it is washed','Oil can stain clothing, towels or pillowcases','Irritation or a rash from essential oils','Muscle soreness after massage, usually gone in a day','Breakouts along the hairline or neck','Light-headedness when you sit up'],
  checks:['Nut or seed oil allergy','Neck, back or shoulder injury','High blood pressure or heart','Head lice or scalp infection','Fragrance or essential oil allergy','Dizziness, vertigo or past stroke','Sores, rash or sunburn','Botox or fillers in 2 weeks','Pregnant or breastfeeding','Migraine or headaches','Psoriasis or dermatitis','Blood thinners or bruise easily'],
  extras:[h=>h.ss('ABOUT YOUR OILS. Almond, coconut and argan come from nuts, so tell me about any nut allergy. Oils are decanted just for you, and essential oils are diluted to 1–2%.',['Aromatherapy blend','Fragrance-free'],true)],
  inits:["I've shared my full health history honestly, including any nut, seed, fragrance or essential oil allergy.",'I understand the risks above. This is a relaxing cosmetic service, not medical treatment.',"I'll tell my specialist right away if the oil feels too hot, or if anything itches, stings or burns.","I'll speak up about massage pressure and any neck or shoulder discomfort at any time.","If I take oil home in my hair, I'll wash it out within 24 hours. Oil can stain fabric.","I'll follow my aftercare, including staying out of strong sun while oil is on my scalp.",PHOTO_OK,'Fees follow {business} policy, including deposits and 24–48 hour cancellation.'],
  consentTo:AGE+'the hot oil and scalp massage service I checked above.'});

consent('hd-hf-consent','High-frequency scalp consent',{
  what:[['What it is','A glass comb or rake electrode glides over your scalp, giving a gentle, low-level electrical current.'],['What to expect','About 5–10 minutes of light tingling and buzzing. A fresh ozone smell is normal.'],['How long it lasts','Your scalp may feel fresh and clean for a few days. Often booked every 1–4 weeks.']],
  service:['High frequency','Add-on to ritual','Violet / argon','Orange / neon','Other'],
  riskHead:'POSSIBLE EFFECTS AND RISKS',
  risks:['Tingling, buzzing or a light snapping sound','Mild pinkness or warmth for a few hours','Brief headache or tension in some people','Irritation if skin is broken or inflamed','Small sparks if the electrode lifts off the skin','Dryness, especially on a dry or sensitive scalp','Burn risk with flammable products in the hair','Results vary. Hair regrowth is not promised'],
  extrasBefore:[h=>h.ss("Pacemaker, metal implants in head/neck, epilepsy or pregnancy? High frequency isn't safe for you. I'll gladly offer a scalp massage or LED session instead.",["Doesn't apply to me",'Not eligible today'],true)],
  checks:['Pacemaker or implanted device','Heart condition','Cuts, sores or scratches','Botox or fillers in 2 weeks','Migraines','Metal plates, pins or shunts','High blood pressure','Scalp infection or lice','Recent scalp surgery','Hairspray or alcohol product today','Epilepsy or seizures','Pregnant','Psoriasis or dermatitis flare','Color or chemicals in 72 hrs','Metal piercings or clips'],
  inits:["I've shared my full health history honestly, including implants, devices and medications.",'I have no hairspray, dry shampoo or alcohol-based product on my scalp or hair today.',"I've removed my jewelry, hair clips and pins, and I'll keep my hands off metal surfaces.",'I understand tingling, buzzing and an ozone smell are normal, and the setting starts low.',"I'll speak up right away if anything stings, feels hot, or I feel dizzy or unwell.","I understand this is a cosmetic service. It doesn't diagnose or treat hair loss or disease.",PHOTO_OK,"Deposits and fees follow {business} policy. I'll tell you about any health changes."],
  consentTo:AGE+'a high-frequency scalp treatment and the services checked above.'});

consent('hd-led-consent','LED light scalp consent',{
  what:[['What it is','Low-level red (about 630–660 nm) or blue (about 415 nm) light on a clean scalp, per our device.'],['What to expect',"About 10–20 minutes of relaxing, painless light. You'll wear eye protection throughout."],['How long it lasts','Light works best as a series: 8–12 sessions, 1–2 times a week, per our policy.']],
  service:['Red light','Blue light','Add-on to ritual','Series'],serviceAfter:true,
  riskHead:'POSSIBLE EFFECTS AND RISKS',
  risks:['Gentle warmth on the scalp during the session','Eye strain or glare without eye protection','Redness if on a light-sensitizing medicine','Results vary from person to person','Mild pinkness or tightness for a few hours','Brief headache in light-sensitive people','Dryness, especially on a dry or sensitive scalp','Hair regrowth is not promised'],
  note:'A 2022 review of 7 trials found light therapy raised hair density in pattern hair loss vs sham devices.',
  checks:['Light-triggered epilepsy','Antibiotics (some types)','Other light-sensitizing medicine','Skin cancer history','Open sores or scalp infection','Light-triggered migraine','Retinoids, oral or topical','Lupus or light sensitivity','New or changing scalp spot','Psoriasis or dermatitis flare','Pregnant',"St John's wort",'Eye condition or recent eye surgery','Sunburned scalp','Using a home light device'],
  extras:[h=>h.st('Series: which session of how many')],
  inits:["I've shared my full health history honestly, including every medicine and supplement I take.","I'll keep the eye protection on for the whole session and won't look directly at the light.",'I understand this is a cosmetic service. Results vary and hair regrowth is not promised.',"I'll speak up right away if I feel heat, discomfort, a headache, or the light bothers me.","If a scalp spot looks unusual, I'll be asked to see a dermatologist. No diagnosis is given here.","I'll tell you before each session if I start a new medicine, become pregnant or my health changes.",'Deposits, series and package fees follow {business} policy.',PHOTO_OK],
  consentTo:AGE+'LED light scalp therapy as checked above.'});

// ---- guides (aftercare & prep handouts) ----
const CALL='Questions? Text {phone|me} · {business}';
const P=['headspa'];
const guides=[
 {id:'g-hd-ritual',icon:'💆',title:'After your head spa ritual',cat:'Aftercare',profs:P,tips:[
  'Your scalp is cleansed, rinsed and calm. A few easy habits keep it feeling fresh, light and balanced until your next visit.',
  'Today (fresh and light). Normal: scalp feels light and clean; slight pinkness or tingling for a few hours. Do: rest and sip water if you like; sit or stand up slowly if you feel lightheaded. Avoid: heavy styling products, tight hairstyles and hot tools close to the scalp.',
  'Days 1–2 (settling in). Normal: a few extra hairs at your next wash. They were already loose and ready to shed. Do: gentle shampoo and lukewarm water; brush gently, working up from the ends. Avoid: color or chemical services, very hot showers, saunas and scratching.',
  'Weeks 1–2 (enjoy it). Normal: less buildup and a scalp that feels balanced between washes. Do: wear a hat or scalp sunscreen outdoors; keep up your home routine. Avoid: harsh scrubs, piled-on dry shampoo and leaving sweat in after workouts.',
  "Next visit (in 2–4 weeks). Normal: oil and buildup return gradually. That's your scalp's natural rhythm. Do: book your next ritual; tell me about new medications, allergies or hair services. Avoid: waiting until itching or flaking builds up before your next cleanse.",
  'Good to know: head spa is relaxing care, not a medical treatment; massage can leave your neck a little tender for a day; use fingertips, not nails, when you shampoo; scalp care works best as a regular routine; your part and crown burn easily, so cover them in the sun; wait 48 h before color to keep your scalp calm; blot with a soft towel instead of rubbing; persistent itch, flakes or hair loss: see a dermatologist.',
  "Go gentle: lukewarm water and a mild shampoo. Fingertips only: massage, don't scratch. Cover up: hat or scalp SPF outdoors. Rebook: every 2–4 weeks feels best.",
  "Call me right away if you notice: burning, stinging or itching that won't settle; blisters, or a rash that spreads; hives, a rash or swelling on scalp, face or neck; dizziness or a new headache that doesn't ease.",
  'Sudden severe headache, slurred speech, face drooping or one-sided weakness: call 911.',CALL]},
 {id:'g-hd-exfoliation',icon:'✨',title:'After your scalp exfoliation',cat:'Aftercare',profs:P,tips:[
  'Your scalp has had a deep cleanse, so it may feel a little more sensitive for a day or two. These easy habits keep it calm and comfortable.',
  'Today (fresh skin). Normal: light tingling, slight redness or warmth for a few hours afterward. Do: leave your scalp product-free; sit or stand up slowly if you feel lightheaded. Avoid: heavy styling products, dry shampoo, hot tools and scratching.',
  'Days 1–2 (be gentle). Normal: a little dryness, tightness or fine flaking as your scalp settles. Do: gentle shampoo and lukewarm water; pat dry; brush softly. Avoid: color, lightening, perms, relaxers or keratin; scrubs, saunas and hot tubs.',
  'Week 1 (clear and clean). Normal: less buildup, cleaner roots and hair that feels lighter. Do: scalp sunscreen or a hat outdoors; freshly exfoliated skin burns faster. Avoid: home scrubs or exfoliating shampoos, unless I suggested one for you.',
  'Next visit (in 2–4 weeks). Normal: buildup returns slowly. Regular cleanses keep it in check. Do: book your next session; tell me about new medications or hair services. Avoid: booking color or chemical services right before your appointment.',
  'Good to know: wait at least 48 h before color or chemicals; feeling dry? A light scalp serum helps; swimming? Rinse out chlorine or salt water soon after; results vary, this is cosmetic care, not medical; your part and crown burn easily, so cover them in the sun; use fingertips, not nails, when you wash; over-exfoliating irritates, less is more; persistent itch, redness or hair loss: see a dermatologist.',
  'Go gentle: mild shampoo, lukewarm water. Skip color: no chemical services for 48 h. Sun smart: hat or scalp SPF outdoors. Hands off: no scratching or picking flakes.',
  "Call me right away if you notice: burning or stinging that doesn't settle; blisters, oozing or crusting; hives, a rash or swelling on scalp, face or neck; redness that spreads or lasts past 48 h.",
  'Pain, heat, pus or a fever: see your doctor. Swelling of the face or throat, or trouble breathing: call 911.',CALL]},
 {id:'g-hd-steam',icon:'💧',title:'Caring for your hydrated scalp',cat:'Aftercare',profs:P,tips:[
  'Warm steam and a hydrating mask leave your scalp softer and your hair more conditioned. A few gentle habits over the next few days help that fresh, balanced feeling last.',
  'Today (rest of the day). Normal: your scalp feels soft and a little warm; light pinkness fades within a few hours. Do: air-dry or use a cool setting; relax, and sip water if you like. Avoid: hot tools, saunas, steam rooms, hot tubs and hard workouts.',
  'Days 1–2 (settling). Normal: hair feels softer; a few already-loose hairs shed at your next wash. Do: gentle shampoo and lukewarm water; brush slowly with a soft brush. Avoid: heavy styling products; color or chemical services for 48 hours.',
  'Days 3–7 (everyday care). Normal: your scalp settles back into its usual oil balance. Do: wear a hat or scalp sunscreen in strong sun; keep washes gentle. Avoid: very hot showers on your scalp; scratching with your nails.',
  'Next visit (every 4 weeks). Normal: buildup and dryness slowly return between visits. Do: book your next steam facial and tell me about any changes. Avoid: waiting too long if your scalp feels tight or itchy.',
  "Good to know: steam softens buildup, it isn't a detox; lukewarm water is kindest to your scalp; light-headed? Sit down and sip some water; heat can fade fresh color a little; some shedding at your next wash is normal; I'll refer you to a dermatologist if needed.",
  'Keep it cool: air-dry or a cool setting today, no hot tools. Go gentle: soft brush, mild shampoo, lukewarm water. Cover up: a hat or scalp sunscreen in strong sun. Stay on track: visits every 4 weeks keep it balanced.',
  "Call me right away if you notice: burning, blistering or a sore spot on your scalp; hives or swelling at your hairline or face; redness, itching or a rash that spreads; dizziness or a new headache that doesn't settle.",
  'For a burn, run cool water over it for 20 minutes, then call me. Severe headache, facial droop, slurred speech or trouble breathing: call 911.',CALL]},
 {id:'g-hd-hot-oil',icon:'🫒',title:'After your hot oil treatment',cat:'Aftercare',profs:P,tips:[
  "Warm oil and massage leave your scalp nourished and your shoulders relaxed. Here's what to expect over the next day or two, and how to keep your scalp comfortable.",
  'Today (just after). Normal: hair may feel heavy or oily; shoulders may feel loose or a little tender. Do: rest, and sip water if you like; sit and stand up slowly after lying back. Avoid: strong sun on an oiled scalp; hot tools on oily hair.',
  'If left in (take-home oil). Normal: hair looks darker and slick until it is washed. Do: wash it out within 24 hours; put an old towel on your pillow. Avoid: your best pillowcase; styling products on top of the oil.',
  'First wash (days 1–2). Normal: you may need two shampoos to lift the oil; a few loose hairs shed. Do: lukewarm water; shampoo the scalp twice; condition the ends only. Avoid: very hot water or rough towel-drying.',
  'Next visit (every 2–4 weeks). Normal: dryness and tension slowly return between sessions. Do: book your next treatment and tell me about any reactions. Avoid: trying new oils at home without a patch test.',
  "Good to know: heavy hair for a day is normal and washes out; warm oil softens and conditions, it isn't a detox; found a nut or fragrance allergy later? Tell me; oil can stain fabric, so a dark top or scarf helps; light soreness after massage usually fades in a day; ongoing itching or flaking: see a dermatologist.",
  'Wash within 24 h: took oil home? Shampoo it out by tomorrow. Shade your scalp: a hat or shade while oil is on your scalp. Protect fabric: an old towel on your pillow tonight. Go slow: sit up and stand slowly after lying back.',
  "Call me right away if you notice: itching, hives or a rash on your scalp, face or neck; swelling around your hairline, eyes or lips; burning, a blister or a sore red spot; neck pain, dizziness or a headache that won't settle.",
  'Swelling of the lips, face or throat, or trouble breathing: call 911. A rash that spreads or lasts: see your doctor or a dermatologist.',CALL]},
 {id:'g-hd-hf',icon:'⚡',title:'After high frequency',cat:'Aftercare',profs:P,tips:[
  "Your scalp may feel fresh, clean and lightly tingly. Here's what to expect and how to care for your scalp until your next visit.",
  'Today (first hours). Normal: light tingling, warmth or slight pinkness for a few hours; a faint ozone smell in your hair. Do: leave your scalp product-free if you can; brush gently with a soft brush. Avoid: heavy styling products, hairspray and dry shampoo; scratching your scalp.',
  'Days 1–2 (settling in). Normal: scalp feels clean and calm; a dry or sensitive scalp may feel a little tight. Do: gentle shampoo, lukewarm water; a light, fragrance-free scalp serum if dry. Avoid: hot tools on the roots, very hot showers, and color or chemical services.',
  'Week 1 (everyday care). Normal: oil and buildup slowly return to your usual rhythm. Do: wash as often as your scalp needs; hat or scalp sunscreen outdoors. Avoid: harsh scrubs, picking at flakes, and tight styles that pull at the roots.',
  '1–4 weeks (next visit). Normal: results are gradual and vary from person to person. Do: book your next visit; tell me about any new implant, pregnancy or medicine. Avoid: home high-frequency wands without guidance, especially with product in your hair.',
  "Good to know: the ozone smell fades by your next wash; arrive next time with clean, product-free hair; drink water if you like, it's for comfort, not detox; ongoing itching or flaking? See a dermatologist; a few loose hairs at the next wash are normal; leave jewelry and hair clips at home next visit; this is a cosmetic service, regrowth isn't promised; a new or changing scalp spot should be checked.",
  'Go gentle: soft brush, light hands, no scratching. Keep it light: skip heavy products today. Lukewarm: cooler water is kinder to your scalp. Wait on color: give it 24–48 hours first.',
  "Call me right away if you notice: burning, blisters or a sore spot on your scalp; hives, swelling or an itchy rash; redness that lasts beyond a day or spreads; dizziness or a headache that doesn't settle.",
  'Blistering or a burn that worsens: please see a doctor. Sudden severe headache, slurred speech, facial droop or weakness: call 911.',CALL]},
 {id:'g-hd-led',icon:'💡',title:'After LED light therapy',cat:'Aftercare',profs:P,tips:[
  "Light therapy is gentle and there's no downtime. A few simple habits help your scalp between sessions in your series.",
  "Today (first hours). Normal: gentle warmth or slight pinkness for an hour or two; most people notice nothing. Do: carry on as usual; hat or scalp sunscreen if you're outdoors. Avoid: long sun exposure on your scalp, tanning beds and very hot showers.",
  "Between sessions. Normal: no visible change yet; light works slowly over a series. Do: gentle shampoo, lukewarm water; keep your scalp clean and product-light. Avoid: skipping sessions; new medicines you haven't mentioned.",
  'Mid-series (sessions 4–8). Normal: some notice a healthier-feeling scalp; others, little change. Do: compare photos with me; brush gently and keep up your scalp routine. Avoid: harsh scrubs, tight styles that pull at roots, and scratching your scalp.',
  "Series end (review). Normal: results vary from person to person; regrowth isn't promised. Do: review photos together and plan upkeep sessions. Avoid: expecting quick results; ongoing hair loss needs a dermatologist.",
  "The evidence: a 2022 review of 7 trials found light therapy raised hair density in pattern hair loss vs sham devices. Results vary, so regrowth isn't promised.",
  "Good to know: red light is about 630–660 nm, blue about 415 nm; arrive with clean, product-free hair each time; home devices vary, ask me before adding one; some antibiotics and retinoids raise light sensitivity; St John's wort can also raise light sensitivity; a new or changing scalp spot should be checked.",
  'Stay steady: regular sessions matter more than any one. Shade it: a hat or scalp sunscreen outdoors. Tell me first: new medicine or pregnancy. Be gentle: soft brush, lukewarm water, no scratching.',
  "Call me right away if you notice: burning, blisters or a rash on your scalp; eye pain or vision changes after a session; redness that lasts beyond a day or spreads; a headache or migraine that doesn't settle.",
  'Blisters, hives or a spreading rash: please see your doctor. Eye pain or changes in your vision: see a doctor the same day.',CALL]},
 {id:'g-hd-prep',icon:'📅',title:'Before your head spa',cat:'Pre-care',profs:P,tips:[
  'For every head spa and scalp treatment. A little prep keeps you comfortable and helps us get the most from your visit.',
  "1 week before: planning color or a perm? Leave 72 hours between any chemical service and your visit. Hair extensions? Tell me when you book. Booking LED? List medicines that make you light-sensitive (some antibiotics, retinoids, St John's wort). Neck problems, vertigo or dizziness at a shampoo bowl? Tell me first.",
  '48 hours before: skip heavy styling products, dry shampoo and hair oils so your scalp shows clearly. No scrubs or exfoliants at home, and try not to scratch. Booking high frequency? No hairspray or alcohol-based products on the day. Check your scalp for sunburn, sores or anything new.',
  'Day of your appointment: come with dry hair, washed or unwashed, as you like. Wear comfortable clothes with a loose neckline. Remove earrings and hair clips before we start, or leave them home. Light makeup or none is best; it may smudge.',
  "Scalp analysis: a small camera shows your scalp up close on screen; I photograph the same 4–6 zones to track progress; images stay private, shared only with your consent; we talk through what we see. It's not a diagnosis.",
  'Lying back: you rest on a head spa bed or padded bowl with your neck supported; tell me right away if your neck strains or you feel dizzy; I sit you up slowly at the end; too warm or cool? Just say.',
  'After your visit: hair may be damp or oily, so bring a hat or hair tie; makeup near your hairline may smudge; allow 60–90 minutes in total; plan a calm, unhurried hour after.',
  "Please text to reschedule if you have: head lice or nits; open sores, cuts or a sunburned scalp; a color or chemical service in the last 72 hours; ringworm or a scaly, itchy patch; a fever, cold or flu, or feel unwell; a psoriasis or eczema flare (tell me first). I ask for 24 hours' notice. If it's about your health or safety, just text. We'll find a new time together.",
  "Pregnant? It's not an automatic no. I'll adjust your position for comfort, keep essential oils minimal and skip high frequency. High blood pressure or a heart condition? I'll keep heat and steam gentle. Tell me and we'll plan together.",CALL]},
 {id:'g-hd-guide',icon:'🧴',title:'Your scalp care guide',cat:'Aftercare',profs:P,tips:[
  "A calm, healthy scalp is the base for healthy-looking hair. Here's how to care for it between visits, how long results last and when to call me.",
  'Daily routine (wash, rinse, massage). Gentle shampoo: every 1–3 days, or as often as your scalp type needs. Lukewarm water: hot water dries and irritates; rinse until the water runs clear. Fingertip massage: 2–3 minutes with your fingertips, never your nails. Brush gently: a soft or wide-tooth brush, working from ends to roots.',
  'Protect (sun, tension & heat). Sun: a hat or scalp sunscreen, especially along your part. Loose styles: tight ponytails, braids and buns pull on roots, so vary your style. Heat: use a heat protectant and a lower setting; keep tools moving. Hands off: try not to scratch or pick at flakes; it inflames the scalp.',
  'How long it lasts, with good home care. Head spa ritual: your scalp feels fresh for about 3–7 days. Exfoliation: buildup stays clear for about 2–4 weeks. Steam and hot oil: hydration lasts about 1–2 weeks. High frequency and LED: best as a series of 6–8 visits, 1–2 weeks apart.',
  'First 24 hours: no heavy styling products; no color or chemicals for 24–48 h. Buildup: a clarifying shampoo weekly or monthly clears residue. Results vary: no head spa service treats hair loss or regrows hair.',
  'Rebook on time: every 4–6 weeks keeps things balanced. Track progress: we compare camera images at each visit. Healthy scalp: calm, even color, little flaking, no itch. Ask first: trying a new product? Text me first.',
  'This is normal: light tingling or warmth for a few hours; slight redness that fades the same day; extra shedding of already-loose hairs at a wash; hair a little heavy or oily for a day after oil; feeling relaxed, sleepy or a little lightheaded; mild dryness for a day or two after exfoliation.',
  "Call me or see a dermatologist if you notice: burning, blisters, hives, swelling or a spreading rash; persistent itching with redness, or scaly patches; sores, crusting or tender bumps that don't heal; sudden or patchy hair loss; bumps or moles that bleed, grow or change; dizziness or a new headache that doesn't settle.",
  "Call 911 for trouble breathing, a swollen face or throat, slurred speech or sudden weakness. Product in your eye? Flush with water for 15 minutes, then get urgent care. I care for your scalp, but I don't diagnose. Hair loss or a scalp that won't settle needs a dermatologist.",CALL]},
];
// sanity: no brackets left, no card-on-file question, no "email photos", no em dashes
const all=JSON.stringify(forms)+JSON.stringify(guides);
const left=all.match(/\[[A-Za-z$0-9_ ][^\]]{0,40}\]/g);
if(left){console.error('PLACEHOLDERS LEFT:',left);process.exit(1);}
const strs=[];(function walk(v){if(typeof v==='string')strs.push(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk);})([forms,guides]);
if(strs.some(x=>/[\[\]]/.test(x))){console.error('BRACKET LEFT',strs.filter(x=>/[\[\]]/.test(x)));process.exit(1);}
if(/card on file|card saved|credit card|booking system/i.test(all)){console.error('CARD-ON-FILE TEXT LEFT');process.exit(1);}
if(/email (me |us )?(your )?photos/i.test(all)){console.error('EMAIL-PHOTOS TEXT LEFT');process.exit(1);}
if(/\btick/i.test(JSON.stringify(forms))){console.error('"TICK" IN CLIENT WORDING');process.exit(1);}
if(/—/.test(all)){console.error('EM DASH LEFT');process.exit(1);}
if(/your business name|\{website\}|website\]/i.test(all)){console.error('BUSINESS PLACEHOLDER LEFT');process.exit(1);}
Object.keys(forms).forEach(k=>{if(!/^hd-/.test(k))throw new Error('bad form id '+k);const ids=forms[k].qs.map(q=>q.id);if(new Set(ids).size!==ids.length)throw new Error('dup q id '+k);
  forms[k].qs.forEach(q=>{if((q.type==='Single select'||q.type==='Multiple choice')&&!(q.options&&q.options.length>1))throw new Error('options '+q.id);if(q.type==='Contraindications'&&!(q.items&&q.items.length))throw new Error('items '+q.id);});
  if(!forms[k].qs.some(q=>q.type==='Signature'))throw new Error('no signature '+k);});
guides.forEach(g=>{if(!/^g-hd-/.test(g.id))throw new Error('bad guide id '+g.id);});
process.stdout.write('const HD_FORMS='+JSON.stringify(forms,null,0).replace(/\},"hd-/g,'},\n"hd-')+';\nconst HD_GUIDES='+JSON.stringify(guides).replace(/\},\{"id"/g,'},\n{"id"')+';\n');
console.error('forms',Object.keys(forms).length,'questions',Object.values(forms).reduce((a,f)=>a+f.qs.length,0),'guides',guides.length);
