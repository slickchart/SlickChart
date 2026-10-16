# Build one spine, then tune it per trade

A "Beauty Biz Master Build Roadmap" should teach every beauty professional to build the **same six-part spine first** (client list with export and backup, service menu with time and price, booking page with her policy agreed at booking, email confirmation and reminder, intake and consent with e-signature plus client records and photos, and payments through hosted checkout), and only then layer on the handful of features her trade cannot live without. The research shows that trades differ far less in *what* they need than in **two things: their timing rules and their records**. A lash fill is only a fill inside a window, a colorist's chair is free while color processes, PMU is a two-visit package, an injector cannot rebook toxin sooner than every three months, and a piercing needs a downsize check. On the records side, the legal weight runs from almost nothing (hair, barbering) to heavy (tattoo, PMU, massage, laser, injectables), where state or city rules dictate record contents and retention of **2 to 7 years**. Almost every number a pro uses (fill windows, touch-up weeks, patch-test lead time, Accutane waiting periods, deposit amounts) varies by artist, brand or state, so the roadmap must ask for her numbers and store them as **settings she chooses**, never as built-in rules. The interview that drives this should ask one plain question at a time about real past events, establish **trade, state and city, setting (studio or mobile), and whether she bills insurance** first, and keep version one to what a normal working day cannot run without. Texting, HIPAA, Washington's My Health My Data Act, minors and record retention are the compliance traps a non-technical builder is most likely to step in, and the roadmap must warn about each without claiming to make her compliant.

## Six features every beauty app shares, built in one order

Every trade researched converges on the same backbone: services with durations and buffers, a booking page, a written deposit and cancellation policy, reminders, intake and consent forms, client records with photos, and payments through a hosted checkout. What separates a good build order from a bad one is sequencing the boring safety work first. The research's proposed order puts **login, client list, data export and backup, and a privacy policy page before any booking feature**, because export and backups are what make every later feature safe to build. SlickChart's own engineering history (cross-device data loss, records that must merge rather than overwrite) is direct evidence that this is not optional for a one-person business.

Overbuilding is the main risk for a non-technical builder. Pendo's 2019 adoption data across 615 software subscriptions found **about 80% of features are rarely or never used, and 12% of features generate 80% of daily usage** ([Pendo](https://www.pendo.io/resources/the-2019-feature-adoption-report/)). That is vendor data from B2B software, not beauty pros, but it supports a hard rule: a Must-have is something she could not run a normal day without. If she has a workaround (paper, Square, Venmo), it is not a Must. The DSDM MoSCoW method caps Must-have work at **about 60% of total effort, measured by effort, not count**, with roughly 20% kept as contingency ([Agile Business Consortium](https://www.agilebusiness.org/?p=1907)). Square itself puts waitlists and resource management in paid or top tiers, a signal those are not baseline needs for a solo ([Square Appointments](https://www.squareup.com/appointments)).

