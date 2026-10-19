// The Massage Therapist Collection (Ashley, 2026-10-19) -> app forms + guides, written from her PDF text.
// Same rules as the other collections (CLAUDE.md §1e): placeholders resolved to the PDF's own defaults
// so clients never see brackets; business name/phone become {business}/{phone|...}; therapist-only
// boxes (office use, treatment-plan table, SOAP notes, therapist signatures and license numbers, the
// health care provider's half of the clearance form, session records) stay on the printable record;
// no card-on-file question.
//   node scratchpad/mt/gen-mt.cjs > scratchpad/mt/mt-data.js
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
const PRESSURE=['1 Very light','2 Light','3 Medium','4 Firm','5 Very firm'];
const MORE='If you checked anything, tell us more';
const AGE_P='By signing, I confirm I am 18 or older (or have parent or guardian consent and presence per our policy and local law), have read this form, had my questions answered, and consent to ';
const AGE='By signing, I confirm I am 18 or older (or have parent or guardian consent per our policy and local law), have read this form, had my questions answered, and consent to ';
const PHOTO_OK='Before and after photos for my private record are OK. Social media use only with my separate OK.';

form('mt-intake','Massage client intake',h=>{
  h.st('Full name',true);h.dob();h.st('Mobile phone');h.st('Email');h.st('Address');
  h.st('Emergency contact & relationship');h.st('Their phone');h.st('How did you hear about us?');
  h.ss('Best way to reach you',['Text','Email','Call']);h.yn('OK to text you reminders?');
  h.mc('Which services are you booking? Check all that apply',['Swedish & relaxation','Deep tissue','Sports massage','Prenatal','Hot stone','Cupping','Lymphatic drainage','Chair or couples'],true);
  h.mc('Reasons today',['Relaxation','Pain','Stress','Injury','Sport','Post-surgery','Pregnancy']);
  h.ss('Pressure you prefer',[...PRESSURE,'Not sure yet']);
  h.lt('Areas you would like us to focus on');h.lt('Areas you would like us to avoid');
  // Her "Your massage history" grid: Yes / No per line, with a notes column.
  ['Had a professional massage before','Massage on a regular basis','Felt sore after a massage before','Bruise easily','Ticklish or sensitive areas',
   'Comfortable lying face down','Prefer to stay partly clothed','Prefer quiet during the session','Prefer a warm table','Want your feet or scalp included'].forEach(l=>h.yn(l));
  h.lt('Your massage history: there are no wrong answers. This helps your therapist plan a session you will feel comfortable in. Any notes on the lines above?');
  h.lt('What did you enjoy in past massages?');h.lt('Anything you did not enjoy?');
  h.mc('Your day is mostly',['Desk work','On your feet','Driving','Manual work','On a phone or tablet']);
  h.st('Exercise or sports & how often');
  h.ss('How well you sleep',['Well','Fair','Poorly','Varies']);
  h.ss('Your stress level this week (1 low, 10 high)',['1','2','3','4','5','6','7','8','9','10']);
  h.ci('Your health. Please answer every line. Some answers mean a gentler session or your doctor\'s OK first. Answers stay confidential. Check anything that applies to you.',[
    'High or low blood pressure','Heart condition','Blood clots or DVT, now or past','Blood thinners','Diabetes or neuropathy (numbness)','Cancer, now or in the past','Osteoporosis','Surgery in the past 6 months',
    'Injury in the past 3 months','Pregnant','Epilepsy or seizures','Skin condition, rash or sunburn','Varicose veins','Implanted device (pacemaker, port, pump)','Kidney disease','Fever, cold or contagious illness now']);
  h.st('If pregnant, how many weeks?');
  h.lt('Medications & supplements you take');h.st('Your physician\'s name & phone');
  h.lt('Anything else about your health your therapist should know?');
  h.mc('Are you allergic or sensitive to any of these? Check all that apply',['Nut oils (almond, coconut)','Fragrance or essential oils','Latex','Lotions or creams','Wool or fabric softener','None that I know of']);
  h.st('Reaction you had, and to what');
  h.yn('Botox or fillers, past 2 weeks?');h.yn('New tattoo, past 4 weeks?');
  h.init('My answers are true and complete. I\'ll tell you before each visit if my health or medications change.',
    'I\'ll tell my therapist right away if the pressure, temperature or any technique feels uncomfortable.',
    'Massage is not a substitute for medical care. My therapist does not diagnose or prescribe.',
    'I can ask to change or stop the session at any time, and my therapist may end it if continuing is unsafe.',
    'I am 18 or older, or a parent or guardian signs for me and is present per our policy.');
  h.yn('YOUR PRIVACY. Your information is kept confidential, stored securely and used only to provide your services. It is never shared without your written consent unless the law requires it. Records are kept 7 years. I have read this.',true);
  h.sig();
});

form('mt-treatment-plan','Body chart & treatment plan',h=>{
  h.name();h.st('Therapist');
  h.lt('Body chart: describe where you feel pain (P), tension or tightness (T), numbness or tingling (N), and any area to avoid (X), front and back');
  h.lt('Main concern & how long');h.lt('What makes it better or worse');
  const ZERO10=['0','1','2','3','4','5','6','7','8','9','10'];
  h.ss('Pain before (0 none, 10 worst)',ZERO10);h.ss('Pain after the session',ZERO10);
  h.mc('Your goals',['Relaxation','Less pain','Mobility','Stress relief','Recovery','Better sleep','Prenatal comfort']);
  h.lt('Treatment plan: focus areas, modalities, pressure (1 to 5) and frequency for sessions 1, 2 and 3');
  h.mc('Home care',['Gentle stretching','Heat','Ice','Rest','Posture breaks','Self-massage tool']);
  h.lt('Notes for home care & next visit');
  h.yn('CLIENT APPROVAL. I reviewed this plan with my therapist and agree to it. I understand results vary, the plan may change as we go, and I can change the pressure or stop the session at any time.',true);
  h.sig('Client signature');
});

