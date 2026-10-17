# Split the three 54-page Esthetician Collection PDFs into one PDF per document, per style
# (Ashley, 2026-10-17: "make it so they can choose each one individually and view + print").
# Page map read from the PDF itself with pdftotext. Run: python3 scratchpad/ec-split-docs.py <dir>
import json, os, sys, pypdf
DIR = sys.argv[1]
DOCS = [
 ('intake','Client forms','Client intake & health history',[2,3]),
 ('general-consent','Client forms','General treatment consent',[10]),
 ('photo-release','Client forms','Photo & media release',[11]),
 ('policies','Client forms','Appointment policies',[13]),
 ('virtual','Client forms','Virtual skin consultation',[14]),
 ('minor','Client forms','Parent or guardian consent',[15]),
 ('peel-consent','Client forms','Chemical peel consent',[5,6]),
 ('derma-consent','Client forms','Dermaplaning consent',[16]),
 ('micro-consent','Client forms','Microneedling consent',[19]),
 ('wax-consent','Client forms','Waxing consent',[22]),
 ('facial-consent','Client forms','Facial & extractions consent',[25]),
 ('acne-consent','Client forms','Acne facial consent',[28]),
 ('hydro-consent','Client forms','Hydrodermabrasion consent',[31]),
 ('led-consent','Client forms','LED light therapy consent',[34]),
 ('microcurrent-consent','Client forms','Microcurrent facial consent',[37]),
 ('tint-consent','Client forms','Lash & brow tint consent',[40]),
 ('peel-protocol','Protocols','Superficial chemical peel',[7]),
 ('derma-protocol','Protocols','Dermaplaning',[17]),
 ('micro-protocol','Protocols','Cosmetic microneedling',[20]),
 ('wax-protocol','Protocols','Face & body waxing',[23]),
 ('facial-protocol','Protocols','Signature facial & extractions',[26]),
 ('acne-protocol','Protocols','Acne facial',[29]),
 ('hydro-protocol','Protocols','Hydrodermabrasion facial',[32]),
 ('led-protocol','Protocols','LED light therapy',[35]),
 ('microcurrent-protocol','Protocols','Microcurrent facial',[38]),
 ('tint-protocol','Protocols','Lash & brow tint',[41]),
 ('peel-aftercare','Aftercare & handouts','After a chemical peel',[8]),
 ('derma-aftercare','Aftercare & handouts','After dermaplaning',[18]),
 ('micro-aftercare','Aftercare & handouts','After microneedling',[21]),
 ('wax-aftercare','Aftercare & handouts','After a wax',[24]),
 ('facial-aftercare','Aftercare & handouts','After a facial',[27]),
 ('acne-aftercare','Aftercare & handouts','After an acne facial',[30]),
 ('hydro-aftercare','Aftercare & handouts','After hydrodermabrasion',[33]),
 ('led-aftercare','Aftercare & handouts','After an LED session',[36]),
 ('microcurrent-aftercare','Aftercare & handouts','After a microcurrent facial',[39]),
 ('tint-aftercare','Aftercare & handouts','After a lash & brow tint',[42]),
 ('before-appointment','Aftercare & handouts','Before your appointment',[43]),
 ('spf-guide','Aftercare & handouts','Your daily SPF guide',[44]),
 ('homecare-plan','Aftercare & handouts','Your homecare plan',[9]),
 ('aftercare-cards','Aftercare & handouts','Aftercare cards (4 × 6, cut out)',[49,50,51,52,53,54]),
 ('skin-analysis','Records & business tools','Skin analysis & treatment plan',[4]),
 ('treatment-record','Records & business tools','Treatment record & progress log',[12]),
 ('contra-cheat','Records & business tools','Contraindication cheat sheet',[45]),
 ('patch-test','Records & business tools','Patch test record',[46]),
 ('incident','Records & business tools','Adverse reaction & incident report',[47]),
 ('sanitation','Records & business tools','Sanitation & disinfection log',[48]),
 ('cover','Records & business tools','Cover & how to use these',[1]),
]
used = sorted(p for d in DOCS for p in d[3])
assert used == list(range(1,55)), [p for p in range(1,55) if used.count(p)!=1]
for style in ('neutral','blush','luxe'):
    r = pypdf.PdfReader(os.path.join(DIR, style + '.pdf'))
    out = os.path.join(DIR, style); os.makedirs(out, exist_ok=True)
    for (i, cat, title, pages) in DOCS:
        w = pypdf.PdfWriter()
        for p in pages: w.add_page(r.pages[p-1])
        w.add_metadata({'/Title': title + ' - The Esthetician Collection'})
        w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(os.path.join(out, i + '.pdf'), 'wb') as f: w.write(f)
print(json.dumps([[i,c,t,len(p)] for (i,c,t,p) in DOCS]))
