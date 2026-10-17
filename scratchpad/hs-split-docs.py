# Split the three 37-page Hair Stylist Collection PDFs into one PDF per document, per style, the same
# way scratchpad/ec-split-docs.py does for the Esthetician Collection. Page map read with pdftotext.
# Run: python3 scratchpad/hs-split-docs.py <src dir with the 3 PDFs> <assets/hs-... dir>
import json, os, sys, shutil, pypdf
SRC, DIR = sys.argv[1], sys.argv[2]
NAME = 'Hair Stylist Complete Collection - %s - US Letter.pdf'
DOCS = [
 ('intake','Client forms','Hair client intake',[2,3]),
 ('consult','Client forms','Consultation & service plan',[4]),
 ('chem-consent','Client forms','Chemical service consent',[5]),
 ('allergy-test','Client forms','Allergy alert & strand test',[6]),
 ('photo-release','Client forms','Before & after photo release',[7]),
 ('policy','Client forms','Salon booking policy',[8]),
 ('color-consent','Client forms','Hair color consent',[10]),
 ('lightening-consent','Client forms','Lightening consent',[13]),
 ('keratin-consent','Client forms','Keratin & smoothing consent',[16]),
 ('perm-consent','Client forms','Permanent wave consent',[19]),
 ('relaxer-consent','Client forms','Chemical relaxer consent',[22]),
 ('ext-consent','Client forms','Hair extension consent',[25]),
 ('color-protocol','Protocols','Hair color',[11]),
 ('lightening-protocol','Protocols','Lightening, highlights & balayage',[14]),
 ('keratin-protocol','Protocols','Keratin & smoothing',[17]),
 ('perm-protocol','Protocols','Permanent wave',[20]),
 ('relaxer-protocol','Protocols','Chemical relaxer',[23]),
 ('ext-protocol','Protocols','Hair extensions',[26]),
 ('color-aftercare','Aftercare & handouts','Caring for your hair color',[12]),
 ('lightening-aftercare','Aftercare & handouts','Caring for lightened hair',[15]),
 ('keratin-aftercare','Aftercare & handouts','Caring for smoothed hair',[18]),
 ('perm-aftercare','Aftercare & handouts','Caring for your new curls',[21]),
 ('relaxer-aftercare','Aftercare & handouts','Caring for relaxed hair',[24]),
 ('ext-aftercare','Aftercare & handouts','Caring for your extensions',[27]),
 ('before-visit','Aftercare & handouts','Before your salon visit',[28]),
 ('hair-care','Aftercare & handouts','Your hair care guide',[29]),
 ('aftercare-cards','Aftercare & handouts','Aftercare cards (4 × 6, cut out)',[34,35,36,37]),
 ('service-record','Records & business tools','Service record',[9]),
 ('color-theory','Records & business tools','Color theory cheat sheet',[30]),
 ('contra-chart','Records & business tools','Contraindication chart',[31]),
 ('incident','Records & business tools','Incident report',[32]),
 ('sanitation','Records & business tools','Sanitation & safety log',[33]),
 ('cover','Records & business tools','Cover & how to use these',[1]),
]
used = sorted(p for d in DOCS for p in d[3])
assert used == list(range(1,38)), [p for p in range(1,38) if used.count(p)!=1]
assert len(set(d[0] for d in DOCS)) == len(DOCS)
os.makedirs(DIR, exist_ok=True)
for style, label in (('neutral','Neutral'),('blush','Blush'),('luxe','Luxe')):
    src = os.path.join(SRC, NAME % label)
    shutil.copyfile(src, os.path.join(DIR, style + '.pdf'))
    r = pypdf.PdfReader(src)
    assert len(r.pages) == 37
    out = os.path.join(DIR, style); os.makedirs(out, exist_ok=True)
    for (i, cat, title, pages) in DOCS:
        w = pypdf.PdfWriter()
        for p in pages: w.add_page(r.pages[p-1])
        w.add_metadata({'/Title': title + ' - The Hair Stylist Collection'})
        w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(os.path.join(out, i + '.pdf'), 'wb') as f: w.write(f)
print(json.dumps([[i,c,t,len(p)] for (i,c,t,p) in DOCS], ensure_ascii=False))