form('mt-consent','Massage therapy consent',h=>{
  h.name();h.dob();h.lt('Massage service(s) I\'m consenting to',true);
  h.about('ABOUT MASSAGE',[['What massage involves','Hands-on techniques on muscles and soft tissue, with oil or lotion, while you rest under a sheet or blanket.'],['What it isn\'t','Not a diagnosis, treatment or cure, and not a substitute for care from your doctor or other provider.'],['You\'re in control','Change the pressure, skip any area, stay clothed, or stop at any time. Just say so.']]);
  h.risks('POSSIBLE EFFECTS',['Muscle soreness: tenderness for 24–72 hours, more likely after deeper or focused work','Bruising: light bruising can happen, especially with blood thinners or easy bruising','Lightheadedness: feeling dizzy or relaxed-heavy when you sit up, so rise slowly','Tiredness: feeling sleepy or low on energy for the rest of the day','Skin reaction: redness or itching from oils or lotions, most often nut oils or fragrance','Emotional release: tears or strong feelings can surface. This is normal; we can pause anytime','Temporary flare: old aches can feel more noticeable for a day before easing','Rare injury: serious injury from massage is rare. Honest health information helps prevent it'],
    'Please tell me if you are pregnant, take blood thinners, or have had recent surgery, injury, a clot or heart issues. Allergic to nuts or fragrance? A nut-free, unscented lotion is available. Some conditions need a doctor\'s OK first.');
  h.init('I\'ve read this page and had my questions answered. No specific result was promised to me.',
    'My health information is honest and complete. I\'ll share any changes before each session.',
    'I understand draping and boundaries: only the area being worked is uncovered, and I can stay clothed.',
    'I\'ll speak up about pressure, pain, temperature or discomfort, and I know I can stop the session at any time.',
    'Massage isn\'t medical care. My therapist doesn\'t diagnose or prescribe; I\'ll see my doctor.',
    'Sexual contact is never part of massage. Inappropriate behavior ends the session, charged in full.',
    'I\'m not under the influence of alcohol or drugs. My session may be declined or ended if I am.',
    'I release {business} from claims arising from health details I withheld, as state law allows.',
    'I am 18 or older, or my parent or guardian signs below and stays in the room for my session.');
  h.st('Parent or guardian name and relationship (if under 18)');
  h.sig();
});

form('mt-draping','Draping, boundaries & area consent',h=>{
  h.name();h.st('Phone');
  h.yn('HOW DRAPING WORKS. You undress to your comfort level in private, then lie under a sheet or blanket. Only the area being worked on is uncovered, then covered again. Genitals and the gluteal cleft are always draped. Breasts stay draped per state rules. You\'re welcome to stay partly or fully clothed. I have read this.',true);
  const YN=['Yes','No','Ask first'];
  ['Scalp','Face: jaw, forehead, around eyes','Neck: front of throat avoided','Chest wall: pectorals, above breast tissue','Abdomen: gentle, clockwise strokes','Glutes: over the drape','Upper inner thigh: never near the groin','Feet','Hands']
    .forEach(a=>h.ss('Area consent: '+a,YN,true));
  h.lt('Notes · areas to avoid');
  h.ss('Pressure',PRESSURE);
  h.mc('Oil or lotion',['Standard oil','Nut-free','Unscented','Lotion','No product']);
  h.lt('Areas to focus on');h.lt('Areas to skip entirely');
  h.ss('Music',['On','Soft','Off']);h.ss('Talking',['Chat is fine','Quiet','Check-ins only']);
  h.ss('Door',['Locked','Unlocked']);h.mc('Temperature',['Warmer','Cooler','Heated table']);
  h.ss('Therapist gender (optional)',['No preference','Female','Male','Other']);
  h.lt('Anything else that helps you feel safe and comfortable? (optional)');
  h.yn('Genital contact is never part of massage. The session ends if behavior is inappropriate, from either side. You can change your consent at any time, before or during your session, just by saying so. I\'ll always ask. I have read this.',true);
  h.sig();
});

// Part 1 only: part 2 is completed and signed by the client's health care provider, on the printable.
form('mt-clearance','Physician clearance for massage',h=>{
  h.name();h.dob();h.st('Phone');
  h.mc('Reason clearance is requested',['High-risk pregnancy','Recent surgery','Cosmetic surgery, before lymphatic drainage','Cancer, now or in treatment','Heart or circulation condition','Other'],true);
  h.st('If pregnant, how many weeks?');
  h.lt('Condition or procedure & date',true);
  h.mc('Requested',['Swedish','Deep tissue','Prenatal','Hot stone','Cupping','Lymphatic drainage']);
  h.yn('Some health conditions mean massage should wait, or be adjusted, until your health care provider agrees. This form shares only the information you authorize, and only for planning your massage care. I authorize my provider to share this form with {business}. I can withdraw this in writing at any time.',true);
  h.sig('Client signature');
});

