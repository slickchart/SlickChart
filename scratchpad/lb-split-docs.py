# Split the three 38-page Lash & Brow Collection PDFs into one PDF per document, per style, the same
# way scratchpad/ec-split-docs.py does for the Esthetician Collection. Page map read with pdftotext.
# Run: python3 scratchpad/lb-split-docs.py <src dir with the 3 PDFs> <assets/lb-... dir>
import json, os, sys, shutil, pypdf
SRC, DIR = sys.argv[1], sys.argv[2]
NAME = 'Lash and Brow Complete Collection - %s - US Letter.pdf'
DOCS = [
 ('intake','Client forms','Lash & brow client intake',[2,3]),
 ('lash-map','Client forms','Lash map & design approval',[4]),
 ('brow-design','Client forms','Brow shaping & design approval',[5]),
 ('service-consent','Client forms','Lash & brow service consent',[6]),
 ('patch-test','Client forms','Patch test consent & record',[7]),
 ('photo-release','Client forms','Lash & brow photo release',[8]),
 ('policy','Client forms','Booking policy',[9]),
 ('ext-consent','Client forms','Lash extension consent',[11]),
 ('lift-consent','Client forms','Lash lift & tint consent',[14]),
 ('lam-consent','Client forms','Brow lamination consent',[17]),
 ('tint-consent','Client forms','Brow tint & henna consent',[20]),
 ('wax-consent','Client forms','Brow wax & shaping consent',[23]),
 ('removal-consent','Client forms','Lash removal consent',[26]),
 ('ext-protocol','Protocols','Lash extensions',[12]),
 ('lift-protocol','Protocols','Lash lift & tint',[15]),
 ('lam-protocol','Protocols','Brow lamination',[18]),
 ('tint-protocol','Protocols','Brow tint & henna',[21]),
 ('wax-protocol','Protocols','Brow wax & shaping',[24]),
 ('removal-protocol','Protocols','Lash removal',[27]),
 ('ext-aftercare','Aftercare & handouts','Caring for your extensions',[13]),
 ('lift-aftercare','Aftercare & handouts','Caring for your lash lift',[16]),
 ('lam-aftercare','Aftercare & handouts','Caring for laminated brows',[19]),
 ('tint-aftercare','Aftercare & handouts','Caring for your tinted brows',[22]),
 ('wax-aftercare','Aftercare & handouts','Caring for your shaped brows',[25]),
 ('removal-aftercare','Aftercare & handouts','After your lash removal',[28]),
 ('before-visit','Aftercare & handouts','Before your lash & brow visit',[29]),
 ('retention','Aftercare & handouts','Lash care & retention guide',[30]),
 ('aftercare-cards','Aftercare & handouts','Aftercare cards (4 × 6, cut out)',[35,36,37,38]),
 ('service-record','Records & business tools','Service record',[10]),
 ('styling','Records & business tools','Lash & brow styling reference',[31]),
 ('contra-chart','Records & business tools','Contraindication chart',[32]),
 ('incident','Records & business tools','Incident report',[33]),
 ('hygiene-log','Records & business tools','Hygiene & adhesive log',[34]),
 ('cover','Records & business tools','Cover & how to use these',[1]),
]
used = sorted(p for d in DOCS for p in d[3])
assert used == list(range(1,39)), [p for p in range(1,39) if used.count(p)!=1]
assert len(set(d[0] for d in DOCS)) == len(DOCS)
os.makedirs(DIR, exist_ok=True)
for style, label in (('neutral','Neutral'),('blush','Blush'),('luxe','Luxe')):
    src = os.path.join(SRC, NAME % label)
    shutil.copyfile(src, os.path.join(DIR, style + '.pdf'))
    r = pypdf.PdfReader(src)
    assert len(r.pages) == 38
    out = os.path.join(DIR, style); os.makedirs(out, exist_ok=True)
    for (i, cat, title, pages) in DOCS:
        w = pypdf.PdfWriter()
        for p in pages: w.add_page(r.pages[p-1])
        w.add_metadata({'/Title': title + ' - The Lash & Brow Collection'})
        w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(os.path.join(out, i + '.pdf'), 'wb') as f: w.write(f)
print(json.dumps([[i,c,t,len(p)] for (i,c,t,p) in DOCS], ensure_ascii=False))