Reminders earn their early slot on evidence. A BMJ Open meta-analysis of 21 randomized trials in clinics found patients who got digital reminders were **25% less likely to no-show (15% vs 21%)**, and multiple reminders beat one ([PubMed 27798006](https://pubmed.ncbi.nlm.nih.gov/27798006/)). Wording matters too: a large randomized trial found a reminder framed to evoke mild guilt cut no-shows to 14.2% from 21.1% ([PMC7310733](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7310733/)). These are healthcare settings, not salons, but they justify reminders in version one. **Email comes first and SMS later**, because texting requires carrier registration and consent handling (covered in the compliance section). Zenoti recommends sending reminders inside the cancellation window so clients can cancel without penalty ([Zenoti](https://www.zenoti.com/thecheckin/salon-cancellation-policies)), so the reminder lead time should be the same setting as the cancellation window.

Policy defaults should be offered as editable starting points. Vendor templates cluster around a **24-hour notice window with a 50% late-cancellation fee**, with 48 hours in stricter policies. Square's templates describe fees "typically between 25%–50%" ([Square](https://squareup.com/ca/en/the-bottom-line/operating-your-business/salon-booking-cancellation-policy-templates)), Booknetic shows a 50% deposit applied to the total with full price for no-shows ([Booknetic](https://www.booknetic.com/blog/salon-cancellation-policy)), and card-on-file language lets the stored card be charged for a no-show ([Slick](https://help.getslick.com/en/articles/4230083-cancellation-policy-templates)). No industry survey of deposit norms exists, so the roadmap should present these as examples. On payments, Stripe's hosted integrations send card data "without it passing through your servers, reducing your PCI obligations," and storing only card brand, last four and expiry is allowed ([Stripe](https://docs.stripe.com/security/guide)). The rule for the roadmap is simple: **her app never touches a card number**. Square charges more for card-on-file no-show charges (3.5% + 15¢) than for online prepayment (2.9% + 30¢) ([Square help](https://squareup.com/help/us/en/article/6677)), which argues for taking the deposit at booking.

### Core feature list and build order

| Step | Feature | Version | Why it sits here |
|---|---|---|---|
| 1 | Login, private client list, one-tap full export, automatic backup, privacy policy page | V1 | Everything after this holds client data; export is also her answer to a board audit and her exit from any tool |
| 2 | Service menu: name, minutes, buffer, price, plus her per-service rebook interval | V1 | Every trade's timing rules hang off the service |
| 3 | Her hours and availability | V1 | Booking cannot work without it |
| 4 | Mobile-first, accessible booking page with her deposit and cancellation policy shown and agreed at booking (timestamped) | V1 | Policy agreed in writing is what lets her enforce it |
| 5 | Email confirmation and reminder, lead time tied to her cancellation window | V1 | Evidence-backed no-show reduction, no carrier registration needed |
| 6 | Intake and health form, per-service consent with e-signature and timestamp, contraindication checklist | V1 | Required in several states for higher-risk services; drives safety flags |
| 7 | Client record: dated visit notes, the trade's structured record template, photos with separate chart vs marketing consent | V1 | The record is the product for most trades |
| 8 | Hosted-checkout payments: deposit at booking, balance and tip after | V1 | Card data stays off her app |
| 9 | Rebooking reminders on per-service cadence; aftercare messages per service | V1.5 | High value, small build once services carry intervals |
| 10 | The trade's signature rule (fill-window pricing, processing gaps, PMU package, minimum-gap guard, patch-test gate, GFE gate, minor/ID gate) | V1.5, or V1 if the interview says she cannot work without it | This is what generic tools do badly |
| 11 | SMS reminders (after 10DLC registration and consent capture), two-way confirm | Later | Fees, registration, TCPA consent and opt-out |
| 12 | Packages, series, memberships; gift cards; waitlist; review requests; referrals; retail and homecare lists; client portal | Later | Useful, not daily-critical |
| 13 | Multi-provider, rooms and equipment as resources, travel time and service area, inventory and lot tracking | Only if the interview says so | Team and mobile features are gated to higher tiers even on Square |

## The interview should ask four deciding questions before anything else

The research converges on one structure for the AI-run interview. Four answers decide most of the legal and record features: **what she does, which state and city she works in, studio or mobile, and whether she ever bills insurance**. City matters because body-art rules are often local (Durant, Oklahoma keeps tattoo records 7 years under a city ordinance, longer than state law ([Durant code](https://codelibrary.amlegal.com/codes/durant/latest/durant_ok/0-0-0-5747))), and some New Jersey towns ban body-art establishments outright ([NJ DOH](https://www.nj.gov/health/ceohs/documents/phfpp/MicrobladingGuidance.pdf)). Insurance matters because it is the HIPAA trigger. Everything after those four is preference.

How to ask is as important as what. Nielsen Norman Group recommends "a few well-designed, open-ended questions," asking about specific past events rather than general processes, starting easy, and probing with "tell me more" ([NN/g](https://www.nngroup.com/articles/user-interviews/)). Leading questions and weak probing are listed among the most common interview mistakes ([NN/g video](https://www.nngroup.com/videos/interview-mistakes-to-avoid/)). The best evidence for a chatbot doing this is mixed: a ~600-person study found an AI chatbot with probing produced **more informative, specific answers than a standard survey** ([Xiao et al., arXiv](https://arxiv.org/pdf/1905.10700)), while a 2024 study found a web survey often gave better data quality than a messaging-app chatbot ([UvA](https://dare.uva.nl/id/8d1a3d3a-31ff-4fcf-9dd5-614e9e37efed)). The practical reading is to keep the chat short and concrete. The research's recommended pattern is: one question per message, each with a short example answer so she knows the level of detail; story questions ("Tell me about the last client who no-showed"); a pain probe ("What takes the most time each week?"); what she uses today; a recap in her words with "did I get that right?"; then a short Must / Should / Could / Not-yet list where she moves items rather than adds them, and an explicit **parking lot** for everything else. Yes/no "would you like X?" questions should be avoided because everyone says yes and scope balloons, as should jargon (API, database, 10DLC) without plain words.

### The universal opening script (ask every profession, one at a time)

1. What do you do? Pick all that apply. (Then route to her trade's questions below.)
2. What state and city do you work in?
3. What license or registration do you hold?
4. Do you rent a booth or suite, own a studio, work in someone's salon, or travel to clients?
5. Do you work alone, or with others? How many?
6. Walk me through how a new client books with you today, start to finish.
7. Tell me about the last no-show or late cancel. What happened, and what did you do?
8. Do you take a deposit? How much, is it refundable, and does it come off the final price?
9. How many hours' notice do you need to cancel without a fee?
10. Do you ever bill insurance, or give receipts for HSA or FSA cards?
11. Do you see anyone under 18?
12. What do you use now (Square, Vagaro, GlossGenius, paper, Instagram messages), and what do you need to bring over?
13. What takes the most time each week that you wish a computer did?

## Timing rules and records are where trades really differ

Across the twelve professions, the signature needs fall into a small number of reusable building blocks, which is useful for the roadmap: it can teach each block once and let each profession switch on the ones she needs. The first block is a **window-based price**, where the price depends on time since the last visit. Lash studios require a fill every 2 to 3 weeks with 40% or 50% of lashes remaining, or "it will be considered a Full Set and charged accordingly" ([Created by Carissa](https://createdbycarissallc.schedulista.com); [Lashed by Sarah](https://lashedbysarah1.schedulista.com)), while others charge a surcharge or an extended-fill tier ([Véla Lash Studio](https://booksy.com/en-us/1793993_vela-lash-studio_brows-lashes_15860_belleview); [Mia Does Lashes](https://square.site/book/LYP7G5C4CTNNF/mia-does-lashes-toledo-oh)). The second is a **staged service**, where the pro is free during processing but the chair is held. Mangomint models a partial highlight as 30 minutes application, 45 processing and 30 finishing, with processing bookable and buffer time not, and warns that buffers do not carry across providers ([Mangomint](https://www.mangomint.com/learn/processing-finishing-and-buffer-times/)). The third is **add-ons that change both time and price**: one nail booking page tells clients to pick the right design add-on "to ensure the correct timing is blocked off" ([Maddison Holt](https://book.heygoldie.com/Maddison-Holt)). The fourth is a **minimum-gap guard** (lash lift every 6 to 8 weeks "no sooner to prevent over-lifting" ([Lash Lift Store](https://lashliftstore.com/blogs/lash-lift-store-blog/how-often-can-brow-laminations-be-done)); saline removal "a minimum of 8 weeks" in one consent form ([Jotform PMU consent](https://form.jotform.com/211645628960865)); neurotoxin no more often than every 3 months per the Botox and Jeuveau labels ([Botox PI](https://www.asds.net/Portals/0/PDF/Resident-Kit-Allergan-BOTOX-Cosmetic-Prescribing-Information.pdf); [Jeuveau](https://prescriberpoint.com/therapies/jeuveau-17a914c))). The fifth is a **package with an auto-scheduled follow-up** (PMU initial plus perfecting session at 4 to 6, 6 to 8 or 8 to 10 weeks depending on the studio ([booksolo](https://booksolo.co/browobsession/aftercare); [Permanent Aesthetic Studio](https://booksy.com/en-us/1345994_permanent-aesthetic-studio_brows-lashes_128876_oak-brook); [The Perfect Feather](https://book.squareup.com/appointments/77330034-a90f-420b-81c0-ced9758b39d5/location/FDA1JABCPXSNT/services)); a piercing downsize at roughly 2 to 8 weeks by placement ([Trinity BJ](https://www.trinitybj.com/help-center/blog/downsizing-in-piercing-new))). The sixth is a **prerequisite gate**: a patch test logged within her chosen window, a good faith exam on file, surgeon clearance attached, or an ID proving age.

Records follow the same pattern. The trades with the heaviest legal records are the ones where the law treats the service as body art or a medical procedure. Texas requires a permanent PMU and tattoo record including ID type, ink colors "plus the manufacturer's catalog or ID number when available," body location, artist and a signed aftercare acknowledgment, kept **at least two years** after the last entry ([25 TAC §229.406](https://law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-229-406)). New Jersey wants **pigment lot number and use-by date** in each client record ([NJ DOH](https://www.nj.gov/health/ceohs/documents/phfpp/MicrobladingGuidance.pdf)). Texas laser hair removal records must capture **device manufacturer, model, serial number and settings** ([16 TAC §118.70](https://law.cornell.edu/regulations/texas/16-Tex-Admin-Code-SS-118-70)). Oregon esthetics records must be kept **at least 3 years** with extra fields for peels and dermaplaning ([OAR 817-015-0065](https://oregon.public.law/rules/oar_817-015-0065)). The lesson for the roadmap is that structured fields beat free text wherever an inspector or a reaction investigation would look: a pigment typed as "warm brown" cannot answer "which clients got lot X."

Retention is the clearest example of why nothing can be hard-coded. Documented periods include **2 years** (Cambridge, MA tattoo ([Cambridge](https://www.cambridgepublichealth.org/tattoo-and-body-art/tattoo-body-art-establishments-faq/)); Texas PMU/tattoo), **3 years** (Oregon esthetics and tattoo ([OAR 331-915-0085](https://www.law.cornell.edu/regulations/oregon/Or-Admin-Code-SS-331-915-0085)); Washington massage, counted from age 18 for minors ([WAC 246-830-570](https://regulations.justia.com/states/washington/title-246/professional-standards-and-licensing/chapter-246-830/practice-requirements-and-limitations/section-246-830-570))), **5 years** (West Virginia tattoo ([WV Code 16-38-3](https://code.wvlegislature.gov/16-38-3/)); Louisiana massage ([LAC XLIV.4101](https://state-rules.com/louisiana/lac/XLIV.4101/)); Nevada massage ([Nevada Board](https://www.massagetherapy.nv.gov/siteassets/massagetherapy.nv.gov/content/licensees/clientrecordsretention.pdf))) and **7 years** (Durant, OK). The safe default is **keep forever, export on demand, never auto-delete**. No 50-state table exists in the research, so the roadmap should tell her to check her board or health department.

## Profession playbooks

Each playbook gives the interview questions (asked one at a time, in plain words), features ranked Must-have / Nice-to-have / Advanced, the records she should keep, and the pitfalls to warn about. Numbers in parentheses are examples from real studios or labels for her to confirm or change. Where a rule is a state rule, the state is named.

### 1. Estheticians and skin care

Esthetics consent rules are state-specific and service-specific. Oregon requires the client's signature before peels or dermaplaning confirming she understood the procedure, risks, contraindications, alternatives and aftercare, with initials allowed on repeat visits ([OAR 817-015-0065](https://oregon.public.law/rules/oar_817-015-0065)). Iowa requires signed consent before an esthetician uses a laser, IPL, chemical peel or microdermabrasion ([Iowa 481-940.7](https://www.law.cornell.edu/regulations/iowa/Iowa-Code-r-481-940.7)). Scope varies too: California's board said estheticians may not perform microneedling or dermaplaning ([AmSpa](https://americanmedspa.org/news/california-board-of-barbering-and-cosmetology-clarifies-esthetician-scope-of-practice-in-q-a)), while Oregon writes dermaplaning record rules for estheticians. Isotretinoin guidance conflicts: the package insert advises waiting 6 months before waxing, peels, dermabrasion and laser, while a 2017 ASDS consensus found insufficient evidence to delay most procedures except mechanical dermabrasion and fully ablative resurfacing ([MDedge](https://mdedge.com/content/expert-panel-little-support-delaying-cosmetic-procedures-after-isotretinoin); [PMC5820835](https://pmc.ncbi.nlm.nih.gov/articles/PMC5820835)).

**Interview questions**
1. Which services do you offer? (facials, peels, microneedling, dermaplaning, waxing, others)
2. Are there services you plan to add this year?
3. What forms do clients fill out now, and are they paper or digital?
4. Show me what you write after a treatment. What do you track for a peel (brand, strength, layers, minutes)?
5. Do you take before and after photos? Do you ever post them?
6. How do you decide when a client should come back, for each service?
7. Do you sell series, packages or memberships?
8. Do you send homecare routines or sell retail?
9. Do you check in with clients a day or two after a peel or microneedling?
10. Which health answers should stop a booking until you look at it (for example Accutane, retinoids, pregnancy)?

**Features**
- Must-have: booking with a per-service rebook interval she sets; digital intake and health history with a contraindication checklist plus "anything changed since last time?" each visit; per-service consent (sign fully once, initial on repeats, re-sign when health changes); treatment notes with peel and product fields; before/after photos with separate marketing consent; aftercare message per service; reminders.
- Nice-to-have: homecare and retail lists per client; series and package tracker; memberships; day 1 to 3 post-treatment check-in; client portal to see her own aftercare and homecare.
- Advanced: side-by-side progress photo comparison; AI-drafted notes she signs off; waitlist.

**Records:** client identity, date of birth and contact; date, service and practitioner; allergies, sensitivities and complications; per-visit products, and for peels the brand, type, strength, layers, minutes and pre/post care given (Oregon lists these); signed consents with dates; photos; homecare plan. Oregon requires 3 years; default to keeping forever.

**Pitfalls:** never let the app offer a service her state does not allow; present contraindication timings as her policy, not medical advice, since sources conflict; edits to a chart should be amendments, not overwrites; a signed form reduces but does not remove liability ([open-exam-prep MA](https://open-exam-prep.com/study-guides/ma-esthetician/client-consultation/release-forms-documentation)); a client's own homecare or summary list grows over time, so it must merge across devices rather than overwrite.

### 2. Med spas, injectors and laser technicians

This is the most regulated skin setting. AmSpa says a **good faith exam must occur before a patient's first treatment**, performed by a physician, PA or advanced practice nurse, repeated when the plan or health changes and "at least annually" as a rule of thumb, and calls a missing exam the "medical spa widow-maker" ([AmSpa GFE](https://www.americanmedspa.org/news/what-is-required-of-a-medical-spas-good-faith-exams/); [AmSpa widow-maker](https://www.americanmedspa.org/news/the-medical-spa-widow-maker/)). Injector charts carry product, lot, expiry, dilution and units per site on a face map, reconciled to a vial log ([MedSpaStandards](https://medspastandards.com/blog/botox-charting-template-med-spa-documentation)), and one unit of Botox is not one unit of Dysport or Xeomin, so product must be on every entry ([AAO](https://aao.org/Assets/1413d7cb-69c6-4e95-ac42-25956c186efc/638088791002300000/botox-blepharospasm-hemifacial-spasm-fs-pdf?inline=1)). Laser clinical studies spaced hair-removal sessions 4 to 6 weeks apart ([JDD](https://jddonline.com/articles/dermatology/S1545961616P1427X)). Texas IV therapy outside physician offices now requires physician oversight of assessment and ordering (HB 3749, effective Sept 1, 2025) ([Polsinelli](https://www.polsinelli.com/health-care-compliance/publications/new-texas-iv-therapy-law)). Med spas are the one beauty setting that may be a HIPAA covered entity, and covered spas need business associate agreements with software vendors ([Spencer Fane](https://www.spencerfane.com/insight/the-legal-facelift-how-to-build-run-and-transition-a-compliant-med-spa-part-ii/?pdf=post)).

**Interview questions**
1. What is your license (laser tech, medical esthetician, RN, NP, PA, physician)?
2. Who is your medical director, and who does the first exam for new patients?
3. Does anyone review or sign off on your charts?
4. Which treatments do you offer? (laser hair removal, IPL, toxin, filler, PRP, IV, others)
5. Which laser or energy devices do you use? (make and model)
6. Do you bill insurance or e-prescribe through any system?
7. How do you track vials, lots and units today?
8. How soon do you rebook toxin, filler and laser clients?
9. Do you sell units banks, memberships or packages?
10. How do you record and follow up a reaction or complication?

**Features**
- Must-have: good faith exam record with examiner, date and an expiry she sets, used as a **gate** on booking or check-in for medical services; face-map charting with units per site; product, lot, expiry and dilution per entry; vial inventory with waste; supervising practitioner co-sign; adverse event log with follow-up; device library (make, model, serial saved once) and per-visit laser settings (wavelength, fluence, spot size, pulse width, passes, cooling); Fitzpatrick type on profile; test-spot record; Texas-style written risk-notice delivery log for laser hair removal; separate chart vs marketing photo consent.
- Nice-to-have: toxin recall at her interval (Zenoti cites about 12 weeks ([Zenoti](https://www.zenoti.com/thecheckin/injectable-filler-clinic-management-guide))); filler recall by product; laser session series (for example 6 sessions); units bank or memberships; standard photo angles (front, 45°, profile).
- Advanced: lot recall lookup ("which patients got lot X"); physician order and protocol storage with expiry alerts (Texas laser device orders are valid up to 12 months); HIPAA mode with BAAs; multi-provider permissions; AI charting.

**Records:** exam record and treatment order; consent per treatment; product, lot, expiry, NDC, dilution, units per site, units wasted; device make, model, serial and settings (required in Texas for laser hair removal); operator and certificate type; supervisor; adverse events and outcome; photos. Medical-record retention for med spas was not researched; default to keeping forever.

**Pitfalls:** a missing exam is the top regulatory risk, so build it as a gate, not a note; never auto-rebook toxin sooner than the label interval; never treat cash-only as automatic HIPAA exemption; device settings depend on skin type, so presets must be hers, not the app's; adverse events report through FDA MedWatch ([PubMed 16112345](https://pubmed.ncbi.nlm.nih.gov/16112345/)), so the app should point to it rather than replace it.

### 3. Lash and brow artists

Lash pricing depends on time since the last visit, and every threshold varies by artist. Lift and lamination need minimum gaps (most sources say 6 to 8 weeks before repeating a lamination ([Lash Lift Store](https://lashliftstore.com/blogs/lash-lift-store-blog/how-often-can-brow-laminations-be-done))). Patch tests are commonly done **24 to 48 hours before a full set** ([Lashbase](https://lashbase.com/blogs/news/patch-testing-guidelines-extension-edition)), but a negative test is not conclusive, since reactions "could take days, months or years to appear" ([Gladgirl](https://www.gladgirl.com/blogs/lash-brow-expert/lash-extension-allergies-vs-irritation-how-to-tell-the-difference)). Adhesive allergy is usually to cyanoacrylate, so adhesive brand is a meaningful field. Lash apps store maps of up to 12 segments with length, diameter and curl per zone plus humidity and adhesive notes ([Lash Dash](https://apps.apple.com/us/app/lash-dash/id1435421910?ls=1)). Licensing varies: a 2023 compilation listed lash-specific licenses or permits in Connecticut, Texas, Minnesota and Kentucky and none in a few states, and Maryland's 2025 bill already contradicts its entry ([Boulevard](https://joinblvd.com/blog/eyelash-extension-state-requirements); [Maryland HB1223](https://mgaleg.maryland.gov/2025RS/fnotes/bil_0003/hb1223.pdf)). On tinting, FDA has approved **no color additive for dyeing lashes or brows**, and California's board has warned salons they can be cited ([Refinery29 quoting FDA](https://refinery29.com/en-us/eyelash-tinting-guide); [Lash Affair](https://lashaffair.com/blogs/lash-artist-blog/is-lash-tinting-and-eyebrow-dyeing-illegal-3f)).

**Interview questions**
1. Which lash and brow services do you offer? (classic, hybrid, volume, lift, tint, lamination, wax, threading, henna)
2. How many weeks is your fill window?
3. What happens after the window: an extended-fill price, a surcharge, or full-set price?
4. How many lashes must be left for it to count as a fill? Do you change the price in the chair?
5. Do you require a patch test? How many hours ahead, and how long is a test good for?
6. Do you re-test when you change adhesive?
7. What do you write down for each set? (curl, length, thickness by zone, adhesive, room humidity, style name)
8. How many weeks must pass between lifts or laminations?
9. Do you tint? (Mention the FDA status gently; ask if she wants tint left out of marketing.)
10. For brow waxing, what is your Accutane and retinoid rule?

**Features**
- Must-have: services for fill, extended fill, full set and removal; automatic fill-window pricing from the last visit date with a chair re-price option; fill reminder before the window closes; per-visit lash map that copies forward; adhesive and allergy fields; patch-test record with a booking gate using her validity window; minimum-gap guard for lifts and laminations; contraindication screen that holds a booking for her review; digital intake and consent; aftercare message.
- Nice-to-have: client-facing "your fill window closes Friday" countdown; retention log per visit (percent kept, humidity, adhesive); overdue-client list; style templates; brow mapping photo with measurements; tint shade and lift solution timing; bundles (lift plus tint); deposits and no-show fee.
- Advanced: retention trends by adhesive or humidity; client reaction reporting (photo plus symptoms) that flags the record; adhesive inventory with lot and opening date; recurring wax memberships.

**Records:** per-visit lash map and style; adhesive brand and lot; retention percent; room conditions if she tracks them; patch-test date, product and result (signed); allergy history; lift or lamination product and timing; brow measurements; photos.

**Pitfalls:** never hard-code fill windows, thresholds or gaps; one price per lash service is wrong because price depends on elapsed time; a negative patch test is not permanent clearance; do not describe any tint as "FDA approved"; licensing changes, so never state a state's lash rule as settled.

### 4. Permanent makeup (microblading, machine brows, lip blush, liner, saline removal)

PMU is usually regulated as **tattooing or body art by a health department**, not the cosmetology board. There is no federal oversight; Georgia treats microblading as tattooing; Oklahoma bars cosmetology licensees from procedures beyond the dead skin layer ([NEHA annex](https://pubs.neha.org/annex-bamc-3rd-ed/59/)). New Jersey requires a 100-hour course and exam, a local body-art establishment license, and prohibits body art in cosmetology-licensed salons ([NJ DOH](https://www.nj.gov/health/ceohs/documents/phfpp/MicrobladingGuidance.pdf)). California requires annual registration with Hepatitis B vaccination evidence and bloodborne pathogen, first aid and CPR training ([AB 223 analysis](https://www.leginfo.ca.gov/pub/09-10/bill/asm/ab_0201-0250/ab_223_cfa_20100111_194017_asm_comm.html)). A July 2024 FDA study found **26 of 75 tattoo and PMU inks contaminated with bacteria** ([PMC11228856](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11228856/)), which is why lot tracking matters. Pre-visit rules are studio policy, not law: blood thinners stopped "1 day prior" at one studio and "a minimum of 72 hours" at another ([814 Wellness](https://814wellness.noterro.com/service/306617/Lip-BlushLip-Tattoo); [Studio Sashiko](https://studiosashiko.com/pages/lip-blush)); an antiviral for anyone with cold-sore history "3 days prior and 6 days post" at one lip studio ([Square booking page](https://book.squareup.com/appointments/df5f9ec1-996f-4c25-bab2-16a16735ba09/location/E09G8E1AS6JW2/services/S3I5ZAEB3O2LODR74F22RFVJ)). Accutane rules range from 6 to 12 months to a full year ([Jotform consultation](https://form.jotform.com/261876717194268)).

**Interview questions**
1. Which procedures do you offer? (microblading, machine or powder brows, lip blush, liner, removal, areola)
2. What state and city do you work in, and is your studio licensed by the health department?
3. Is the touch-up included in your price? How many weeks after the first visit?
4. Is there a deadline after which the touch-up costs extra?
5. Do you offer a yearly color boost? At what price?
6. How much is your deposit, and what makes a client lose it?
7. What do you write down each time? (pigment brand, color, lot, expiry, needle, machine settings, passes, numbing)
8. Which health answers should stop a booking? (Accutane, blood thinners, pregnancy, cold sores for lips, keloids)
9. Do you correct or remove other artists' work?
10. Do you want reminders for your license, bloodborne pathogen certificate and permit renewals?

**Features**
- Must-have: deposit at booking; package of initial plus perfecting session with an auto-scheduled follow-up at her interval; health questionnaire with blocking contraindications; signed consent and risk disclosure; per-procedure record with pigment brand, color, lot and expiry **picked from her own inventory list** (warn on expired lots), needle, machine settings and passes; before, immediately after and healed photos; signed aftercare receipt; day-by-day healing messages (day 1, 3, 7, 10, 14, 30); pre-visit reminders at her chosen lead times; for removal, session series tracking with a minimum-gap guard.
- Nice-to-have: annual color-boost reminder; healed-photo request at 4 to 8 weeks; brow mapping measurements; numbing log; portfolio export of approved photos; link from removal to the original artist and pigment.
- Advanced: "which clients got lot X" lookup; compliance dashboard for license, BBP, HBV, exposure control plan review and permit renewal; inspection export by date range.

**Records:** Texas minimum: name, address, phone, procedure date, age, date of birth, photo ID type, ink colors with manufacturer catalog number, body location, artist, aftercare acknowledgment and client signature, kept at least 2 years after the last entry. New Jersey adds pigment lot and use-by date, and for areola work the client's health care provider's written instructions. Plus her own: needle, machine, settings, passes, numbing, three photo stages, and the perfecting-session link. If she has employees, OSHA bloodborne pathogen records apply (training records 3 years, per a training-vendor summary ([WC Safety](https://wcsafety.com/blogs/reference/osha-bloodborne-pathogens-standard))).

**Pitfalls:** free-text pigment fields cannot answer an inspector or a reaction investigation; never call microblading "semi-permanent" (New Jersey says there is no proof pigment is ever fully eliminated); a PMU artist working under a cosmetology salon license may be out of compliance in some states, so the roadmap should prompt "check with your local health department"; without a reminder, the healed photo is rarely captured; touch-up timing varies by studio (4 to 10 weeks), so it is a setting.

### 5. Hair stylists, colorists, extension specialists, braiders and loc stylists

Hair pros need three things generic tools handle poorly. The first is a **per-visit color formula record**; purpose-built colorist apps log brand, shade, grams, developer, timing, starting level and target ([HueBook](https://appgoblin.info/apps/6780090899)), and one adds a live processing timer and developer ratio calculator ([pH Laboratories](https://apps.apple.com/app/id6800302376)). The second is **staged services** with a bookable processing gap ([Mangomint](https://www.mangomint.com/learn/processing-finishing-and-buffer-times/); [Schedulista](https://support.schedulista.com/en/articles/397485-split-appointments)). The third is **maintenance cadences with variable price**: hand-tied wefts move up every 6 to 8 weeks with the next move-up booked at the end of each visit ([Kenneth's](https://kenneths.com/services/hair/extensions/hand-tied-hair-extensions-everything-you-need-to-know)), and pricing runs per row ($135/$235/$335 at one stylist, $250/$400/$600 at another) ([Pricing form A](https://form.jotform.com/211837187180155); [Pricing form B](https://form.jotform.com/212573741410145)). Braiders' public pages show **$10 to $30 or 25% deposits, usually non-refundable and applied to the total**, prices set by length and size, "hair included" varying, and prep rules (clean, dry, detangled) with a fee if unmet ([Braided Beauty Indy](https://book.heygoldie.com/Braided-beauty-0fd3e0d7fb98); [Braidistry](https://book.heygoldie.com/Braidistry)). Coal-tar hair dye labels carry patch-test directions under federal law, and study guides say 24 to 48 hours before each application, which is a recommendation, not a statute ([NY cosmetology guide](https://open-exam-prep.com/study-guides/ny-cosmetology/hair-coloring-and-lightening/colour-consultation-preliminary-procedures); [Health Canada](https://www.canada.ca/en/health-canada/services/cosmetics/hair-dyes.html)). Curly consultations assess texture, pattern, porosity and density, ideally on dry hair ([Design Essentials](https://designessentials.com/consultation); [Revlon Professional](https://cdn.revlonprofessional.com/blog/curly-hair-consultation/)). Booth and suite renters are independent businesses who need their own calendar, client records and payments, which salon software built for "owner plus employees" handles badly ([Salonist](https://salonist.io/no/industries/salon-booth-for-renter)).

**Interview questions**
1. Which services make up most of your book? (color, cuts, extensions, braids or locs, curly, treatments)
2. Do you take another client while color processes? How long does processing usually take?
3. Does time or price change with length, thickness, rows or braid size? How do you price it now?
4. Do you keep color formulas today? Where, and what do you write?
5. Do you require a patch test or strand test? For whom, and how many days before?
6. For extensions: which methods, who buys the hair, and how many weeks between move-ups?
7. For braids or locs: is hair included, what is your deposit, and what prep rules do clients get?
8. Should clients send inspiration and "my hair now" photos when they book?
9. Do you book the next visit before they leave?
10. Do you rent a booth or suite? Do you want rent and product costs tracked for taxes?

**Features**
- Must-have: client card with formula history and photos; "repeat last formula"; staged services with a bookable processing gap (application, processing, finishing); length, density, row or size modifiers that change both time and price; "hair included" as a line item; deposits tied to the policy text; rebooking reminders on her per-service cadence; patch-test log with an optional booking gate for new color clients (her N days); inspiration photo upload at booking, visible at the appointment.
- Nice-to-have: formula processing timer and grams/ratio calculator; extension profile per client (method, rows, color, brand and batch, install date, move-up count, replacement date) with move-up auto-reminders; pre-visit "hair prep" message; retail recommendations; rent and expense tracker for renters.
- Advanced: color-bowl cost per service (grams times cost); backbar inventory reorder; before/after portfolio published to her booking page; "her last three formulas" summary at check-in; P&L export for taxes.

**Records:** per-visit formula (bowls by zone: roots, mids, ends, toner, gloss; brand, line, shade, grams, developer volume, ratio, minutes, starting and target level, result photo, next-time note); patch and strand test date, product and result; extension details; consultation notes (texture, porosity, density); photos.

**Pitfalls:** setting a processing gap as a buffer (or the reverse) double-books her or wastes time; add-ons that change price but not minutes cause overlaps; never hard-code 48 hours as law; inspiration photos stored but not shown at the appointment are useless; a renter's client list must be hers alone and portable if she changes salons; extensions are generally not recommended for actively thinning hair, which belongs in the consult screen ([KmXtend](https://kmxtend.com/blogs/news/why-you-may-want-to-consider-hand-tied-weft-hair-extensions)). No source confirmed a loc retwist cadence, so ask her.

### 6. Barbers

Barbers run walk-ins alongside appointments. Queue apps let customers join by QR code, see a live wait, pick a barber and get a text when it is their turn ([NextUp](https://alternativeto.net/software/nextup-walk-in/about/); [eWAIT](https://www.alternativeto.net/software/ewait/about/)). Memberships bill a monthly fee for a set number of cuts with failed-payment retries; Zenoti warns that uncapped "unlimited" founder rates become a margin problem ([Zenoti membership guide](https://www.zenoti.com/thecheckin/barbershop-membership-programme-guide)). Membership terms should state price, billing date, minimum commitment and auto-renewal ([Sprintlaw, UK checklist](https://sprintlaw.co.uk/articles/subscription-terms-for-uk-barber-shops-offering-memberships/)). Cut notes (guard numbers by zone, fade height, line-up) are the barber's formula card. No source quantified a typical barber rebooking interval, so the roadmap should ask.

**Interview questions**
1. About how many of your clients walk in, and how many book ahead?
2. Would you like clients to join a wait list from their phone?
3. Do you work alone or next to other barbers?
4. What do you need to remember about each cut? (guards, fade, line-up, beard)
5. How many weeks do your regulars usually wait between cuts?
6. Do you offer, or want to offer, a monthly membership? What does it include?
7. Is the membership capped, or unlimited?
8. Do you keep a card on file or charge no-show fees?

**Features**
- Must-have: fast booking; "same cut as last time" notes with back and side photos; rebook reminder at her cadence; card on file with a no-show fee tied to agreed policy.
- Nice-to-have: walk-in queue with QR join, live wait time and text-when-ready (two-way SMS after registration); memberships with recurring billing, visit caps and member priority booking.
- Advanced: lobby TV queue display; per-barber queues with commission or rent splits; peak-hour and no-show analytics.

**Records:** cut notes by zone (sides, back, top length), fade type and height, blend notes, line-up, beard guard, products, photos; membership terms accepted and billing history.

**Pitfalls:** auto-renewal disclosure rules vary by state (California has its own) and the FTC "click to cancel" status was not researched, so the roadmap should tell her to check before launching memberships; uncapped unlimited plans erode margin; a wait list is not a scheduler and does not need to replace her appointment book ([Waitwhile](https://waitwhile.com/blog/waitlist-app-for-barbershops/)).

### 7. Nail technicians

Nail booking depends on a **menu where add-ons change both price and duration**. Studios use art tiers (one sets tier 3 for "complex nail art and multiple techniques") and per-item add-ons from $10 up ([Nail extensions form](https://form.jotform.com/261362085025451); [Boss Nailed You](https://book.heygoldie.com/Boss-Nailed-You)), and complex designs can run 2.5 to 3.5 hours ([Dria Nailed It](https://www.airbnb.com/services/6137045)). One studio takes a **$35 deposit applied to the total, forfeited for no-show, cancellation or late arrival** ([Jotform nail booking](https://form.jotform.com/230223795151047)). Pros ask for inspiration photos before the appointment, and one system lets clients edit the photo up to 48 hours before ([RISS x The Nail Juice](https://form.jotform.com/223326232335043)). Enhancement fills return about every 2 to 3 weeks ([TN nail guide](https://open-exam-prep.com/study-guides/tn-nail-technician/basic-nail-services-manicures-pedicures/client-consultation-screening)). Infectious conditions such as nail fungus must not be serviced or covered with enhancements ([NC nail guide](https://open-exam-prep.com/study-guides/nc-nail-technician/disorders-diseases-contraindications/nail-diseases-infections)). Pedicure basins carry the clearest record requirement in this trade: California requires cleaning logs with date, time, initials and type (after each client, end of day, weekly), shown on request, with $100 to $200 fines for log violations ([CA 980.1](https://barbercosmo.ca.gov/forms_pubs/publications/980_1_whirlpool.pdf); [CA violations](https://www.barbercosmo.ca.gov/laws_regs/common_violations.pdf)), and Texas has its own board form ([TDLR form](https://license.state.tx.us/barbering-and-cosmetology/pdf/Whirlpool-Foot-Spa-Cleaning-Record-BAC-FI-004-E.pdf)).

**Interview questions**
1. Which services and systems do you offer? (gel, acrylic, Gel-X, builder gel, dip, pedicures)
2. How do you price nail art: tiers, per nail, or by time?
3. How much extra time does each add-on take?
4. Do you charge to remove another tech's work?
5. Do you take a deposit? How much, and is it refundable?
6. What happens if a client is late: shorter service, or lose the deposit?
7. Should clients upload an inspiration photo when they book? Required or optional?
8. How many weeks until fills come back?
9. Do you want a portfolio on your booking page?
10. Do you do pedicures with a foot spa or basin?

**Features**
- Must-have: menu with add-ons that change both time and price (length, shape, art tier, removal, repairs, French, chrome); booking engine sums minutes, not just dollars; deposit at booking with policy; inspiration-photo upload on the booking form; fill-cadence rebook reminders; client card with products, colors and photos; contraindication and allergy flags with dates.
- Nice-to-have: portfolio gallery from finished-set photos tagged by style; client can edit inspiration until her cutoff; late-arrival rule setting.
- Advanced: pedicure basin sanitation log with labels matched to her state's form and a printable export; color and product inventory; product cost per service.

**Records:** product system and brand, colors (shade names or codes), shape, length, lifting or breakage notes, allergies or sensitivities, contraindication flags with dates, finished-set photos; pedicure cleaning log if she offers pedicures (CA and TX).

**Pitfalls:** add-ons without minutes overlap her day; never call the sanitation log "compliant," since she must match her own board's form; state exam guides teach that some conditions require refusing service, so the app should flag rather than silently allow; acrylate (HEMA) allergy is a major current issue the research did not source, so it belongs as an intake question, not a claim.

### 8. Massage therapists and bodywork (including lymphatic drainage and mobile)

Massage is record-heavy. Washington requires records kept **at least 3 years from last treatment, counted from age 18 for minors**, with limited access and secure disposal ([WAC 246-830-570](https://regulations.justia.com/states/washington/title-246/professional-standards-and-licensing/chapter-246-830/practice-requirements-and-limitations/section-246-830-570)); Louisiana 5 years ([LAC XLIV.4101](https://state-rules.com/louisiana/lac/XLIV.4101/)); Nevada points to the 5-year health-record rule ([Nevada Board](https://www.massagetherapy.nv.gov/siteassets/massagetherapy.nv.gov/content/licensees/clientrecordsretention.pdf)). Mississippi requires intake forms, release forms and SOAP notes available for inspection, and condition before and after when treating a specific condition ([MS Board FAQ](https://www.msbmt.ms.gov/sites/msbmt/files/FAQ.01.MASSAGE.THERAPY.08.01.25.pdf)). FSAFEDS lists massage as eligible "with a detailed receipt," and some plans want a letter of medical necessity ([FSAFEDS](https://www.fsafeds.gov/explore/hcfsa/expenses?q=massage)). Mobile therapists are advised to screen new clients (full name, address, date of birth, a phone or video pre-call), share live location with a trusted person, and check whether their liability policy limits outcalls ([MASSAGE Magazine](https://www.massagemag.com/this-is-how-mobile-massage-therapists-stay-safe-secure-and-sanitary-124371/); [ABMP](https://www.abmp.com/massage-and-bodywork-magazine/issues/marchapril-2022/mobile-massage-practice-safety-and-7-questions-ask-each-potential-client)). For post-surgical lymphatic work, start timing is the surgeon's call: sources range from 3 to 7 days to 1 to 2 weeks, and MLD should begin only once the surgeon approves ([MASSAGE Magazine MLD](https://www.massagemag.com/manual-lymph-drainage-benefits-cosmetic-surgery-patients-12794/)).

**Interview questions**
1. What state are you licensed in?
2. Do you have a studio, travel to clients, or both?
3. Do you ever bill insurance directly, or give receipts for HSA or FSA?
4. Do you work with doctors' referrals, injuries or post-surgery clients?
5. Do you need surgeon clearance before a post-surgery client's first visit?
6. Which areas need the client's specific consent?
7. Do you sell packages, series or memberships?
8. If you travel: who should know where you are during a visit?
9. Should a brand-new client be able to book a home visit instantly, or only after you talk to them?
10. Do you measure or photograph progress (for lymphatic or contouring clients)?

**Features**
- Must-have: health intake with contraindication flags re-confirmed each visit; signed consent including draping and sensitive-area wording and that the client can withdraw consent mid-session; per-session SOAP note; body chart (focus, avoid, pressure 1 to 5); preference memory (oil allergies, warmer, music); retention setting per state that never auto-deletes; packages with session balances; online booking with deposits. If mobile: travel buffer by distance, service-area check, travel fee, new-client screening gate (no instant booking for first-timers), and a safety check-in that alerts a trusted contact if "I'm out" is not tapped. If post-surgical: procedure, surgery date, surgeon and garment stage on intake; surgeon clearance upload as a gate she can switch on; per-visit red-flag checklist (calf pain or swelling, fever, redness, shortness of breath means stop and refer); series tracker; measurements over time.
- Nice-to-have: itemized HSA/FSA receipt or superbill PDF with an LMN upload (an NC form says an LMN is valid 1 year ([NC LMN form](https://files.nc.gov/ncoshr/documents/files/HCFSA%20Letter%20of%20Medical%20Necessity%20Form.pdf))); pain scale before and after; rebooking cadence; gift cards; "days since surgery" on the appointment; surgeon-office referral source.
- Advanced: insurance billing through a clearinghouse (makes her a HIPAA covered entity and needs BAAs; recommend superbills first); physician referral tracking; shareable progress report for a surgeon; contouring device settings log.

**Records:** intake and health history, consent, SOAP notes, body chart, condition before and after (Mississippi for condition-specific work), receipts and LMNs if she issues them (one vendor recommends 7 years for IRS audit ([Forma](https://www.joinforma.com/hsa-eligibility/massages))), surgeon clearance, measurements and photos with consent.

**Pitfalls:** treating HIPAA as always or never applying; promising HSA eligibility (the plan decides); letting a stranger instant-book a home visit; storing SOAP notes she cannot export for a board audit; hard-coding any "days after surgery" minimum.

### 9. Spray tan artists

FDA approves DHA for **external application only**, not on lips, mucous membranes or near the eyes, says all-over booth spraying "has not been approved," and suggests consumers ask whether eyes, lips and mucous membranes are protected and inhalation prevented ([FDA](https://www.fda.gov/cosmetics/products/sunless-tanners-bronzers)). Solution strength by skin tone differs by brand (one uses 8/10/12%, another 6% to 18% by Fitzpatrick type) ([Sjolie](https://www.sjoliespraytan.com/spray-tan-solution-guide/); [Sienna X](https://sienna-x.co.uk/blogs/blog/the-complete-guide-to-sienna-x-spray-tan-solutions)). Standard solutions develop about 8 hours, rapid ones rinse at 1 to 5 hours with development continuing up to 24 hours ([The Sunless Store](https://thesunlessstore.com/pages/resources)). Event-date booking, a 1 to 2 day pre-event window and 7 to 10 day longevity are practitioner lore with no source; state licensing for spray tanning was not researched.

**Interview questions**
1. Do you work in a studio, travel to clients, or both?
2. Which brands and strengths do you use?
3. Do you offer a rapid-rinse option?
4. Do clients usually book around an event like a wedding or vacation?
5. Do you do bridal or group parties?
6. What should clients do before they come? (exfoliate, no lotion)
7. How soon do your regulars come back?
8. Do you sell packages or memberships?

**Features**
- Must-have: client profile with skin tone or Fitzpatrick type; solution brand, strength and rinse time used, with a "too dark / just right / too light" result remembered for next time; automatic prep message before the visit; rinse-time message after; consent covering eye, lip and inhalation protection, allergies and pregnancy (MotherToBaby has a pregnancy fact sheet ([MotherToBaby](https://mothertobaby.org/fact-sheets/sunless-tanners/))).
- Nice-to-have: event-date field with a suggested booking window she sets; bridal party group booking; mobile travel fee; rebook reminder at her interval; packages or memberships.
- Advanced: solution usage tracking; event or vacation campaigns.

**Records:** skin type, solution and strength, rinse time, result rating, allergies, signed consent.

**Pitfalls:** never present one brand's percentage chart as a standard; the research suggests a solo spray-tan artist needs about six features, so overbuilding is the main risk.

### 10. Waxing and sugaring specialists

The core needs are a medication screen re-asked every visit and a regrowth-based rebooking cadence. Isotretinoin waiting periods are quoted as "minimum 6 months, 12 months strongly recommended," "minimum one year," or "6 months to a year with doctor's clearance" ([CA esthetician guide](https://open-exam-prep.com/study-guides/ca-esthetician/specialized-services-hair-removal-lashes-and-makeup/hair-removal-protocols-contraindications); [Jotform waxing form](https://form.jotform.com/210484972247057); [NC guide](https://open-exam-prep.com/study-guides/nc-esthetician/hair-removal-makeup/waxing-safety-contraindications)). Topical retinoid stop periods range from 48 to 72 hours up to 2 weeks ([MN guide](https://open-exam-prep.com/study-guides/mn-esthetician/hair-removal-trichology-techniques/waxing-safety-contraindications-procedure)). Wax needs about a quarter inch of regrowth, sugaring less, with intervals of roughly 4 to 6 weeks by area, from weak sources ([Pleij Salon](https://pleijsalon.com/?p=83928)).

**Interview questions**
1. Do you wax, sugar, or both?
2. Which body areas do you offer?
3. How many weeks apart do your regulars come, for each area?
4. What is your Accutane rule: 6 months, 12 months, or something else?
5. How long must clients be off retinoids before you wax?
6. Do you need a separate consent for Brazilian or intimate waxing?
7. Do you sell memberships, like a Brazilian club?
8. What do you tell clients before and after?

**Features**
- Must-have: per-visit medication and skin check (Accutane with last-dose date, retinoids, antibiotics, recent sunburn, peel or laser); hard flag when isotretinoin falls inside her chosen window; first-visit consent plus intimate-area consent; per-area rebooking reminder she edits; wax or paste type and reaction notes.
- Nice-to-have: memberships; pre-visit message (grow to about a quarter inch, no exfoliation, no retinoid); aftercare message; ingrown-hair product suggestions.
- Advanced: reminders that adapt to the client's real rebook history; provider preference.

**Records:** signed intake updated each visit, medication answers with dates, consent, wax or paste used, skin reactions.

**Pitfalls:** do not present 6 versus 12 months as settled; state rules on intimate-area waxing were not researched, so tell her to check.

### 11. Tattoo artists

Tattoo carries the strongest legal record rules of any trade here. Oregon requires each record to include identity and birthdate, date and body location, artist name and license, medical and skin conditions, sensitivities, bleeding disorders and complications; signed consent confirming verbal and written explanation of risks and aftercare; a **copy of government photo ID**; records produced within 7 days on request and kept at least 3 years, electronic allowed ([OAR 331-915-0085](https://www.law.cornell.edu/regulations/oregon/Or-Admin-Code-SS-331-915-0085)). Oklahoma requires signed consents kept on premises for inspection ([OAC 310:233-3-8](https://regulations.justia.com/states/oklahoma/title-310/chapter-233/subchapter-3/section-310-233-3-8)). Minors law is sharp: **California makes tattooing anyone under 18 a misdemeanor with no parental-consent exception** ([Shouse Law, PC 653](https://www.shouselaw.com/ca/defense/penal-code/653/)), while Texas allows only cover-ups of offensive or gang markings with parental consent ([Tex. H&S 146.012](https://texas.public.law/statutes/tex._health_&_safety_code_section_146.012)). Sessions run 2 to 8 hours, which is why deposits applied to the final bill are the main no-show protection ([Zenoti tattoo guide](https://www.zenoti.com/thecheckin/tattoo-shop-management-software-guide)), and reference uploads before consults plus separate consult, design review, session and touch-up appointment types are standard ([SchedulingKit](https://schedulingkit.com/scheduling-software/tattoo-parlors)).

**Interview questions**
1. What state and city do you work in?
2. Do you work alone or in a studio? How many artists?
3. Do you do custom work, flash, walk-ins, or a mix?
4. How much is your deposit, and does it come off the final price?
5. How do you show the client a design and get their OK?
6. What is your touch-up policy, and how long is it free?
7. Do you tattoo anyone under 18 under any exception your state allows?
8. What does your health department check when they inspect?
9. Do you log ink colors and lot numbers?

**Features**
- Must-have: booking request form (idea, placement, size, color or black and grey, reference photos); consult appointment type; deposit tracked as a credit applied to the final bill and carried across sessions; digital consent and medical history signed before arrival; ID photo with date of birth and an age check that blocks under-18 or routes to her state's narrow exception; per-session record (placement, inks with lots if she logs them, needles, duration, artist and license); retention setting by state or city that never auto-deletes; day-by-day aftercare messages.
- Nice-to-have: design approval loop with timestamped approval; multi-session project view with healed photos; touch-up window tracker; flash gallery with "claim this design"; waitlist or walk-in queue; portfolio; policy acknowledgment.
- Advanced: per-artist calendars with splits or booth rent; guest-artist spots; ink lot recall lookup; inspector export by date range.

**Records:** Oregon-style record above, signed consent and aftercare acknowledgment, ID copy, ink and needle details, design approval, photos. Retention ranges 2 years (Cambridge, MA) to 3 (Oregon), 5 (West Virginia) and 7 (Durant, OK).

**Pitfalls:** never write "tattooing minors with parental consent is legal" (it is a crime in California); use the longest retention that applies to her state and city; ID images are sensitive and need access control; the minors numbers in older sources (a 2013 report citing at least 45 states restricting minors) are dated and unverified.

### 12. Piercers

As reported secondhand, the Association of Professional Piercers' position is that a parent or legal guardian must be present with ID to consent for any minor, and APP members do not perform nipple or genital piercings on minors ([LegalClarity](https://legalclarity.org/how-old-do-you-have-to-be-to-get-a-piercing-on-your-own/)); this should be verified at safepiercing.org. Downsizing is a scheduled follow-up whose timing varies by placement (lobes 2 to 4 weeks, cartilage 4 to 8, tragus and conch 6 to 8, oral 2 to 3), and a longer initial post left in can catch and delay healing ([Trinity BJ](https://www.trinitybj.com/help-center/blog/downsizing-in-piercing-new); [Laura Bond](https://www.laurabond.com/pages/aftercare)). Studios offer a 15-minute downsize appointment type alongside a parent-present policy ([Brand X Piercing](https://square.site/book/9C4T6KP21EZ6Y/brand-x-piercing-longview-wa)).

**Interview questions**
1. Which placements do you offer?
2. Do you pierce anyone under 18? What proof of guardianship do you ask for?
3. Are there placements you never do on minors?
4. When do you book downsizes, for each placement?
5. Do you sell your own jewelry, and do you track stock?
6. What do you record about the jewelry you put in?
7. Do you want healed-check photos from clients?

**Features**
- Must-have: ID capture; minor flow with guardian ID, proof of relationship if she requires it, guardian signature and a block on nipple and genital piercings for minors; consent and medical history; per-piercing record (placement, jewelry material, gauge, length, style, SKU or lot, piercer); auto-booked downsize check at her per-placement interval; aftercare messages.
- Nice-to-have: jewelry inventory with "reserve for client"; upgrade suggestions; healed-check photos; curated ear-project planning.
- Advanced: jewelry catalog with pre-selection at booking; supplier reorder; material documentation per piece.

**Records:** ID, consent (and guardian consent), medical history, per-piercing jewelry details, downsize history, photos. Oregon and Oklahoma body-art rules cover piercing alongside tattoo.

**Pitfalls:** do not reuse tattoo age logic, because minor piercing laws differ from tattoo laws and were not verified; do not present the APP position as law.

## Compliance reminders every profession's roadmap should repeat

The compliance layer is the same for every trade and should appear as a short checklist at the relevant build step, always phrased as "check your state" and never as legal advice.

| Topic | What the roadmap should tell her | Source |
|---|---|---|
| Consent, signed electronically | E-signatures cannot be denied legal effect solely for being electronic, and an electronic record meets a retention rule if it stays accurate and accessible. Some states require signed consent before specific services (Oregon peels and dermaplaning; Iowa laser, IPL, peels, microdermabrasion). Timestamp every signature and keep every version. | [ESIGN, P.L. 106-229](https://www.govinfo.gov/content/pkg/PLAW-106publ229/html/PLAW-106publ229.htm); [OAR 817-015-0065](https://oregon.public.law/rules/oar_817-015-0065); [Iowa 481-940.7](https://www.law.cornell.edu/regulations/iowa/Iowa-Code-r-481-940.7) |
| Record retention varies by state and city | Examples only: 2 years (Texas PMU/tattoo, Cambridge MA tattoo), 3 (Oregon esthetics and tattoo, Washington massage from age 18 for minors), 5 (West Virginia tattoo, Louisiana and Nevada massage), 7 (Durant, OK city ordinance). Ask her board or health department. | [25 TAC §229.406](https://law.cornell.edu/regulations/texas/25-Tex-Admin-Code-SS-229-406); [WAC 246-830-570](https://regulations.justia.com/states/washington/title-246/professional-standards-and-licensing/chapter-246-830/practice-requirements-and-limitations/section-246-830-570); [Durant](https://codelibrary.amlegal.com/codes/durant/latest/durant_ok/0-0-0-5747) |
| Never auto-delete records | Default to keep forever and export on demand. Deletes should be soft (hidden, recoverable). | Synthesis of the retention spread above |
| Minors | Tattoo: California bans under 18 with no parental exception; Texas allows only offensive-marking cover-ups with consent. Piercing rules differ from tattoo rules. Iowa lets a person with legal authority sign consent. Washington massage retention runs from age 18. Flag minors on the profile and require guardian signature. | [PC 653](https://www.shouselaw.com/ca/defense/penal-code/653/); [Tex. H&S 146.012](https://texas.public.law/statutes/tex._health_&_safety_code_section_146.012); [Iowa 481-940.7](https://www.law.cornell.edu/regulations/iowa/Iowa-Code-r-481-940.7) |
| HIPAA test | A provider is covered only if it "transmits any health information in electronic form" in a standard transaction such as insurance billing, including through a billing service. Most cash-pay beauty pros are not covered; med spas and insurance-billing massage therapists can be, and then need BAAs with every vendor. Ask: "Do you bill insurance or e-prescribe?" | [45 CFR 160.103](https://www.law.cornell.edu/cfr/text/45/160.103); [ASPE](https://www.aspe.hhs.gov/admnsimp/final/txfin01.htm) |
| Texting consent and 10DLC | Business texting needs A2P 10DLC registration. Twilio sole-proprietor brand registration is $4.50 one-time (from $4.00 on Aug 1, 2025), $15 campaign vetting, and $2 a month per campaign, limited to one campaign, one number and one message per second, plus per-message carrier surcharges. Marketing texts need prior express written consent. Revocation "by any reasonable means" must be honored within 10 business days; a September 30, 2026 FCC order lets a sender designate one opt-out method and keeps informational and marketing revocations separate. Capture reminder consent and marketing consent as separate checkboxes. | [Twilio](https://support.twilio.com/hc/en-us/articles/1260803965530); [Kelley Drye](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/eleventh-circuit-vacates-tcpa-11-consent-rule); [Day Pitney](https://daypitney.com/the-fcc-changes-certain-consent-revocation-rules) |
| Privacy policy | California's CalOPPA requires any commercial site collecting personal information from Californians to post a privacy policy naming categories collected, who it is shared with, how to review or change it, and an effective date. Most state comprehensive privacy laws apply above volume thresholds a solo pro will not reach. | [CalOPPA §22575](https://california.public.law/codes/ca_bus_and_prof_code_section_22575); [Troutman](https://www.troutman.com/insights/texas-and-oregon-data-privacy-laws-applicability-concerns-and-enforcement/) |
| Washington My Health My Data | Applies to businesses of **all sizes**, reaches out-of-state businesses with a Washington connection, defines consumer health data broadly, and carries a private right of action. Skin, allergy, medication and treatment notes should be treated as health data. | [IAPP](https://iapp.org/resources/article/washington-my-health-my-data-act-overview); [Fenwick](https://whatstrending.fenwick.com/post/entities-big-and-small-must-soon-comply-with-washingtons-my-health-my-data-act) |
| Health breach and ad pixels | The FTC's amended Health Breach Notification Rule counts unauthorized sharing, including with advertisers, as a breach. No ad or tracking pixels on intake or booking pages. | [Nixon Peabody](https://www.nixonpeabody.com/insights/alerts/2024/05/22/ftc-amends-and-broadens-health-breach-notification-rule) |
| Photo consent | Chart photo consent is not marketing consent. Use two separate, revocable checkboxes. | [Pabau](https://pabau.com/templates/photo-release-form/) |
| Card data | Use hosted checkout so card numbers never touch her app; store only token, brand, last four and expiry. Keep third-party scripts off payment pages. | [Stripe](https://docs.stripe.com/security/guide) |
| Accessibility | Federal website accessibility suits rose to 3,117 in 2025, up 27% (secondary figures). The ADA names no web standard for private businesses, but courts use WCAG 2.1 AA, and California's Unruh Act allows damages. Build the booking page to WCAG 2.1 AA. | [beaccessible](https://beaccessible.com/post/americans-with-disabilities-act-statistics/); [Level Access](https://www.levelaccess.com/blog/web-accessibility-lawsuits) |
| Lash and brow tinting | FDA has approved no color additive for dyeing lashes or brows; California's board has warned salons they can be cited. Never call a tint "FDA approved." | [Refinery29 quoting FDA](https://refinery29.com/en-us/eyelash-tinting-guide); [Lash Affair](https://lashaffair.com/blogs/lash-artist-blog/is-lash-tinting-and-eyebrow-dyeing-illegal-3f) |
| Scope of practice | The same service is in scope in one state and out in another (microneedling and dermaplaning for California estheticians). The app must not offer a service her license does not allow. | [AmSpa](https://americanmedspa.org/news/california-board-of-barbering-and-cosmetology-clarifies-esthetician-scope-of-practice-in-q-a) |
| Sanitation logs | California and Texas require pedicure foot-spa cleaning logs on board forms. Offer as opt-in, matched to her state's labels. | [CA 980.1](https://barbercosmo.ca.gov/forms_pubs/publications/980_1_whirlpool.pdf); [TDLR](https://license.state.tx.us/barbering-and-cosmetology/pdf/Whirlpool-Foot-Spa-Cleaning-Record-BAC-FI-004-E.pdf) |
| Gift cards and auto-renew memberships | Not verified in this research. Federal gift card rules and state escheat and auto-renewal laws exist; tell her to check before launching either. | Research gap |

## What the roadmap must never claim

The earlier research on the build page established that FTC enforcement against AI course sellers centered on earnings and "risk-free" claims, and that savings claims need evidence most buyers will achieve ([FTC 2024](https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes); [FTC substantiation](https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation)). The per-profession research adds a second category: claims about law and safety. The roadmap and every prompt in it must not say any of the following.

| Never claim | Say instead |
|---|---|
| "This makes you compliant," "HIPAA compliant," "board-ready," or "inspection-proof" | "This helps you keep the records your board or health department may ask for. Check your state's rules." |
| Any timing or threshold as a universal rule (48-hour patch test, 2-week fill, 6-week touch-up, 6-month Accutane wait, days after surgery, downsize weeks, DHA percentages) | "Many artists use X. Set your own number." |
| Any state rule as national, or any state's rule as current without a source and date | "In Texas, for example... Check your state and city." |
| "Tattooing or piercing minors is legal with parental consent" | "Minor rules vary and are a crime in some states. Check yours." |
| "FDA approved" for lash or brow tint, or for all-over spray tan | Nothing, or the FDA's own wording |
| "Semi-permanent" for microblading | "Long-lasting" |
| That a consent form removes liability | "A signed form documents what you explained." |
| That a service is in her scope of practice | "Check that your license covers this service in your state." |
| That HSA or FSA will cover a massage | "Some plans accept a detailed receipt; some also need a doctor's letter." |
| That records can be safely deleted after N years | "Keep everything; export when you need it." |
| Earnings, "pays for itself," "risk-free," savings figures, or "no coding, done in a weekend" | Dated, sourced arithmetic and "you copy and paste what Claude writes" (see the build-page research) |
| That texting is free or simple | "Texting needs a one-time registration and a small monthly fee." |

## Conclusion

The most useful finding for the roadmap's design is that twelve professions reduce to roughly **six reusable rule types** (window pricing, staged services, time-bearing add-ons, minimum gaps, follow-up packages, prerequisite gates) and **one record pattern** (structured fields wherever an inspector or a reaction investigation would look, never free text). That means the roadmap does not need twelve separate builds. It needs one spine, one interview that fills in her numbers, and a short menu of rule blocks each trade switches on. The interview becomes the product: its job is to turn "it depends" into her settings.

The research also shows where the evidence runs out, and the roadmap should be honest about it. Nearly every timing number comes from individual studio pages and vendor blogs, not trade surveys; there is no 50-state table for retention, minors or lash licensing; and no source measured which features beauty pros value most. That argues for two choices beyond the content above: every rule should ship as an editable setting pre-filled from her own answers, and the record layer should default to the strictest behavior (private per account, append-only with amendments, never auto-deleted, exportable in one tap). A builder who gets those two choices right is protected in every state, even the ones nobody researched.