form('mt-policy','Booking, cancellation & studio policy',h=>{
  h.name();h.date('Appointment date');
  h.yn('BOOKING & CANCELLATION. Your appointment time is reserved just for you. These policies keep things fair for every client and help every session feel safe, calm and professional. Notice to change: 24 hours, to cancel or reschedule at no charge. No-show: 100% of the booked service is charged. Late arrival: full price; your session still ends on time so the next client starts on time. Booking: a deposit holds your time. Deposits go toward your service. Late cancellation: less than 24 hours\' notice is charged 50% of the service. Sudden illness? Message us and we\'ll do our best. I have read this.',true);
  h.yn('YOUR VISIT & STUDIO CONDUCT. Health changes: tell us before each visit about new injuries, surgery, medications or pregnancy. Some need your doctor\'s clearance first. Feeling unwell? Fever, a cold, a contagious illness or a skin infection? Please reschedule. We waive the fee when you let us know. Professional conduct: every session is therapeutic and professional, and you stay draped except for the area being worked on. Sexual comments, requests or behavior end the session at once, charged in full. Alcohol & drugs: we can\'t massage anyone under the influence. The session is canceled and charged in full. Minors: under 18? A parent or guardian signs consent and stays in the room. Gratuity: gratuity is appreciated but never expected. Gift cards & packages: gift cards can\'t be exchanged for cash. Packages are non-refundable and expire 12 months after purchase. Refunds: services can\'t be refunded once performed. Tell us during your session if anything feels wrong so we can adjust right away. I have read this.',true);
  h.init('I understand late cancellations and no-shows are charged as described above.',
    'I\'ll keep my health information up to date and I agree to the professional conduct policy.');
  h.sig('By signing, I confirm I\'ve read and agree to this policy, including the cancellation, no-show and conduct terms.');
});

// ---- the six service consents, in the order each printable page runs ----
form('mt-swedish-consent','Swedish & relaxation consent',h=>{
  h.name();h.st('Therapist');
  h.about('ABOUT THIS SERVICE',[['What it is','Flowing, light to moderate strokes, kneading and gentle stretches to help you relax and ease tension.'],['What to expect','You undress to your comfort level in private and stay draped under a sheet. It should feel good.'],['How long effects last','Most people feel looser and calmer for a day or two. Regular sessions every 2–4 weeks help most.']]);
  h.ss('Today\'s session',['60 min','90 min','120 min'],true);
  h.mc('Add-ons',['Hot towels','Aromatherapy']);
  h.mc('Focus areas',['Full body','Back','Neck & shoulders','Legs & feet','Arms & hands','Scalp']);
  h.risks('POSSIBLE EFFECTS',['Mild tenderness for 24 to 48 hours, like after a workout','Skin reaction to an oil, lotion or essential oil','Easy bruising if you take blood thinners','Feeling lightheaded or sleepy when you first sit up','Brief redness of the skin where strokes were firm','A short flare of an old ache as muscles let go']);
  h.ci('Quick health check: check anything that applies to you.',['Fever, cold or feeling unwell','Recent surgery or injury','High blood pressure or heart issue','Diabetes or numbness','Blood clot or DVT, ever','Pregnant or may be pregnant','Rash, sunburn or open skin','Cancer or current treatment','Blood thinners or bleeding disorder','Osteoporosis','Varicose veins','Recent Botox, filler or tattoo']);
  h.lt(MORE);
  h.ss('ABOUT OILS AND SCENTS. Our usual oil may contain nut oils. A nut-free, unscented lotion is always available, and aromatherapy is optional.',['Nut-free, unscented','Usual oil is fine'],true);
  h.init('I\'ve shared my full health and medication history, and I\'ll tell my therapist about any changes.',
    'I understand massage is for relaxation and wellness. It does not diagnose, treat or replace medical care.',
    'I\'ll speak up if pressure is too much or too little, or if anything feels uncomfortable or painful.',
    'I can change pressure, skip an area or stop the session at any time, for any reason.',
    'I\'ll stay draped at all times. Glutes, abdomen or chest wall are worked only with my OK first.',
    'I\'ve told my therapist about any allergies to nuts, oils, lotions or scents.',
    'Inappropriate behavior or arriving intoxicated ends the session at once, charged in full.',
    'Fees, late arrival and cancellations follow {business} policy, which I\'ve read.');
  h.sig(AGE_P+'the massage I checked above.');
});

form('mt-deep-consent','Deep tissue & sports consent',h=>{
  h.name();h.st('Therapist');
  h.about('ABOUT THIS SERVICE',[['What it is','Slow, firm pressure into deeper muscle layers, focused on tight or overworked areas.'],['What to expect','Strong but tolerable pressure, worked in gradually. You undress in private and stay draped.'],['How long effects last','Some soreness for 1 to 3 days, then easier movement. Regular sessions every 2–4 weeks help most.']]);
  h.ss('Today\'s session',['60 min','90 min','120 min'],true);
  h.mc('Add-ons',['Hot towels','Aromatherapy']);
  h.mc('Focus areas',['Back','Neck & shoulders','Legs & feet','Hips & glutes*','Arms']);
  h.risks('POSSIBLE EFFECTS',['Muscle soreness for 24 to 72 hours, like after training','Feeling lightheaded or tired when you first sit up','Brief discomfort while a tight area releases','Light bruising, more likely if you bruise easily','Skin reaction to an oil, lotion or essential oil','Redness or tenderness where pressure was firm']);
  h.yn('ABOUT PRESSURE. Deep work should never be sharp or make you hold your breath. On a 1 to 10 scale we stay at about 7 or below, and I\'ll check in often. Tell me any time. I have read this.',true);
  h.ci('Quick health check: check anything that applies to you.',['Blood thinners or bleeding disorder','Recent surgery or fracture','High blood pressure or heart issue','Diabetes or numbness','Blood clot or DVT, ever','Injury in the last 72 hours','Pain meds or muscle relaxants today','Varicose veins','Osteoporosis or fragile bones','Pregnant or may be pregnant','Steroid use (thin skin)','Rash, sunburn or open skin']);
  h.lt(MORE);
  h.init('I\'ve shared my full health and medication history, and I\'ll tell my therapist about any changes.',
    'I understand massage supports wellness and recovery. It does not diagnose, treat or replace medical care.',
    'I\'ll speak up right away if pressure feels sharp, numb, tingly or more than I can relax into.',
    'I can change pressure, skip an area or stop the session at any time, for any reason.',
    'I\'ll stay draped. *Glutes, inner thigh, abdomen or chest wall are worked only with my OK first.',
    'I understand soreness or light bruising can follow deep work, and results aren\'t guaranteed.',
    'I\'ve shared any nut, oil or scent allergies. A nut-free, unscented lotion is available.',
    'Intoxication or inappropriate behavior ends the session, charged in full.');
  h.sig(AGE_P+'the massage I checked above.');
});

