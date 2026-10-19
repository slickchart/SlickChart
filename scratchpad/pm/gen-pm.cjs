// The PMU Collection (Ashley, 2026-10-19) -> app forms + guides, written from her PDF text.
// Same rules as the Esthetician, Lash & Brow and Hair Stylist Collections (CLAUDE.md §1e): placeholders
// resolved to the PDF's own defaults so clients never see brackets; business name/phone become
// {business}/{phone|...}; artist-only boxes (office use, photo ID checked, products tested, patch test
// readings, artist signatures) stay on the printable record; no card-on-file question.
//   node scratchpad/pm/gen-pm.cjs > scratchpad/pm/pm-data.js
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

form('pm-intake','PMU client intake & health history',h=>{
  h.st('Full name',true);h.dob();h.st('Mobile phone');h.st('Email');h.st('Address');
  h.st('Emergency contact & relationship');h.st('Their phone');h.st('How did you hear about us?');
  h.ss('Best way to reach you',['Text','Email','Call']);h.yn('OK to text you reminders?');
  h.mc('Which service are you booking? Check all that apply',['Microblading','Powder / combo brows','Lip blush','Eyeliner / lash line','Saline tattoo removal','Scalp micropigmentation','Areola restoration','Faux freckles'],true);
  h.yn('Have you had PMU or a tattoo in this area before?');
  h.st('If yes: who, when, how many sessions');
  h.st('Pigment brand / color, if known');
  h.ss('Photos of it?',['Yes','No','Had removal']);
  h.lt('What would you love your brows, lips or eyes to look like? Anything you want to avoid?');
  h.ci('Health history. Some answers mean a waiting period or your doctor\'s OK first. Your answers stay confidential. Check anything that applies to you.',[
    'Pregnant, trying to conceive, or breastfeeding','Keloids or raised, thick scars','Bleeding disorder, or you bruise easily','Prescription blood thinners',
    'Isotretinoin (Accutane) in the past 12 months','Retinol, retinoids or acids used near the area','Botox or filler near the area in the past 4 weeks',
    'Peel, laser or microneedling there in past 4 weeks','Cold sores or fever blisters (ever)','Diabetes',
    'Autoimmune condition or immunosuppressants','Chemotherapy or radiation, now or in the past year','Heart condition, heart valve issue or pacemaker',
    'Epilepsy, seizures or fainting','Psoriasis, eczema, acne or rash in the area','Sunburn, tanning or self-tanner in the past 2 weeks',
    'Lash or brow growth serum in the past 3 months','Glaucoma, eye surgery or LASIK; contact lenses','Allergy to pigment, numbing cream, metal or latex',
    'Any other medical condition or recent surgery']);
  h.lt('If you checked anything, please explain (dates, medication, doctor)');
  h.mc('Are you allergic or sensitive to any of these? Check all that apply',['Tattoo or PMU pigments','Red dyes or carmine','Hair dye (PPD)','Numbing creams (lidocaine, etc.)','Epinephrine','Nickel or other metals','Latex','Petroleum or balms','None that I know of']);
  h.st('Reaction you had, and to what');
  h.lt('All medications you take, including prescriptions and birth control');
  h.ci('Taken in the past 7 days? Never stop a prescribed medication, including blood thinners or daily aspirin, without your doctor\'s OK.',['Aspirin or ibuprofen','Fish oil','Vitamin E','Ginkgo','Niacin']);
  h.ss('Skin type',['Dry','Normal','Combination','Oily']);
  h.yn('Large pores in the area? Oily skin or large pores can blur microblading strokes within weeks; powder brows may suit you better.');
  h.ss('Sun exposure',['Low','Moderate','High']);h.ss('Heavy sweating',['Rarely','Weekly','Daily']);
  h.yn('Swim or hot tub');h.yn('Smoke or vape');h.yn('Retinol or acids on face daily');
  h.st('Trips or events in the next 4 weeks');
  h.init('My answers are true and complete. I\'ll tell you before every visit if my health, medications or skincare change.',
    'Results vary with skin type, sun, skincare and healing. No exact result or color has been promised.',
    'PMU is a process. A perfecting touch-up is usually needed 6 to 10 weeks after the first session.',
    'I\'ll follow my aftercare instructions. Skipping them can cause infection, scarring or poor color retention.',
    'I\'ll keep to the waiting periods that apply to me and get my doctor\'s clearance if asked.',
    'Before and after photos will be taken for my client record.',
    'I am 18 or older and will show a valid government photo ID.');
  h.yn('YOUR PRIVACY. Your information is kept confidential, stored securely and used only to provide your services. It is never shared without your written consent unless the law requires it. Records are kept 7 years. I have read this.',true);
  h.sig();
});

form('pm-brow-design','Brow mapping & design approval',h=>{
  h.name();h.st('Artist');
  h.st('Client\'s right brow (mm from center): start, arch, tail, arch height, start width, tail height');
  h.st('Client\'s left brow (mm from center): start, arch, tail, arch height, start width, tail height');
  h.ss('Shape',['Natural','Soft arch','Straight','Lifted','Other']);
  h.ss('Technique',['Microblading','Powder / ombré','Combo (strokes + shading)']);
  h.ss('Look',['Soft and natural','Medium','Bold and defined']);
  h.ss('Fitzpatrick',['I','II','III','IV','V','VI']);h.ss('Undertone',['Cool','Neutral','Warm']);
  h.st('Pigment brand · color name · lot # · expiry · mix / ratio');
  h.yn('CLIENT APPROVAL. I\'ve seen this design drawn on my face and checked it in the mirror. I approve the shape, placement, thickness and color. I understand healed color is usually softer than on day one, natural faces aren\'t perfectly symmetrical, and a shape can be refined later but not easily made smaller or thinner.',true);
  h.mc('Before we start',['Before photos taken','Design photo taken','Patch test done or waived']);
  h.sig('Client signature');
});

