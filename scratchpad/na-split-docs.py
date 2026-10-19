# Split the three 37-page Nail Artist Collection PDFs into one PDF per document, per style, the same way
# scratchpad/hs-split-docs.py does for the Hair Stylist Collection. Page map read with pdftotext.
# Run: python3 -I scratchpad/na-split-docs.py <src dir with the 3 PDFs> <assets/na-... dir>
import json, os, sys, shutil, pypdf
SRC, DIR = sys.argv[1], sys.argv[2]
NAME = 'Nail Artist Complete Collection - %s - US Letter.pdf'
TOTAL = 37
DOCS = [
 ('intake','Client forms','Nail client intake',[2,3]),
 ('consult','Client forms','Consultation & design plan',[4]),
 ('service-consent','Client forms','Nail service consent',[5]),
 ('allergy','Client forms','Allergy & reaction record',[6]),
 ('photo-release','Client forms','Before & after photo release',[7]),
 ('policy','Client forms','Booking, fix & cancellation policy',[8]),
 ('gel-consent','Client forms','Gel polish & builder gel consent',[10]),
 ('acrylic-consent','Client forms','Acrylic nails consent',[13]),
 ('gel-ext-consent','Client forms','Gel extension consent',[16]),
 ('dip-consent','Client forms','Dip powder consent',[19]),
 ('pedicure-consent','Client forms','Pedicure consent',[22]),
 ('manicure-consent','Client forms','Manicure & e-file consent',[25]),
 ('gel-protocol','Protocols','Gel polish & builder gel',[11]),
 ('acrylic-protocol','Protocols','Acrylic nails',[14]),
 ('gel-ext-protocol','Protocols','Gel extensions',[17]),
 ('dip-protocol','Protocols','Dip powder',[20]),
 ('pedicure-protocol','Protocols','Pedicure & gel toes',[23]),
 ('manicure-protocol','Protocols','Manicure & e-file',[26]),
 ('gel-aftercare','Aftercare & handouts','Caring for your gel nails',[12]),
 ('acrylic-aftercare','Aftercare & handouts','Caring for your acrylic nails',[15]),
 ('gel-ext-aftercare','Aftercare & handouts','Caring for gel extensions',[18]),
 ('dip-aftercare','Aftercare & handouts','Caring for dip powder nails',[21]),
 ('pedicure-aftercare','Aftercare & handouts','Caring for your feet',[24]),
 ('manicure-aftercare','Aftercare & handouts','Caring for your nails',[27]),
 ('before-visit','Aftercare & handouts','Before your nail appointment',[28]),
 ('nail-care','Aftercare & handouts','Your nail care guide',[29]),
 ('aftercare-cards','Aftercare & handouts','Aftercare cards (4 × 6, cut out, with backs)',[34,35,36,37]),
 ('service-record','Records & business tools','Nail service record',[9]),
 ('systems','Records & business tools','Nail systems cheat sheet',[30]),
 ('contra-chart','Records & business tools','Nail contraindication chart',[31]),
 ('incident','Records & business tools','Reaction & incident report',[32]),
 ('sanitation','Records & business tools','Sanitation & foot spa log',[33]),
 ('cover','Records & business tools','Cover & how to use these',[1]),
]
used = sorted(p for d in DOCS for p in d[3])
assert used == list(range(1,TOTAL+1)), [p for p in range(1,TOTAL+1) if used.count(p)!=1]
assert len(set(d[0] for d in DOCS)) == len(DOCS)
os.makedirs(DIR, exist_ok=True)
for style, label in (('neutral','Neutral'),('blush','Blush'),('luxe','Luxe')):
    src = os.path.join(SRC, NAME % label)
    shutil.copyfile(src, os.path.join(DIR, style + '.pdf'))
    r = pypdf.PdfReader(src)
    assert len(r.pages) == TOTAL
    out = os.path.join(DIR, style); os.makedirs(out, exist_ok=True)
    for (i, cat, title, pages) in DOCS:
        w = pypdf.PdfWriter()
        for p in pages: w.add_page(r.pages[p-1])
        w.add_metadata({'/Title': title + ' - The Nail Artist Collection'})
        w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(os.path.join(out, i + '.pdf'), 'wb') as f: w.write(f)
print(json.dumps([['na-'+i,c,t,len(p)] for (i,c,t,p) in DOCS], ensure_ascii=False))