form('mt-prenatal-consent','Prenatal massage consent',h=>{
  h.name();h.st('Therapist');
  h.st('Weeks pregnant · due date',true);h.st('Prenatal care provider');h.st('Provider phone');
  h.about('ABOUT THIS SERVICE',[['What it is','Gentle massage adapted for pregnancy, with you on your side or semi-reclined on pillows.'],['What to expect','About 60 minutes, light to moderate pressure. Breaks or position changes anytime.'],['How long it lasts','Ease often lasts a day or two. Many clients book every 2–4 weeks as pregnancy goes on.']]);
  h.risks('POSSIBLE EFFECTS AND RISKS',['Mild tenderness in the back or hips for a day or two','Feeling faint lying flat, so we avoid that position','Skin reaction to oil or lotion (nut-free on request)','Lightheadedness when you sit up or change position','Heartburn or nausea in some positions','Leg cramps; tell me and I\'ll adjust right away'],
    'Massage doesn\'t replace prenatal care. Your therapist doesn\'t diagnose or treat conditions.');
  h.ci('Quick pregnancy health check: check anything that applies to you.',['High BP or pre-eclampsia','Gestational diabetes','Bleeding this pregnancy','Heart or kidney condition','Placenta previa or abruption','Twins or multiples','Severe swelling or headaches','Blood thinners or other meds','Preterm labor history','Blood clot or clotting disorder','Varicose veins','Nut or fragrance allergy']);
  h.lt(MORE);
  h.mc('Today\'s session',['Side-lying','Semi-reclined, left tilt','Postpartum','Clearance on file'],true);
  h.init('I\'ve shared my health and pregnancy history honestly and will tell you about any changes at each visit.',
    'I\'m under the care of a prenatal provider. If my pregnancy is high-risk, I\'ll bring written clearance first.',
    'I understand I won\'t lie flat on my back after about 20 weeks. I\'ll say if any position feels uncomfortable.',
    'I\'ll speak up right away about dizziness, nausea, cramping, pain or anything that doesn\'t feel right.',
    'You\'ll stop and refer me to my provider for warning signs such as bleeding, contractions or leaking fluid.',
    'Leg pressure stays light, with no deep abdominal work. I can change pressure or stop anytime.',
    'Sensitive areas such as the abdomen or glutes are worked only with my OK, which I can withdraw.',
    'Fees follow {business} policy. Cancellations for pregnancy reasons or labor are waived.');
  h.sig(AGE+'prenatal massage today and at future visits this pregnancy.');
});

form('mt-hot-stone-consent','Hot stone massage consent',h=>{
  h.name();h.st('Therapist');
  h.about('ABOUT THIS SERVICE',[['What it is','Smooth, heated basalt stones that glide with oil as an extension of your therapist\'s hands.'],['What to expect','About 60–90 minutes. Every stone is temperature checked before it touches your skin.'],['How long it lasts','Warmth and relaxation often linger for hours. Light pinkness fades within a few hours.']]);
  h.mc('Today\'s session',['Full body','Back, neck & shoulders','Add-on to massage','Cool stones, if offered'],true);
  h.risks('POSSIBLE EFFECTS AND RISKS',['Skin redness or pinkness that fades within hours','Feeling too warm, lightheaded or very sleepy','Skin reaction to oil or lotion (nut-free on request)','Discomfort from the weight of a placed stone','A burn or blister if a stone is too hot','Mild muscle tenderness for a day or two','Bruising, more likely if you take blood thinners','Less heat warning where feeling is reduced']);
  h.ci('Quick health check: check anything that applies to you.',['Diabetes or numbness (neuropathy)','High blood pressure','Blood thinners','Varicose veins','Poor circulation','Heart condition','Sunburn, rash or skin condition','Recent Botox or fillers','Heat sensitivity or MS','Pregnant','Recent injury or swelling','Nut or oil allergy']);
  h.lt(MORE);
  h.ss('ABOUT HEAT AND SAFETY. Stones are heated in a professional heater, thermometer checked and tested on your therapist\'s skin first.',['I prefer mild warmth','I prefer it warmer'],true);
  h.init('I\'ve shared my health history honestly, including diabetes, circulation, heat sensitivity and medications.',
    'I understand the risks above, including the small chance of a burn if a stone is too hot.',
    'I\'ll tell my therapist right away if any stone feels too hot, uncomfortable or too heavy.',
    'Placed stones rest on a sheet or towel and are never left under my body on bare skin.',
    'I can ask for less heat, change pressure, or stop the session at any time.',
    'Sensitive areas are worked only with my prior OK, which I can withdraw at any time.',
    'I\'ll check my skin afterward and report any blister, burn or redness that doesn\'t fade.',
    'Fees follow {business} policy, including cancellation and late arrival.');
  h.sig(AGE+'the hot stone service I checked above.');
});