form('pm-consent','General PMU consent',h=>{
  h.name();h.dob();h.lt('Procedure(s) I\'m consenting to',true);
  h.about('ABOUT PERMANENT MAKEUP',[['What PMU is','Pigment placed in the upper layers of skin with a needle or blade. It fades over 1 to 5 years and needs color boosts.'],['What to expect','Redness and swelling for a few days, then flaking. Color looks dark at first, then lighter, then settles over 4 to 8 weeks.'],['Numbing','A topical numbing cream may be used where local rules allow. Most clients feel scratching or pressure.']]);
  h.risks(['Infection: rare with sterile tools and good aftercare, watch for spreading redness, heat, pus or fever','Allergic reaction: to pigment, numbing cream or balm, which can be delayed, appearing months or years later','Uneven or asymmetric results: skin heals unevenly, and some areas may need a touch-up to even out','Color change over time: pigment fades and can shift cooler, ashy, pink or warm with sun and skincare','Migration or blurring: pigment can spread beyond the lines, more often on oily or thin skin','Scarring: raised or textured skin, more likely if you form keloids or pick scabs','Granuloma: firm bumps that can form around pigment weeks or months later','Koebner reaction: psoriasis, vitiligo or lichen planus may flare in the treated skin','Swelling, redness, bruising: common for a few days, and lips and eyes swell more','Removal is hard: lightening or removal takes several sessions and can leave marks'],
    'MRI: iron oxide pigments can rarely cause warmth or swelling in the area during an MRI. Tell your radiologist you have PMU. Never skip an MRI because of it. Laser treatments near PMU can darken the pigment, so tell any laser provider too. Results depend on your skin type and tone, oiliness, age, health, medications, sun exposure, skincare and how closely you follow aftercare. Most clients need a perfecting touch-up 6 to 10 weeks later.');
  h.init('I\'ve read the risks above and had my questions answered. No specific result has been promised to me.',
    'My health history is true. I\'m not pregnant or breastfeeding, and I\'ve listed all my medications.',
    'I understand PMU is semi-permanent, fades unevenly, and needs a touch-up and future color boosts.',
    'I approved my design and color before the procedure started.',
    'I\'ll follow aftercare and contact you, and a healthcare provider, if signs of infection or allergy appear.',
    'I\'ve been offered a patch test and either completed it or signed the patch test waiver.',
    'I understand removal or correction, if ever needed, costs extra and may take several sessions.',
    'I release {business} from claims caused by details I didn\'t share or aftercare I skipped, as state law allows.',
    'I am 18 or older, not under the influence of alcohol or drugs, and signing of my own free will.');
  h.sig();
});

form('pm-patch-test','Patch test consent & record',h=>{
  h.name();h.st('Phone');h.st('Planned procedure');h.st('Known allergies or sensitivities');h.date('Appointment date');
  h.yn('ABOUT YOUR PATCH TEST. A tiny amount of the pigment and numbing product planned for you is placed on a small area, usually behind the ear or on the inner arm. Check it at 24 to 48 hours, and again at 7 days for a final check. A clear test lowers the risk of a reaction but can\'t rule one out: reactions to pigment can appear months or even years later. I have read this.',true);
  h.ss('Your choice',['I consent to this patch test','I decline the patch test'],true);
  h.yn('IF YOU CONSENT. If the spot burns, blisters, swells or itches badly, I\'ll wash it with cool water and call {phone|you}. If I have trouble breathing or swelling of the face or throat, I\'ll call 911.');
  h.yn('IF YOU DECLINE. I was offered a patch test and chose not to have one. I understand this means an allergy to the pigment or numbing product won\'t be found before my procedure, and that a reaction could need medical care, affect my results, or mean the pigment has to be removed. I accept these risks and release {business} from claims related to a reaction a patch test might have shown, as far as state law allows.');
  h.sig();
});

form('pm-photo','PMU photo & media release',h=>{
  h.name();h.st('Phone or email');
  h.yn('Clinical record: before, after and healed photos in my private file to plan and track my work. Never shared.',true);
  h.yn('Portfolio, before and after: shown on your website, in print or in a studio portfolio book to show your work.');
  h.yn('Social media: posted on your business social accounts, including short videos and reels.');
  h.ss('How much of my face may be shown (if yes to portfolio or social). I will see any image before it is posted.',['Cropped to the treated area','Full face visible']);
  h.yn('Testimonial, name or tag: you may quote my review, use my first name, or tag my social handle with my photos.');
  h.st('Name or handle to use (if yes above)');h.st('Limits (areas, platforms, dates)');
  h.yn('HOW YOUR PHOTOS ARE HANDLED. Areola photos stay in your record only and never show your face, unless you opt in separately in writing. Storage: taken on a business device and kept in our secure app, not a personal camera roll; record photos are kept with your file for 7 years. Changing your mind: tell me in writing (text or email is fine); I\'ll stop new use and remove posts I control within 7 days; printed items and others\' shares may be out of my reach. No payment: this release is voluntary; you won\'t receive payment, royalties or free services for photos or reviews. Honest images: photos aren\'t filtered or retouched to change results; same lighting and angle for before and after. Saying no never affects your care, and you can change your answers at any time. I have read this.',true);
  h.sig('By signing, I confirm my choices above. This release stays in effect until I change or withdraw it in writing.');
});

form('pm-policy','PMU booking & touch-up policy',h=>{
  h.name();h.date('Appointment date');
  h.yn('BOOKING POLICY. Permanent makeup takes careful planning, and your appointment is a long block reserved just for you. Deposit: $100, due at booking to hold your time; non-refundable and applied to your total. Notice to change: 48–72 hours, to move your appointment and keep your deposit. Grace period: 15 minutes; after that, we may need to reschedule. Rescheduling: with 48–72 hours\' notice, your deposit transfers once; a second change needs a new deposit. Deposit forfeited: for a no-show, a late change, or arriving with a health issue you didn\'t disclose (such as pregnancy, recent Botox, isotretinoin or sunburn) that means we can\'t safely proceed. Late arrival: after 15 minutes, the full service may not fit; we may reschedule, and the deposit is forfeited. Feeling unwell? Fever, cold or flu, or an active cold sore before lip work? Tell us as soon as you can and we\'ll reschedule with no fee. I have read this.',true);
  h.yn('TOUCH-UPS & RESULTS. Perfecting touch-up: included when booked within 6–10 weeks of your first session; not before 6 weeks, since your skin needs to fully heal. Later touch-ups: from 10 weeks to 6 months, at our touch-up rate; after 6 months, priced as a color boost or new service. Color boost: recommended every 12–18 months at 30–50% of the original price; after 2–3 years, full price. Another artist\'s work: consultation and photos first; priced as a correction, and may need lightening or removal before new work. Results: not guaranteed; skin type, oiliness, sun, skincare, medications and aftercare all affect how pigment heals and lasts. Refunds: PMU can\'t be refunded once performed; concerns about healing are assessed and addressed at your touch-up. I have read this.',true);
  h.sig('By signing, I confirm I\'ve read and agree to this policy, including the non-refundable deposit and touch-up timing.');
});

form('pm-touchup','Touch-up session form',h=>{
  h.name();h.st('Artist');h.st('Original service');h.date('Original date');h.st('Weeks since');
  h.ss('Healed result (artist assessment): retention',['90–100%','70–89%','50–69%','Under 50%']);
  h.mc('Patchy areas',['None','Front / head','Arch','Tail','Lip line / corners','Lash line','Other']);
  h.ss('Healed color',['As expected','Warm (red, orange)','Cool (grey, blue)','Too light','Too dark']);
  h.mc('Shape changes',['None','Thicker','Longer','Lift','Darker','Softer','Other']);
  h.ss('Skin notes',['Oily, strokes blurred','Scarring','Healed evenly']);
  h.ci('Health changes since your last visit. Check anything that applies to you.',[
    'New medications or supplements','Botox or filler near the area','Retinoids or acids on the area','Cold sore since your last visit','New allergies or diagnosis',
    'Pregnant, trying or breastfeeding','Sunburn, tanning or self-tanner','Laser, peel or microneedling nearby','Itching, bumps or swelling at the area','Picked or scratched while healing']);
  h.lt('If you checked anything, details');
  h.st('Plan for today: pigment brand · color, lot # · expiry, corrector if any');
  h.st('Needle · blade, numbing used, areas to work');
  h.yn('CLIENT ACKNOWLEDGMENT. My health answers above are true and complete. My original consent still applies. I understand that touch-up timing and pricing follow {business}\'s policy: my first perfecting session is included within 6–10 weeks, and later touch-ups are priced per policy. Results are not guaranteed, and some clients need more than one touch-up.',true);
  h.sig('Client signature');
});