form('mt-cupping-consent','Cupping therapy consent',h=>{
  h.name();h.st('Therapist');
  h.about('ABOUT THIS SERVICE',[['What it is','Gentle suction from silicone, plastic or glass cups lifts skin and muscle. Cups stay still or glide.'],['What to expect','About 30–60 minutes, alone or in a massage. A pulling feeling, never sharp pain. No fire used.'],['How long marks last','Round marks are common and usually fade in about 3–10 days. They usually aren\'t painful.']]);
  h.mc('Today\'s session',['Static cups','Gliding cups','Cupping with massage'],true);
  h.st('Areas');
  h.risks('POSSIBLE EFFECTS AND RISKS',['Round marks or discoloration for 3–10 days','Temporary redness, itching or skin sensitivity','Bruising, more likely with blood thinners','Irritation from an oil or the cup material','Tenderness or mild soreness in cupped areas','Light-headedness, more likely on an empty stomach','Rarely, blisters or broken skin from strong suction','Marks may show in photos or sleeveless clothes']);
  h.ss('Blood thinners or a bleeding disorder? Cupping is usually skipped. We\'ll choose a different treatment unless your physician has given a written OK.',['Doesn\'t apply to me','Physician OK on file'],true);
  h.ci('Quick health check: check anything that applies to you.',['Bleeding disorder','Active cancer or treatment','Very thin or fragile skin','Sunburn or rash','Diabetes or neuropathy','Blood thinners or daily aspirin','Pacemaker or implanted device','Steroid medication','Open wounds or skin lesions','Recent surgery or injury','Pregnant','Varicose veins','Bruise easily or anemia','Tattoo under 2–4 weeks old','Fever or feeling unwell']);
  h.lt(MORE);
  h.init('I\'ve shared my full health history honestly, including all medications and blood thinners.',
    'I understand cupping usually leaves round marks that fade in about 3–10 days.',
    'I\'ll speak up right away if the suction feels too strong, sharp, hot or numb.',
    'Cups avoid the front of my neck, large blood vessels, bony areas, moles and broken skin.',
    'Only dry cupping is offered. No fire is used and skin is never cut (wet cupping isn\'t offered).',
    'Cupping doesn\'t diagnose or treat medical conditions and doesn\'t replace care from my doctor.',
    PHOTO_OK,
    'Deposits, fees and cancellations follow {business} policy.');
  h.sig(AGE+'cupping therapy as checked above.');
});

form('mt-lymphatic-consent','Lymphatic drainage consent',h=>{
  h.name();h.st('Therapist');
  h.about('ABOUT THIS SERVICE',[['What it is','Very light, rhythmic strokes that gently stretch the skin to guide lymph toward your nodes.'],['What to expect','About 45–60 minutes, mostly on your back, draped. The touch is gentle and very relaxing.'],['How long it lasts','Effects vary. After surgery, sessions are often booked as a series on your surgeon\'s timeline.']]);
  h.risks('POSSIBLE EFFECTS AND RISKS',['Needing to urinate more often for a few hours','Mild tenderness over healing or swollen areas','Skin irritation from oil, lotion or garments','Feeling tired, thirsty or light-headed afterward','Swelling that changes from day to day','Fluid shifts that can strain the heart or kidneys'],
    'Massage therapists don\'t diagnose or treat conditions. This work supports, never replaces, your medical care.');
  h.ci('Quick health check: check anything that applies to you.',['Fever or infection, last 24 hrs','Congestive heart failure','Lymphedema','High or low blood pressure','Unexplained swelling','Cellulitis','Kidney failure or disease','Aneurysm','Thyroid condition','Blood thinners','Blood clot (DVT), now or past','Active cancer or treatment','Recent surgery','Past radiation treatment','Pregnant']);
  h.lt(MORE);
  h.mc('Today\'s session',['Wellness drainage','Post-surgical','Face & neck','Full body'],true);
  h.st('After surgery: procedure');h.date('Surgery date');h.yn('Surgeon clearance on file');
  h.init('I\'ve shared my full health history honestly, including heart, kidney, clotting and cancer history.',
    'I understand the pressure is very light on purpose. Deeper pressure doesn\'t work better here.',
    'After surgery, my surgeon\'s written clearance is on file and I\'ll follow their compression advice.',
    'I understand incisions, drains and fresh scars are worked around, never pressed on.',
    'I\'ll speak up right away if I feel dizzy, short of breath, in pain or unwell, so we can stop.',
    'I understand results vary, and this session doesn\'t diagnose, cure or replace medical care.',
    'Deposits, fees and cancellations follow {business} policy.',
    PHOTO_OK);
  h.sig(AGE+'manual lymphatic drainage as checked above.');
});