// The eight treatment consents share one shape, as on the printable pages.
function consent(id,name,{head,what,risks,note,checksLabel,checks,design,inits,consentTo}){
  form(id,name,h=>{
    h.name();(head||(h=>h.st('Artist')))(h);
    h.about('ABOUT THIS SERVICE',what);
    h.risks(risks,note);
    h.ci(checksLabel||'Quick health check: check anything that applies to you.',checks);
    h.lt('If you checked anything, tell us more');
    if(design)design(h);
    h.init(...inits);
    h.sig(consentTo);
  });
}
const BROW_CHECKS=a=>['Pregnant or breastfeeding','History of keloids','Retinol or acids on brows in 14 days','Sunburn or a tan on the area','Previous brow tattoo or PMU',
  'Accutane in the past '+a,'Chemo or radiation in 6 months','Botox in the past 2 weeks','Diabetes, autoimmune or heart issue','Fainting, epilepsy or pacemaker',
  'Cold sore, rash or acne near brows','Bleeding disorder or blood thinners','Peel, laser or microneedling in 4 wks','Allergy: pigment, numbing, latex','Psoriasis, eczema or vitiligo'];
const MRI='MRI: iron-oxide pigments can rarely cause warmth or swelling. Tell the radiologist; never skip an MRI because of PMU.';
const PHOTO_REQ='Before and after photos for my private record are required. Social media use only with my separate OK.';
const FEES='Deposits and fees follow {business} policy. Services can\'t be refunded once performed.';
const ID18='By signing, I confirm I am 18 or older, have shown government photo ID, have read this form, had my questions answered, and consent to ';
const YESNO='Before your appointment: check anything that applies to you.';
consent('pm-microblading-consent','Microblading consent',{
  what:[['What it is','A single-use hand blade places fine, hair-like strokes of pigment just under the skin.'],['What to expect','About 2 to 3 hours. A touch-up at 6 to 8 weeks (not before 6, ideally within 12) is part of the process.'],['How long it lasts','Usually 1 to 3 years. Very oily or large-pore skin blurs strokes and often suits powder brows better.']],
  risks:['Strokes that blur or merge, more so in oily skin','Uneven fading or asymmetry, refined at touch-up','Allergy to pigment or numbing, even months later','Granulomas (firm bumps), which are rare','Color change as it fades (cooler or warmer)','Scarring or texture change if skin is damaged','Infection, especially without good aftercare','Koebner reaction (psoriasis or vitiligo flaring)'],note:MRI,
  checks:BROW_CHECKS('12 months'),
  design:h=>h.yn('DESIGN AND COLOR APPROVAL. I\'ve seen my brow shape drawn on in a mirror and approve the shape, placement and pigment color.',true),
  inits:['I\'ve shared my full health, medication and skincare history honestly, and will report any changes.','I understand the risks above. Results vary with skin type, age, sun and healing, and aren\'t guaranteed.','My brows will look dark, then patchy or almost gone (ghosting) before color returns at 4 to 6 weeks.','A touch-up at 6 to 8 weeks is usually needed; some strokes may not hold the first time.','I\'ll follow my aftercare. Picking, sun, sweat or skipping it can cause fading, scarring or infection.','This is semi-permanent. It fades but may not disappear completely, and removal isn\'t guaranteed.',PHOTO_REQ,FEES],
  consentTo:ID18+'microblading and my touch-up.'});
consent('pm-powder-consent','Powder & ombré brow consent',{
  head:h=>h.ss('Style',['Powder','Ombré','Combo'],true),
  what:[['What it is','A single-use machine needle builds soft, shaded color. Combo adds hair strokes up front.'],['What to expect','About 2 to 3 hours. A touch-up at 6 to 10 weeks is part of the process. Suits oily and mature skin.'],['How long it lasts','Usually 2 to 5 years, depending on skin, sun and aftercare. Combo strokes fade sooner than shading.']],
  risks:['A heavy or block-like look if over-saturated','Uneven fading or asymmetry, refined at touch-up','Allergy to pigment or numbing, even months later','Granulomas (firm bumps), which are rare','Color change as it fades (cooler or warmer)','Scarring or texture change if skin is damaged','Infection, especially without good aftercare','Koebner reaction (psoriasis or vitiligo flaring)'],note:MRI,
  checks:BROW_CHECKS('6 months'),
  design:h=>h.yn('DESIGN AND COLOR APPROVAL. I\'ve seen my brow shape drawn on in a mirror and approve the shape, style, density and pigment color.',true),
  inits:['I\'ve shared my full health, medication and skincare history honestly, and will report any changes.','I understand the risks above. Results vary with skin type, age, sun and healing, and aren\'t guaranteed.','My brows will look dark and bold, then flaky and patchy before color returns at 4 to 6 weeks.','A touch-up at 6 to 10 weeks is usually needed to even out color and density.','I\'ll follow my aftercare. Picking, sun, sweat or skipping it can cause fading, scarring or infection.','This is semi-permanent. It fades but may not disappear completely, and removal isn\'t guaranteed.',PHOTO_REQ,FEES],
  consentTo:ID18+'powder, ombré or combo brows and my touch-up.'});
consent('pm-lip-consent','Lip blush consent',{
  what:[['What it is','A machine with a single-use needle shades soft color into the lips and defines the lip line.'],['What to expect','About 2 to 3 hours. A touch-up at 6 to 8 weeks is part of the process; many lips need 2 or more sessions.'],['How long it lasts','Usually 2 to 3 years. Lips heal softer, lighter and a little cooler than they look on day one.']],
  risks:['A cold sore outbreak, even if they\'re rare for you','Uneven or patchy color, refined at touch-up','Allergy to pigment or numbing, even months later','Scarring or texture change, which is rare','Swelling that lasts longer than a few days','A cooler or darker shift, more so on darker lips','Infection, especially without good aftercare','Granulomas (firm bumps), which are rare'],
  note:'Had cold sores before? Ask your physician about preventive medication before your visit. MRI: tell the radiologist.',
  checks:['Pregnant or breastfeeding','History of keloids','Lip filler in the past 4 weeks','Rash, infection or cracked lips','Previous lip tattoo or PMU','Accutane in the past 6 months','Chemo or radiation in 6 months','Botox near lips in 2 weeks','Diabetes, autoimmune or heart issue','Fainting, epilepsy or pacemaker','Cold sore now or in past 2 weeks','Bleeding disorder or blood thinners','Peel, laser or microneedling in 4 wks','Allergy: pigment, numbing, latex','History of cold sores'],
  design:h=>h.yn('DESIGN AND COLOR APPROVAL. I\'ve seen my lip shape outlined in a mirror and a pigment swatch, and approve the lip line and color.',true),
  inits:['I\'ve shared my full health, medication and skincare history honestly, and will report any changes.','I understand the risks above. Results vary with skin type, age, sun and healing, and aren\'t guaranteed.','Lips look bright, then peel and turn chalky (frosty stage) before color returns. Final color at 4 to 6 weeks.','A touch-up at 6 to 8 weeks is usually needed; darker lips may need a corrector session first.','I\'ll follow my aftercare. Picking, sun, dryness or skipping it can cause fading, scarring or infection.','This is semi-permanent. It fades but may not disappear completely, and removal isn\'t guaranteed.',PHOTO_REQ,FEES],
  consentTo:ID18+'lip blush and my touch-up.'});
const SESSION=h=>{h.dob();h.st('Session #');};
consent('pm-eyeliner-consent','Permanent eyeliner consent',{
  head:SESSION,
  what:[['What it is','Pigment placed along the lash line with a sterile, single-use needle for fuller-looking lashes or a defined liner. It is a cosmetic tattoo.'],['What to expect','About 2–3 hours. Watery, puffy eyes; swelling peaks at 24–48 hours. A touch-up at 6–8 weeks completes the process.'],['How long it lasts','Usually 3–5 years, softening over time. Sun, skincare and skin type affect fading. Removal is slow and may be incomplete.']],
  risks:['Swelling, bruising and watery eyes for several days','Eye irritation, conjunctivitis or eye infection','Rarely, a scratch on the eye (corneal abrasion)','Uneven lines or patchy healing that needs a touch-up','Pigment spreading past the lash line (migration)','Pigment or numbing product getting into the eye','Some lash loss, usually temporary','Allergy; rarely, granuloma or scarring'],
  checksLabel:YESNO,
  checks:['Pregnant or breastfeeding','Glaucoma, or eye surgery in the past 6 months','Lash growth serum in the past 3 months','Lash extensions or lift now','Accutane (isotretinoin) in past 6 months','Blood thinners or a bleeding disorder','Stye, eye infection or rash near the eyes','Dry eye, or you wear contact lenses','Keloids, diabetes or autoimmune condition','Allergy to numbing, pigment, nickel or latex'],
  design:h=>{h.mc('YOUR LINER DESIGN. We\'ll agree on style and thickness in the mirror first. Liner can be built up at the touch-up but is hard to take away.',['Lash enhancement','Thin classic','Defined','Small wing','Upper only','Upper & lower']);
    h.yn('I approve this design.',true);h.st('Design notes');},
  inits:['My health, eye and medication history is complete and true. I\'ll share any changes.','I understand the risks above, including migration, eye irritation and, rarely, eye injury.','I\'ll keep my eyes closed and still when asked, and speak up right away about stinging or pain.','Afterward: no contacts for 7 days, eye makeup for 14 days, or lash extensions or lifts for 4 weeks.','Healed liner is softer than day one; a 6–8 week touch-up is needed. Results aren\'t guaranteed.','This is a tattoo. It fades over years; removal takes several sessions and may be incomplete.','I\'ll follow aftercare and get urgent eye care for eye pain, vision change or ongoing discharge.','I\'m sober today, my questions were answered, and services can\'t be refunded once performed.'],
  consentTo:'By signing, I confirm I\'m 18 or older and consent to permanent eyeliner and its touch-up.'});
consent('pm-saline-consent','Saline tattoo removal consent',{
  head:SESSION,
  what:[['What it is','Saline solution is worked into old pigment with a sterile, single-use needle, and pigment lifts out with the scab. Best for lightening PMU.'],['What to expect','Usually 2–4+ sessions, at least 8 weeks apart, on fully healed tattoos only. The area scabs and stays dry for 7–10 days.'],['Realistic results','Each session lightens; it rarely erases in one visit. Some pigment may not lift fully. Complete removal isn\'t guaranteed.']],
  risks:['Incomplete removal or uneven lightening','Scarring or texture change, more likely with picking','Healing that takes longer than expected','Darker marks, more likely in deeper skin tones','Lighter patches of skin (hypopigmentation)','Infection, especially if the scab gets wet or picked','Color shift as pigment lifts (warm, red or orange tones)','Allergy, or temporary hair loss in brow areas'],
  checksLabel:YESNO,
  checks:['Pregnant or breastfeeding','Tattoo less than 8 weeks old or not healed','Keloids or raised scarring','Laser or other removal in the past 8 weeks','Accutane (isotretinoin) in past 6 months','Blood thinners or a bleeding disorder','Rash, cold sore or open wound in the area','Diabetes, autoimmune condition or slow healing','Chemotherapy or radiation in past 6 months','Allergy to numbing, latex or nickel'],
  design:h=>{h.mc('AREA AND GOAL. We\'ll outline the exact area to lighten and agree on a realistic goal for today and for your whole plan.',['Lighten for a correction','Lighten for a cover','Lighten as much as possible','One section only']);
    h.yn('I approve this area.',true);h.st('Area notes');},
  inits:['My health and medication history is complete and true. I\'ll share any changes.','I understand the risks above, including scarring, light patches and color shifts.','Several sessions at least 8 weeks apart are usually needed. Complete removal isn\'t promised.','I\'ll keep the area dry with no ointment for 7–10 days and let the scab fall off on its own.','New permanent makeup over the area waits until it\'s fully healed and my artist approves.','Before photos are taken each session so we can track progress honestly.','I\'ll follow my aftercare and contact my artist about any sign of infection.','I\'m sober today, my questions were answered, and services can\'t be refunded once performed.'],
  consentTo:'By signing, I confirm I\'m 18 or older and consent to saline tattoo removal on the area marked.'});
consent('pm-smp-consent','Scalp micropigmentation consent',{
  head:SESSION,
  what:[['What it is','A cosmetic tattoo of tiny dots that mimic short hair or soften scars, using a sterile, single-use needle. It doesn\'t grow hair.'],['What to expect','2–3 sessions about 10–14 days apart, 2–5 hours each. Dots look darker at first and soften as they heal.'],['How long it lasts','Usually 3–6 years before a refresh. Sun, scalp oil, exfoliating and harsh products speed fading. Removal is slow and may be incomplete.']],
  risks:['Dots spreading or blurring (blowout)','Uneven density or shade between sessions','A hairline that looks less natural as hair loss changes','Allergy to pigment or numbing','A blue or gray cast if pigment sits too deep','Fading or color change, especially with sun','Redness, tenderness or flaking for several days','Infection; rarely, granuloma or scarring'],
  checksLabel:YESNO,
  checks:['Pregnant or breastfeeding','Psoriasis, eczema or acne flare on the scalp','Keloids or raised scarring','Hair transplant or scalp surgery in the past year','Accutane (isotretinoin) in past 6 months','Blood thinners or a bleeding disorder','Sunburn, cold sore or open wound on the scalp','Diabetes, autoimmune condition or slow healing','Chemotherapy or radiation in past 6 months','Allergy to numbing, pigment, nickel or latex'],
  design:h=>{h.mc('YOUR HAIRLINE AND DENSITY. We\'ll draw your hairline on your scalp and agree on shape, density and shade before any pigment goes in.',['Soft, natural hairline','Defined hairline','Density only','Crown','Scar camouflage']);
    h.yn('I approve this hairline and shade.',true);h.st('Design notes');},
  inits:['My health and medication history is complete and true. I\'ll share any changes.','I understand the risks above, including blowout, a blue cast and uneven density.','I\'ve seen my hairline in the mirror and photos. A design that suits me now should suit me as I age.','2–3 sessions about 10–14 days apart are needed. Results vary and aren\'t guaranteed.','SMP doesn\'t regrow hair, and my natural hair loss may continue and change how it looks.','This is a tattoo. It fades over years; removal takes several sessions and may be incomplete.','I\'ll follow aftercare: no washing 3–5 days, no sweat, swimming or sun for 2–4 weeks.','I\'m sober today, my questions were answered, and services can\'t be refunded once performed.'],
  consentTo:'By signing, I confirm I\'m 18 or older and consent to scalp micropigmentation (SMP).'});