// ---- guides (aftercare & prep handouts) ----
const CALL='Questions? Text {phone|me} · {business}';
const P=['massage'];
const guides=[
 {id:'g-mt-swedish',icon:'🌿',title:'After your Swedish massage',cat:'Aftercare',profs:P,tips:[
  'Your muscles have softened and your body has had time to settle. A few easy habits help that loose, relaxed feeling last.',
  'Today (right after). Normal: feeling sleepy, relaxed or a little lightheaded when you first stand. Do: sit up slowly; drink water if you\'re thirsty; rest, or take a warm bath or shower tonight. Avoid: rushing off, driving while groggy, alcohol, or a hard workout straight after.',
  '24–72 hours (settling in). Normal: mild tenderness for a day or two, like after gentle exercise. Do: gentle stretching, a short walk and a warm compress or bath for any tender spots. Avoid: heavy training on sore muscles; pressing hard on tender areas to test them.',
  'The week (keep it going). Normal: tension may creep back with stress, long drives or desk work. Do: take stretch breaks, check your posture and keep up the habits that felt good. Avoid: holding one position for hours; ignoring an ache that keeps getting worse.',
  'Next visit (in 2–4 weeks). Normal: regular sessions often feel deeper as your body learns to let go. Do: tell me what felt good, any soreness, and any new health changes or medications. Avoid: booking on the same day as a new injury, fever or a fresh tattoo or sunburn.',
  'Good to know: feeling emotional or very sleepy is normal; a warm bath with Epsom salt can ease tenderness; shower off oil if it bothers your skin or clothes; sleep well tonight, relaxation often deepens rest; water is for comfort, drink what feels right to you; soreness should fade within about 48 hours; tell me if any oil or scent irritated your skin; gentle movement helps more than staying still.',
  'Slow down: give yourself a quiet hour after. Stay warm: warm bath, shower or compress. Move gently: stretch and walk; no hard training. Rest well: sleep helps your body recover.',
  'Call your doctor if you notice: one calf swollen, red, warm or painful; numbness or tingling that doesn\'t fade; bruising that spreads or keeps growing; pain that gets worse instead of better.',
  'Chest pain or sudden shortness of breath: call 911. Then let me know so I can note it in your record.',CALL]},
 {id:'g-mt-deep',icon:'💪',title:'After deep tissue massage',cat:'Aftercare',profs:P,tips:[
  'Deep work asks a lot of your muscles, so some soreness is normal. These habits help you recover comfortably.',
  'Today (right after). Normal: feeling tired, a little lightheaded or tender in the areas we worked. Do: sit up slowly; drink water if you\'re thirsty; ice or heat, whichever feels better. Avoid: heavy training or long runs for 24 hours; alcohol and hot tubs tonight.',
  '24–72 hours (recovery). Normal: soreness like after a hard workout, maybe light bruising, easing daily. Do: gentle stretching, walking, a warm bath, or ice for 10 to 15 minutes on sore spots. Avoid: pressing on or rolling bruised spots; training hard through sharp or worsening pain.',
  'The week (back to it). Normal: freer movement and less tightness, even if some returns with load. Do: ease back into training; keep up stretching, sleep and any exercises I suggested. Avoid: jumping straight to your heaviest sessions, or ignoring worsening pain.',
  'Next visit (in 2–4 weeks). Normal: each session tends to feel less sore as your tissue adapts to the work. Do: tell me how long soreness lasted, any bruising, and any new injury or medication. Avoid: booking on the day of a race, a new injury, or right after a hard training block.',
  'Good to know: soreness for 1 to 3 days is common after deep work; ice calms hot, sore spots, heat eases stiffness; muscle soreness should ease a little each day; sleep and gentle movement speed recovery; light bruising can happen, more so on blood thinners; water is for comfort, drink what feels right to you; tell me what pressure felt right for next time; plan big events 2–3 days after deep work.',
  'Ease off: no heavy training for 24 hours. Ice or heat: whatever feels best on sore spots. Stretch gently: short, easy stretches, no bouncing. Rest well: sleep is when you recover.',
  'Call your doctor if you notice: one calf swollen, red, warm or painful; numbness or tingling that doesn\'t fade; bruising that spreads or keeps growing; sharp pain or soreness past 3 days.',
  'Chest pain or sudden shortness of breath: call 911. Then let me know so I can note it in your record.',CALL]},
 {id:'g-mt-prenatal',icon:'🤰',title:'After your prenatal massage',cat:'Aftercare',profs:P,tips:[
  'Pregnancy asks a lot of your body. These habits help you keep the ease from your session and know what to watch for.',
  'Getting up (right after). Normal: feeling relaxed, sleepy or a little lightheaded as you sit up. Do: roll to your side, push up slowly and sit a moment before standing. Avoid: jumping up quickly, or driving if you feel dizzy.',
  'Today (first 24 hours). Normal: mild tenderness in your back or hips, and feeling calm or tired. Do: rest, sip water, have a snack. A warm, not hot, shower is lovely. Avoid: hot tubs, saunas and very hot baths; strenuous activity.',
  'Tonight (sleeping). Normal: settling may feel easier. Some aches return as your baby moves. Do: sleep on your side with a pillow between your knees and under your bump. Avoid: lying flat on your back for long stretches after about 20 weeks.',
  'Ongoing (between visits). Normal: aches shift as your bump grows. That is very common. Do: gentle walks and stretches your provider approves; rebook in 2–4 weeks. Avoid: deep rubbing or massagers on your calves or inner legs.',
  'Your provider: mention your massage at prenatal visits, and tell me about any new diagnosis. After baby: postpartum massage is welcome when you feel ready. After a C-section, wait for your provider\'s OK, usually around 6 weeks.',
  'Side sleep: pillows under your bump and between your knees. Sip water: keep a bottle nearby for comfort through the day. Move gently: short, easy walks ease stiffness. Feet up: rest with your feet raised when ankles swell.',
  'Call your provider right away if you notice: vaginal bleeding or fluid leaking; a severe headache or changes in vision; pain, warmth or swelling in one calf; regular contractions or cramping; sudden swelling of your face or hands; your baby moving less than usual. Then let me know, so I can adjust or pause your sessions.',
  'Chest pain, trouble breathing or fainting: call 911.',CALL]},
 {id:'g-mt-hot-stone',icon:'🪨',title:'After your hot stone massage',cat:'Aftercare',profs:P,tips:[
  'Warmth helps muscles let go, and the ease can last for hours. These steps keep your skin comfortable and show you what is normal.',
  'Right after (first few hours). Normal: skin looks pink or flushed where stones were. You may feel warm and sleepy. Do: sip water, get up slowly, and let your body cool down gradually. Avoid: driving if you feel lightheaded; rushing straight into a busy day.',
  'Today (rest of the day). Normal: pinkness fades within a few hours and doesn\'t hurt. Muscles feel loose. Do: wear loose clothing. A lukewarm shower removes leftover oil. Avoid: hot tubs, saunas, sunbathing, and heating pads on warm skin.',
  'Days 1–2 (settling). Normal: mild muscle tenderness can happen, then it eases. Do: gentle stretching, walking and rest. Ice or warmth, whichever feels good. Avoid: intense workouts if you feel sore; ignoring any skin change.',
  'Burn check (if skin looks off). Normal: redness that stings, lingers or blisters is a burn, not normal pinkness. Do: cool, not icy, running water for 20 minutes. Then call me. Avoid: ice right on skin, popping blisters, butter or greasy creams.',
  'Good to know: normal pinkness is even, painless and fades in hours; your stones were washed and disinfected before use; feeling thirsty after warmth is common, sip water; reduced feeling in an area? Check that skin tonight; tell me next time if any stone felt too hot; oil may linger on skin and hair, a shower removes it.',
  'Rise slowly: sit a moment before you stand. Cool down: let warmth fade on its own. Check skin: look tonight where stones were. Skip the heat: no hot tubs or sun today.',
  'Call me right away if you notice: a blister, or skin that is white, shiny or very sore; swelling, or pain that gets worse instead of better; redness that is still there the next day; dizziness or faintness that doesn\'t pass.',
  'For a burn, cool it under running water for 20 minutes first, then call. Large, deep or facial burns, chest pain or trouble breathing: call 911.',CALL]},
 {id:'g-mt-cupping',icon:'⭕',title:'After your cupping',cat:'Aftercare',profs:P,tips:[
  'Cupping marks are normal and fade on their own. Here\'s what to expect and how to help your skin and muscles settle after your session.',
  'Today (marks appear). Normal: round pink, red or purple marks. Areas may feel warm, tight or a little tender. Do: keep marked areas warm and covered. Rest, and drink water if you like. Avoid: hot tubs, saunas, cold plunges and intense exercise for 24 hours.',
  'Days 1–3 (settling in). Normal: marks may darken slightly before they fade. Mild itching or stiffness is common. Do: warm showers, gentle stretching and loose, soft clothing over marks. Avoid: sun on marked skin; scrubbing, exfoliating or scratching itchy areas.',
  'Days 3–10 (fading). Normal: marks lighten to yellow or brown, then fade. Darker marks take longer. Do: cover marks with clothing, or use sunscreen on them outdoors. Avoid: cupping, scrubs or strong pressure on the same area until marks fade.',
  '2–4 weeks (next visit). Normal: areas feel looser. Marks may be lighter with repeat sessions. Do: book your next session. Tell me about health or medication changes. Avoid: starting blood thinners or new medications without letting me know.',
  'Good to know: mark color varies from person to person; dark marks aren\'t a sign of "toxins" leaving; light-headed afterward? Sit, rest and have a snack; cupping supports comfort, it doesn\'t cure conditions; marks usually aren\'t painful to touch; marks may show in photos and sleeveless clothes; plan big events around visible marks; tell your doctor about cupping if they ask about marks.',
  'Stay warm: cover cupped areas and skip drafts today. Go easy: no hard workouts for 24 hours. Skip the sun: marked skin can burn more easily. Hands off: don\'t scratch, scrub or pick at marks.',
  'Call me right away if you notice: blisters or broken skin in a cupped area; warmth, swelling or pus around a mark; pain that gets worse instead of better; marks still dark after 2 weeks.',
  'Spreading redness, pus or fever: please see a doctor. Chest pain, trouble breathing or fainting: call 911.',CALL]},
 {id:'g-mt-lymphatic',icon:'💧',title:'After lymphatic drainage',cat:'Aftercare',profs:P,tips:[
  'Gentle lymphatic work keeps your body busy for a few hours after you leave. Here\'s what\'s normal, what helps, and when to call.',
  'Today (first hours). Normal: needing to urinate more often. Feeling relaxed, sleepy or thirsty. Do: drink water and rest. Wear compression exactly as your surgeon advised. Avoid: hot tubs, saunas and heavy exercise; alcohol tonight.',
  'Days 1–3 (settling in). Normal: swelling may ease, then vary day to day. Mild tenderness can happen. Do: take gentle walks. Keep incisions clean and dry as your surgeon directs. Avoid: taking compression off early; pressing or rubbing firm areas yourself.',
  'Ongoing (between visits). Normal: changes are gradual. Some days feel puffier than others, especially when warm. Do: follow your surgeon\'s plan. Light movement, rest and regular meals. Avoid: skipping follow-up visits with your surgeon or doctor.',
  'Next visit (as planned). Normal: sessions are often booked as a series. Results vary for everyone. Do: book as planned. Tell me about new symptoms, medications or surgeon advice. Avoid: waiting it out if swelling suddenly gets worse. Call instead.',
  'After surgery: your surgeon\'s instructions come first. If anything on this page differs from what your surgeon told you, follow your surgeon and let me know so we can adjust your sessions.',
  'Good to know: extra bathroom trips are normal and expected; this work moves fluid, it doesn\'t "flush toxins"; raising your legs can ease leg swelling; the pressure is light on purpose, deeper isn\'t better; garments should feel snug, never painful or numbing; results build over a series and vary person to person.',
  'Rest up: give your body a quiet few hours after. Sip water: thirst after a session is common. Keep moving: short, gentle walks help fluid move. Garment on: wear compression as your surgeon advised.',
  'Call your surgeon or doctor right away if you notice: fever or chills; fluid or pus leaking from an incision; redness that spreads, or warm, hard swelling; pain, swelling or warmth in one calf or leg.',
  'Shortness of breath or chest pain: call 911 right away. Please let me know too, so we can pause sessions until you\'re cleared.',CALL]},
 {id:'g-mt-prep',icon:'📅',title:'Before your massage',cat:'Pre-care',profs:P,tips:[
  'For relaxation, deep tissue, prenatal, hot stone, cupping and lymphatic sessions. A little prep helps you relax and get the most from your time.',
  '1 week before: tell me about changes: new medications, an injury, surgery or pregnancy. Fill in your intake form ahead of time if I\'ve sent one. New tattoo, Botox or fillers? Let me know so we can work around those areas. Think about what you\'d like: areas to focus on, areas to skip, pressure.',
  'Day before your session: hydrate well. Water helps you feel comfortable on the table. Skip alcohol the day before and the day of your session. Sensitive skin? Avoid shaving or waxing right before; oil can sting fresh skin. Go easy on the sun; sunburned skin can\'t be massaged.',
  'Day of your appointment: eat lightly about 1 hour before, not a big meal. Arrive 10 minutes early to settle in and update your health form. Use the restroom first, and leave jewelry at home. Skip heavy perfume; scents linger in the room for others.',
  'Prenatal: tell me how many weeks along you are; high-risk pregnancy? Bring your provider\'s clearance; you\'ll rest side-lying with pillows for support; bring water and a snack.',
  'Post-op lymphatic: bring your surgeon\'s written clearance; wear or bring your compression garment; know your surgery date and any drains; expect to need the restroom after.',
  'Hot stone & cupping: diabetes, neuropathy, heat sensitivity or blood thinners? Tell me first; cupping marks can last 3–10 days, plan around events; no stones or cups on sunburn or new tattoos; too hot? Say so right away.',
  'Please text to reschedule if you have: a fever, cold, flu or other contagious illness; a contagious skin rash or infection; recent surgery without your doctor\'s OK; a new injury in the last 48–72 hours; sunburn on the areas to be massaged; felt unwell or dizzy today. I ask for 24 hours\' notice. If it\'s about your health or safety, just text. We\'ll find a new time together.',
  'One calf swollen, red, warm or painful? Don\'t come in. It can be a blood clot; get medical care today.',
  'What to expect: you\'ll undress to your comfort level in private and rest under a sheet. Only the area being worked is uncovered. I\'ll check in on pressure, and you can speak up, stay clothed or stop at any time.',CALL]},
 {id:'g-mt-self-care',icon:'🧘',title:'Your self-care guide',cat:'Aftercare',profs:P,tips:[
  'Simple ways to feel good between sessions: after-massage care, gentle stretches, heat or ice, and when to call a doctor.',
  'After your massage (the rest of today). Rest: take it easy. Skip hard workouts for 24 hours after deep work. Warm bath: a warm bath or shower helps muscles stay relaxed. Move gently: a short walk and easy stretches ease stiffness. Water: sip water if you\'re thirsty. It simply helps you feel good.',
  'Gentle stretches (hold 20–30 seconds, breathe). Neck side stretch: sit tall and tip one ear toward your shoulder. Keep shoulders down. Doorway chest: forearms on a door frame, then step through until your chest opens. Seated hamstring: sit on a chair edge, one heel out, and hinge forward from your hips. Cat-cow: on hands and knees, slowly round your back, then let it gently dip.',
  'Heat or ice? Heat: for tight, stiff muscles. Warm, not hot, for 15–20 minutes. Ice: for a new bump or swelling. Wrap it; 10–15 minutes at a time. Skip both: numb skin, diabetes or poor circulation? Ask your doctor. Not sure? Choose what feels better, and always use a cloth barrier.',
  'Sore tomorrow? Mild soreness for 24–72 hours is common after deeper work. Never stretch into pain: a gentle pull is right. Sharp pain or tingling means ease off. When to rebook: every 2–4 weeks for upkeep; sooner for a specific concern.',
  'Posture at your desk. Screen height: top of the screen at eye level. Sit back: feet flat, low back supported. Soft shoulders: elbows in, shoulders relaxed. Move often: get up every 30–60 minutes.',
  'This is normal: mild soreness or tenderness for 24–72 hours; feeling sleepy, relaxed or a little thirsty; light redness that fades within hours; a small, faint bruise that fades in days; feeling emotional after a session; old aches feeling noticeable for a day.',
  'Call your doctor if you notice: a bruise that grows, or is very painful; numbness or tingling that doesn\'t go away; soreness that gets worse after 3 days; a rash or itching from oil or lotion; a headache or dizziness that won\'t ease; swelling in a joint, or pain with fever.',
  'Get urgent care for pain, swelling, warmth or redness in one calf or leg. It can be a blood clot. Call 911 for chest pain, sudden shortness of breath, or trouble breathing.',CALL]},
];
// sanity: no brackets left, no card-on-file question, no "email photos", no "tick", no em dashes
const all=JSON.stringify(forms)+JSON.stringify(guides);
const left=all.match(/\[[A-Za-z$0-9_ ][^\]]{0,40}\]/g)||all.match(/\[\s*\]/g);
if(left){console.error('PLACEHOLDERS LEFT:',left);process.exit(1);}
if(/card on file|card saved|credit card|booking system/i.test(all)){console.error('CARD-ON-FILE TEXT LEFT');process.exit(1);}
if(/email (me |us )?(your )?photos/i.test(all)){console.error('EMAIL-PHOTOS TEXT LEFT');process.exit(1);}
if(/\btick(?!lish)/i.test(JSON.stringify(forms))){console.error('"TICK" IN CLIENT WORDING');process.exit(1);}
if(/—/.test(all)){console.error('EM DASH LEFT');process.exit(1);}
if(/Your Business Name|\[Phone\]|\[Website\]|\[Email\]|\[Fax\]/.test(all)){console.error('BUSINESS PLACEHOLDER LEFT');process.exit(1);}
for(const [id,f] of Object.entries(forms)){
  if(!id.startsWith('mt-'))throw new Error('bad form id '+id);
  const ids=new Set(f.qs.map(q=>q.id));if(ids.size!==f.qs.length)throw new Error('dup question id in '+id);
  if(f.qs[f.qs.length-1].type!=='Signature')throw new Error('form does not end in a signature: '+id);
  f.qs.forEach(q=>{if((q.type==='Single select'||q.type==='Multiple choice')&&!(q.options&&q.options.length>1))throw new Error('select without options '+q.id);
    if(q.type==='Contraindications'&&!(q.items&&q.items.length))throw new Error('contra without items '+q.id);});
}
if(new Set(guides.map(g=>g.id)).size!==guides.length)throw new Error('dup guide id');
guides.forEach(g=>{if(!/^g-mt-/.test(g.id)||g.profs.join()!=='massage')throw new Error('bad guide '+g.id);});
process.stdout.write('const MT_FORMS='+JSON.stringify(forms,null,0).replace(/\},"mt-/g,'},\n"mt-')+';\nconst MT_GUIDES='+JSON.stringify(guides).replace(/\},\{"id"/g,'},\n{"id"')+';\n');
console.error('forms',Object.keys(forms).length,'questions',Object.values(forms).reduce((a,f)=>a+f.qs.length,0),'guides',guides.length);