consent('pm-areola-consent','Areola restoration consent',{
  head:h=>{h.dob();h.ss('Side(s)',['Left','Right','Both']);},
  what:[['What it is','Cosmetic tattooing that adds color, shape and the look of dimension to the areola. Not a medical treatment.'],['What to expect','A private, unhurried visit. Usually 2+ sessions 6–8 weeks apart. Color heals softer and fades over time.'],['What you\'ll feel','Sensation is often reduced after surgery, so you may feel little. Daily checks while healing matter.'],['Other options','No treatment, 3D nipple prosthetics, or medical tattooing through your surgeon\'s office.']],
  risks:['Patchy color, as scar tissue holds pigment unevenly','Infection, slow healing or long-lasting redness','Implant, flap or graft concerns (surgeon clears these)','Fading or color shift, needing a boost','Allergic reaction to pigment or numbing products','Color that doesn\'t exactly match the other side'],
  checksLabel:'Before your appointment. Clearance is required. Some answers mean we wait. Share only what you are comfortable sharing. Check anything that applies to you.',
  checks:['Under 6 months since final surgery or radiation','Implants, expanders, or flap reconstruction','Chemo or immunotherapy in the past 6 months','Pregnant or breastfeeding','Open, unhealed or tender area, or a rash','History of keloids or raised scars','Blood thinners, bleeding disorder or diabetes','Allergy to pigment, numbing, latex or nickel','Lymphedema or an autoimmune condition'],
  design:h=>{h.yn('Written surgeon or physician clearance on file');
    h.yn('DESIGN AND PHOTOS. I approved the size, placement and color.',true);
    h.yn('Private chart photos: torso only, no face');
    h.ss('Marketing photos. Each photo choice is separate. Photos never show your face and are never shared without your yes.',['Optional: marketing photos, torso only, no face','No marketing photos, please']);},
  inits:['I\'ve shared my full health and surgical history, including implants, flaps and radiation.','Results vary, scar tissue may heal unevenly, more than one session is usual, and nothing is guaranteed.','I\'ll follow my aftercare and check the area every day while healing, since I may not feel a problem.','I can stop at any time and withdraw photo permission in writing. My questions were answered.'],
  consentTo:'Client signature'});
consent('pm-freckles-consent','Faux freckles consent',{
  head:h=>{h.dob();h.st('Area');},
  what:[['What it is','Tiny dots of light brown pigment placed with a machine or by hand to look like natural freckles.'],['What to expect','One session, then a touch-up in 6–8 weeks. Freckles soften and fade over about 1–3 years.'],['What you\'ll feel','Quick pricks or a light scratching feel. Numbing may be used as your state allows.'],['Other options','No treatment, freckle pens or makeup, or temporary freckle tattoos.']],
  risks:['Some freckles heal lighter or disappear (normal)','Placement or spacing that looks uneven to you','Allergic reaction to pigment or numbing products','Freckles that spread, blur or heal too dark','Color shift over time, such as cooler or warmer','Infection, or darker marks in deeper skin tones'],
  checksLabel:'Before your appointment. A yes doesn\'t always mean no. We may wait, adjust the plan, or ask for your physician\'s OK. Check anything that applies to you.',
  checks:['Pregnant or breastfeeding','Accutane (isotretinoin) in the past 6 months','Retinol, retinoids or acids on the area in 14 days','Peel, laser, IPL or microneedling in 4 weeks','Sunburn, tanning or self-tanner in 2 weeks','Acne, rash, cold sore or broken skin in the area','History of keloids or raised scars','Blood thinners, a bleeding disorder or diabetes','Allergy to pigment, numbing, latex or nickel','Chemo or radiation in the past 6 months'],
  design:h=>{h.yn('FRECKLE MAP AND PHOTOS. I approved my freckle map and shade.',true);
    h.yn('Before and after photos for my private chart');
    h.mc('Social media or website (optional). You can withdraw photo permission at any time, in writing.',['Social media or website, face hidden','Social media or website, face visible']);},
  inits:['I\'ve shared my health history and skincare honestly and will tell you about any change before my touch-up.','Some freckles may heal lighter or fade away completely. This is normal, and the touch-up helps even them out.','I\'ll follow my aftercare, won\'t pick scabs, and will use SPF once healed. Results aren\'t guaranteed.','I can stop at any time. My questions were answered. Services can\'t be refunded once performed.'],
  consentTo:'Client signature'});

// ---- guides (aftercare & prep handouts) ----
const CALL='Questions? Text {phone|me} · {business}';
const P=['pmu'];
const BROW_CALL='Call me right away if you notice: redness or warmth that spreads beyond the brows; fever or feeling unwell; hives, a spreading rash or intense itching; pus, yellow crusts or red streaks; pain or swelling getting worse after 72 hours; firm bumps weeks or months later.';
const BREATHE='Trouble breathing, or swelling of the face or throat: call 911.';
const guides=[
 {id:'g-pm-microblading',icon:'✏️',title:'Caring for microbladed brows',cat:'Aftercare',profs:P,tips:[
  'Your brows will change a lot over the next 6 to 8 weeks. Here\'s what to expect, and how to help the strokes heal crisp.',
  'Day 0 (today). Normal: dark, bold brows, slight swelling and clear fluid (lymph). Do: blot gently with sterile gauze every 15 to 20 minutes for 2 to 3 hours; sleep on your back. Avoid: touching, makeup, workouts and getting your brows wet.',
  'Days 1–3. Normal: brows look darker and thicker than they will heal; mild tenderness. Do: cleanse 1 to 2 times a day with water or a fragrance-free cleanser; pat dry, then a rice-grain of balm. Avoid: sweating, steam, hot showers on your face, sun and makeup on brows.',
  'Days 4–10 (flaking). Normal: flaking and itching; color looks patchy under the flakes. Do: keep cleansing and use a thin layer of balm; tap gently around itchy spots. Avoid: picking, scratching or rubbing flakes; it pulls pigment out.',
  'Days 10–21 (ghosting). Normal: brows look faded, patchy or almost gone. This is normal. Do: be patient; new skin is settling over the pigment. Avoid: judging your results, retinoids or acids near brows.',
  'Weeks 4–6. Normal: color slowly comes back through the skin. Do: once healed, use SPF on your brows when outdoors. Avoid: tanning, peels, laser or facials on the area until 4 weeks.',
  'Weeks 6–8 (healed). Normal: final result, about 20 to 40 percent lighter than day one. Do: come in for your touch-up so we can perfect shape and color. Avoid: laser near your brows without telling the provider about your PMU.',
  'Good to know: no brow makeup for 10 to 14 days; sleep on your back, on a clean pillowcase; tell laser providers you have brow PMU; no hard workouts or heavy sweating for 10 days; very oily skin? I may suggest dry healing instead; keep retinol and acids off your brows long term.',
  'Hands off: let flakes fall away on their own. Less is more: a rice-grain of balm, never a thick coat. Stay dry: no swimming, sauna or steam for 14 days. Sun safe: no tanning for 4 weeks, then SPF daily.',
  BROW_CALL,BREATHE,CALL]},
 {id:'g-pm-powder',icon:'🖌️',title:'Caring for your powder brows',cat:'Aftercare',profs:P,tips:[
  'Powder, ombré and combo brows heal in stages over 6 to 10 weeks. Here\'s what to expect, and how to protect your color.',
  'Day 0 (today). Normal: dark, bold brows, slight swelling and clear fluid (lymph). Do: blot gently with sterile gauze every 15 to 20 minutes for 2 to 3 hours; sleep on your back. Avoid: touching, makeup, workouts and getting your brows wet.',
  'Days 1–3. Normal: brows look darker and more solid than they will heal; mild tenderness. Do: cleanse 1 to 2 times a day with water or a fragrance-free cleanser; pat dry, then a rice-grain of balm. Avoid: sweating, steam, hot showers on your face, sun and makeup on brows.',
  'Days 4–10 (flaking). Normal: thicker flakes and itching are common. Do: keep cleansing and use a thin layer of balm; tap gently around itchy spots. Avoid: picking, scratching or rubbing flakes; it can leave bare patches.',
  'Days 10–21 (lighter stage). Normal: brows look much lighter or patchy. This is normal. Do: be patient; new skin is settling over the pigment. Avoid: judging your results, retinoids or acids near brows.',
  'Weeks 4–6. Normal: color returns and evens out; combo strokes look softer. Do: once healed, use SPF on your brows when outdoors. Avoid: tanning, peels, laser or facials on the area until 4 weeks.',
  'Weeks 6–10 (healed). Normal: final soft, powdered result, lighter than day one. Do: come in for your touch-up to perfect density and color. Avoid: laser near your brows without telling the provider about your PMU.',
  'Good to know: no brow makeup for 10 to 14 days; sleep on your back, on a clean pillowcase; tell laser providers you have brow PMU; no hard workouts or heavy sweating for 10 days; very oily skin? I may suggest dry healing instead; keep retinol and acids off your brows long term.',
  'Hands off: let flakes fall away on their own. Less is more: a rice-grain of balm, never a thick coat. Stay dry: no swimming, sauna or steam for 14 days. Sun safe: no tanning for 4 weeks, then SPF daily.',
  BROW_CALL,BREATHE,CALL]},
 {id:'g-pm-lips',icon:'💋',title:'Caring for your lip blush',cat:'Aftercare',profs:P,tips:[
  'Lips heal fast but change a lot in the first month. Keep them moist, be patient, and here\'s what to expect along the way.',
  'Day 0 (today). Normal: swelling, tenderness and very bright or dark color. Do: thin layer of balm at all times; clean, wrapped cool compress 10 minutes at a time; drink through a straw. Avoid: hot drinks, kissing, and touching your lips.',
  'Days 1–3. Normal: swelling eases; color still looks bold and uneven. Do: rinse gently with water after eating, pat dry, reapply balm; straw for 3 to 5 days. Avoid: spicy, salty, acidic or very hot foods; kissing for 7 days.',
  'Days 3–7 (peeling). Normal: peeling, dryness and itching. Do: keep a thin layer of balm on all day and at bedtime. Avoid: picking, licking or biting your lips.',
  'Days 7–14 (frosty stage). Normal: lips look chalky or milky and color seems to vanish. This is normal. Do: keep lips moisturized and stay hydrated. Avoid: lipstick, gloss or other lip products for 14 days.',
  'Days 14–28. Normal: color slowly returns from within. Do: once healed, use an SPF lip balm outdoors. Avoid: sun and tanning for 4 weeks; retinoids or acids near lips.',
  'Weeks 4–6 (healed). Normal: final color, softer and a little cooler than day one. Do: come in for your touch-up at 6 to 8 weeks. Avoid: lip filler until at least 4 weeks, or until after your touch-up.',
  'Good to know: prescribed cold sore medication? Take as directed; darker lips may need a corrector session first; apply balm with a clean swab or clean fingers; tell laser or filler providers about your PMU.',
  'Always moist: never let your lips dry out while healing. Use a straw: for 3 to 5 days, to keep lips clean. Hands off: let peeling skin come away on its own. Sun safe: no tanning for 4 weeks, then SPF lip balm.',
  'Call me right away if you notice: blisters, tingling or a cold sore starting; fever or feeling unwell; hives, a spreading rash or intense itching; pus, yellow crusts or red streaks; pain or swelling getting worse after 72 hours; firm bumps weeks or months later.',
  BREATHE,CALL]},
 {id:'g-pm-eyeliner',icon:'👁️',title:'Caring for your new eyeliner',cat:'Aftercare',profs:P,tips:[
  'Expect puffy, watery eyes for a day or two, and liner that looks darker and bolder than it will heal. Here\'s how to protect your results.',
  'Day 0 (today). Normal: watery eyes, puffiness, tenderness; liner looks dark and thick. Do: blot gently with clean gauze for the first 2–3 hours; cold compress over closed eyes, 10 minutes at a time. Avoid: rubbing, eye makeup, contact lenses and sleeping face down.',
  'Days 1–2 (swelling peaks). Normal: swelling peaks at 24–48 hours, often worse in the morning; light crusting at the lash line. Do: cold compress 10 minutes on, 10 off; rinse lash line gently 1–2 times a day with water, pat dry; balm only if I gave you one; sleep with your head raised. Avoid: hot water on your face, sweating, workouts and rubbing your eyes.',
  'Days 3–7 (light flaking). Normal: light flaking at the lash line; liner may look patchy or uneven. Do: keep cleansing gently and let flakes fall off on their own; wear glasses, not contacts. Avoid: picking, mascara, eye makeup remover, pools, hot tubs, saunas and steam.',
  'Days 8–14. Normal: color can look lighter or faded while the skin finishes healing. Do: contacts are OK from day 7 with freshly washed hands; keep it simple. Avoid: eye makeup until day 14, and swimming or steam until day 14.',
  'Weeks 2–6 (healed). Normal: healed in 2–4 weeks; final color settles; any gaps get filled at your touch-up. Do: sunglasses outdoors; come back for your touch-up at 6–8 weeks. Avoid: lash extensions or lifts for 4 weeks, and retinoids, acids, facials or laser near the eyes for 4 weeks.',
  'Cool it: cold compress 10 minutes at a time for 48 hours. Hands off: no rubbing, scratching or picking. Glasses week: no contact lenses for 7 days. Bare eyes: no eye makeup for 14 days, no lash services for 4 weeks.',
  'Call me right away if you notice: redness or warmth that spreads, or pus or yellow crust; fever, or red streaks spreading from the area; swelling or pain that gets worse after 72 hours; firm bumps along the lash line weeks or months later.',
  'Get urgent eye care right away for eye pain, vision changes, ongoing discharge or light sensitivity. '+BREATHE,CALL]},
 {id:'g-pm-saline',icon:'💧',title:'After your saline removal',cat:'Aftercare',profs:P,tips:[
  'Saline lifts old pigment out with the scab, so the scab is doing the work. Keeping the area clean and completely dry is what makes it succeed.',
  'Day 0 (today). Normal: redness, slight swelling and light weeping; the area may look raw or darker. Do: blot gently with clean, dry gauze until weeping stops; leave it uncovered unless I say otherwise. Avoid: water, ointment, balm, makeup and touching the area.',
  'Days 1–3 (scab forms). Normal: a dry crust forms with pigment inside it; mild tenderness. Do: keep it completely dry; wash around it carefully and shower with your face away from the water. Avoid: sweating, workouts, swimming, steam, rain and any products on the area.',
  'Days 4–10 (keep it dry). Normal: the scab tightens, itches, then falls off on its own. Do: stay dry until the scab has fallen off naturally, usually in 7–10 days. Avoid: picking, scratching, or soaking the scab off; it pulls out pigment unevenly and can scar.',
  'Weeks 2–4. Normal: pink, shiny new skin; the old pigment looks lighter. Do: once the scab is off, gentle cleanser and a fragrance-free moisturizer if I say so. Avoid: sun, tanning, retinoids and acids on the area for 4 weeks.',
  'Week 8+ (next session). Normal: lightening keeps showing as the skin matures. Do: SPF daily once healed; book your next session at least 8 weeks out. Avoid: new permanent makeup or other removal on the area until I\'ve checked it.',
  'Keep it dry: no water on the area for 7–10 days. Let it fall: the scab lifts the pigment, so don\'t pick. Skip the balm: no ointment or creams while it scabs. Be patient: at least 8 weeks between sessions.',
  'Call me right away if you notice: redness or warmth that spreads, or pus; fever, or red streaks spreading from the area; a scab that turns soft, wet or yellow; pain or swelling that gets worse after 72 hours.',
  'Treated near the eyes? Get urgent eye care for eye pain, vision changes or discharge. '+BREATHE,CALL]},
 {id:'g-pm-smp',icon:'⚫',title:'Caring for your scalp after SMP',cat:'Aftercare',profs:P,tips:[
  'Your dots will look darker and sharper at first, then soften as they heal. Gentle, dry care in the first few days protects every one of them.',
  'Day 0 (today). Normal: redness, tenderness and slight swelling; dots look dark and bold. Do: blot gently with clean gauze for the first 2–3 hours; sleep on your back on a clean pillowcase. Avoid: washing, touching, tight or dirty hats, and sweating.',
  'Days 1–3 (stay dry). Normal: redness fades in 1–3 days; tiny crusts may form. Do: keep your scalp dry; a loose, clean cotton hat is OK if you need one. Avoid: washing, shampoo, rain or shower water on your head, and scratching.',
  'Days 4–7 (light flaking). Normal: light flaking and itching as the dots settle. Do: after day 3–5, rinse with lukewarm water and a gentle, fragrance-free shampoo; pat dry. Avoid: shaving or clippers until flaking is done (about 7 days), and picking.',
  'Weeks 2–4 (next session). Normal: dots look softer and lighter; your next session at 10–14 days builds density. Do: shave carefully once flaking stops; keep products fragrance-free. Avoid: heavy sweating, gym, sauna, swimming and sun on your scalp for 2–4 weeks.',
  'Long term (healed). Normal: healed and settled; dots fade slowly over years. Do: SPF 30+ or a hat outdoors; keep your scalp moisturized; book a refresh when needed. Avoid: exfoliating scalp products, retinoids, acids and tanning beds.',
  'Stay dry: no washing for 3–5 days. Keep cool: no sweating or swimming for 2–4 weeks. Hold the razor: no shaving until flaking stops. Cover up: hat or SPF; sun fades dots fastest.',
  'Call me right away if you notice: redness or warmth that spreads, or pus; fever, or red streaks spreading from the area; pain or swelling that gets worse after 72 hours; firm bumps on the scalp weeks or months later.',
  'Pigment or product in your eye? Rinse with clean water and get urgent eye care. '+BREATHE,CALL]},
 {id:'g-pm-areola',icon:'🌸',title:'After your areola restoration',cat:'Aftercare',profs:P,tips:[
  'Take healing gently. Here is what to expect day by day, and how to protect your new color.',
  'Day 0 (today). Normal: color looks darker and brighter than it will heal; mild redness or tenderness. Do: leave the pad on 2–3 hours; wash hands, then rinse gently with lukewarm water and pat dry. Avoid: tight, underwire or rough bras; touching with unwashed hands.',
  'Days 1–3. Normal: slight swelling, a little clear fluid, a shiny look. Do: clean once or twice a day, pat dry, rice-grain of balm; fresh sterile pad and a soft, clean bra. Avoid: heavy workouts, sweating and anything that rubs the area.',
  'Days 4–10 (flaking). Normal: light flaking or tiny scabs and some itching; color may look patchy. Do: keep cleaning and a thin layer of balm; check the area daily in a mirror. Avoid: picking, scratching or peeling; soaking in baths, pools or hot tubs.',
  'Days 10–14. Normal: flaking ends; color may look soft or uneven for now. Do: keep it clean and dry; loose, breathable clothing. Avoid: submerging the area for the full 14 days.',
  'Weeks 3–5 (settling). Normal: color settles and looks softer, sometimes lighter in scar tissue. Do: gentle, fragrance-free moisturizer once healed; mineral SPF if the area sees sun. Avoid: sun or tanning for 4 weeks; retinoids or acids on the area.',
  'Weeks 6–8 (next session). Normal: healed; some patchiness is expected and is evened out next visit. Do: come to your next session; bring any questions or changes in your health. Avoid: any other treatment on the area until I\'ve checked it.',
  'Check daily: look, don\'t just feel; sensation may be reduced. Soft & clean: soft bra or sterile pad, changed daily. No soaking: showers only, no baths or pools for 14 days. Hands off: let flakes come away on their own.',
  'Call me right away if you notice: redness or warmth that spreads, or red streaks; pain or swelling getting worse after 72 hours; any change near an implant: swelling, firmness or pain; pus, a bad smell, or fluid after day 3; fever, or feeling unwell; hives, itching rash or blisters.',
  BREATHE,CALL]},
 {id:'g-pm-freckles',icon:'✨',title:'Caring for your new freckles',cat:'Aftercare',profs:P,tips:[
  'Freckles heal fast, but they are still a fresh tattoo. Here is what to expect day by day.',
  'Day 0 (today). Normal: freckles look darker and more defined than they will heal; slight redness. Do: blot gently with clean tissue; wash hands before touching your face. Avoid: makeup on the area, sweating, heat and steam.',
  'Days 1–4. Normal: freckles feel slightly raised; tiny scabs start to form. Do: rinse gently once or twice a day with water or a mild cleanser; pat dry; rice-grain of balm. Avoid: rubbing, scrubbing or face cloths on the area; hard workouts.',
  'Days 5–7 (flaking). Normal: tiny scabs flake off and freckles may look lighter or patchy. Do: let flakes come away on their own; keep the area clean. Avoid: picking or scratching; pools, hot tubs, saunas.',
  'Days 7–14. Normal: healing finishes; some freckles may look faint for now. Do: makeup on the area from day 14, or when I say it\'s OK. Avoid: retinol, acids, peels and facials on the area.',
  'Weeks 3–8 (touch-up). Normal: final color settles; some may heal lighter or disappear, and this is normal. Do: daily SPF 30+ once healed; come to your touch-up. Avoid: sun or tanning for 4 weeks; laser on the area.',
  'Long term. Normal: freckles soften and fade gradually over 1–3 years. Do: SPF every day; tell laser or IPL providers about your freckle tattoo. Avoid: retinoids or acids on the area long term; they fade pigment.',
  'Hands off: tiny scabs fall off in 5–7 days, so don\'t pick. Keep it clean: clean hands, clean pillowcase. SPF daily: once healed; sun fades freckles fastest. Be patient: faint freckles even out at the touch-up.',
  'Call me right away if you notice: redness or warmth that spreads; pain or swelling getting worse after 72 hours; firm bumps that appear weeks later; pus, a bad smell, or fluid after day 3; fever, or feeling unwell; hives, itching rash or blisters.',
  BREATHE,CALL]},
 {id:'g-pm-prep',icon:'📅',title:'Before your PMU appointment',cat:'Pre-care',profs:P,tips:[
  'Good prep means less bleeding, better color retention and a smoother heal. Follow the timeline for your treatment.',
  '3 months before: eyeliner, stop lash growth serums (bimatoprost and similar). Brows: same, if you use a serum on your brows. Took isotretinoin (Accutane) in the past year? Tell me now.',
  '4 weeks before: no chemical peels, laser, IPL or microneedling near the area. Lips: lip filler done at least 4 weeks before.',
  '2 weeks before: pause retinoids, retinol, AHA/BHA acids and scrubs on the area. No sun, tanning beds or self-tanner. Botox near brows or lips done at least 2 weeks before.',
  '7 days before: skip aspirin, ibuprofen, fish oil, vitamin E, ginkgo and niacin unless prescribed. Eyeliner: have lash extensions or a lift removed.',
  '48 hours before: no alcohol. Stay out of strong sun. Get a good night\'s sleep.',
  'Day of your visit: no caffeine. Eat a full meal first. Clean skin, no makeup on the area. Eyeliner: contacts out; wear glasses.',
  'Brows: come with brows unwaxed and untweezed for 1–2 weeks so I can see your natural shape; bring the brow pencil or powder you love; microblading or powder? We\'ll decide together based on your skin.',
  'Lips: ever had a cold sore? Ask your doctor about prevention before lip work; bring a lipstick or liner you love; keep lips moisturized the week before.',
  'Eyeliner: bring your glasses, since contacts stay out; lash extensions or a lift removed 1 week before; no eye makeup on the day; tell me about dry eye, glaucoma or any eye surgery.',
  'Please call to reschedule if you have: a cold sore, or a cluster of small blisters; a sunburn or peeling skin in the area; an active breakout, rash or irritation in the area; a fever, cold or flu, or feel unwell; found out you\'re pregnant, or think you may be; pink eye or a stye (for eyeliner). We ask for 48–72 hours\' notice. If it\'s about your safety, just call. We\'ll find a new time together.',
  'Important: never stop a prescribed medication, including blood thinners, without your doctor\'s OK. Tell me about everything you take, and I\'ll check whether we need a note from your doctor.',CALL]},
 {id:'g-pm-healing',icon:'🌱',title:'What to expect while you heal',cat:'Aftercare',profs:P,tips:[
  'Every heal has an ugly-duckling phase. Find your treatment, see where you are, and know that patchy and pale along the way is part of the process.',
  'Brows (microblading, powder & combo). Days 1–3: darker, bolder and sharper than they will heal; a little redness or swelling. Days 4–10: flaking and itching; let flakes fall off on their own; powder flakes can be thicker. Days 10–21: ghosting; brows look patchy, light or almost gone; totally normal, since new skin is covering the pigment. Weeks 4–6: color comes back, softer and more natural. Final result: at 6–8 weeks, about 20–40% lighter than day 1; touch-up at 6–8 weeks fills any gaps.',
  'Lips (lip blush). Days 1–3: swollen and tender; color looks bright or dark. Days 3–7: peeling; keep a thin layer of balm on and don\'t pick. Days 7–14: frosty stage; lips look chalky or milky and the color seems to vanish. It hasn\'t: it\'s under a healing layer. Days 14–28: color blooms back, a little more each day. Final result: at 4–6 weeks, softer and often a little cooler; many lips need a second session to build color.',
  'Eyeliner (liner & lash enhancement). First 24–48 hours: swelling peaks, and eyes may be puffy or watery; cold compress, 10 minutes at a time. Days 3–7: light flaking along the lash line; don\'t rub your eyes. Days 7–14: liner may look lighter or a bit uneven while it settles. Weeks 2–4: healed; the line looks soft and even. Final result: at 2–4 weeks; touch-up at 6–8 weeks for a crisp, even line.',
  'Hands off: no picking, peeling or scratching. Keep it clean: cleanse and balm as your aftercare sheet shows. No sweat, no soak: no workouts for 10 days, no pools for 14. Shade it: no sun or tanning for 4 weeks, then SPF.',
  'This is normal: tightness, mild itch and flaking; color that looks too dark, then too light; patchy or uneven color while healing; one side healing a little differently; dry, chalky lips during week 2.',
  'Call me if you notice: redness or warmth that spreads; pus, yellow crust or red streaks; pain or swelling worse after 72 hours, or fever; blisters on your lips (possible cold sore); firm bumps weeks or months later.',
  'Call 911 for hives with trouble breathing, or swelling of the face or throat. Eyeliner: get urgent eye care for eye pain, vision changes, ongoing discharge or light sensitivity.',CALL]},
];
// sanity: no brackets left, no card-on-file question, no "email photos"
const all=JSON.stringify(forms)+JSON.stringify(guides);
const left=all.match(/\[[A-Za-z$0-9_][^\]]{0,40}\]/g);
if(left){console.error('PLACEHOLDERS LEFT:',left);process.exit(1);}
if(/card on file|card saved|credit card|booking system/i.test(all)){console.error('CARD-ON-FILE TEXT LEFT');process.exit(1);}
if(/email (me |us )?(your )?photos/i.test(all)){console.error('EMAIL-PHOTOS TEXT LEFT');process.exit(1);}
process.stdout.write('const PM_FORMS='+JSON.stringify(forms,null,0).replace(/\},"pm-/g,'},\n"pm-')+';\nconst PM_GUIDES='+JSON.stringify(guides).replace(/\},\{"id"/g,'},\n{"id"')+';\n');
console.error('forms',Object.keys(forms).length,'questions',Object.values(forms).reduce((a,f)=>a+f.qs.length,0),'guides',guides.length);
