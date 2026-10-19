# Split the three 37-page Head Spa Collection PDFs into one PDF per document, per style, the same way
# scratchpad/na-split-docs.py does for the Nail Artist Collection. Page map read with pdftotext.
# Run: python3 -I scratchpad/hd-split-docs.py <src dir with the 3 PDFs> <assets/hd-... dir>
import json, os, sys, shutil, pypdf
SRC, DIR = sys.argv[1], sys.argv[2]
NAME = 'Head Spa Complete Collection - %s - US Letter.pdf'
TOTAL = 37
DOCS = [
 ('intake','Client forms','Head spa client intake',[2,3]),
 ('analysis','Client forms','Scalp analysis & treatment plan',[4]),
 ('service-consent','Client forms','Head spa service consent',[5]),
 ('sensitivity','Client forms','Sensitivity & patch test record',[6]),
 ('photo-release','Client forms','Scalp image & photo release',[7]),
 ('policy','Client forms','Booking & studio policy',[8]),
 ('ritual-consent','Client forms','Head spa ritual consent',[10]),
 ('exfoliation-consent','Client forms','Scalp exfoliation consent',[13]),
 ('steam-consent','Client forms','Steam & hydration consent',[16]),
 ('hot-oil-consent','Client forms','Hot oil & massage consent',[19]),
 ('hf-consent','Client forms','High-frequency scalp consent',[22]),
 ('led-consent','Client forms','LED light scalp consent',[25]),
 ('ritual-protocol','Protocols','Signature head spa ritual',[11]),
 ('exfoliation-protocol','Protocols','Exfoliation & deep cleanse',[14]),
 ('steam-protocol','Protocols','Steam & hydration scalp facial',[17]),
 ('hot-oil-protocol','Protocols','Hot oil & scalp massage',[20]),
 ('hf-protocol','Protocols','High-frequency scalp care',[23]),
 ('led-protocol','Protocols','LED light scalp therapy',[26]),
 ('ritual-aftercare','Aftercare & handouts','After your head spa ritual',[12]),
 ('exfoliation-aftercare','Aftercare & handouts','After your scalp exfoliation',[15]),
 ('steam-aftercare','Aftercare & handouts','Caring for your hydrated scalp',[18]),
 ('hot-oil-aftercare','Aftercare & handouts','After your hot oil treatment',[21]),
 ('hf-aftercare','Aftercare & handouts','After high frequency',[24]),
 ('led-aftercare','Aftercare & handouts','After LED light therapy',[27]),
 ('before-visit','Aftercare & handouts','Before your head spa',[28]),
 ('scalp-care','Aftercare & handouts','Your scalp care guide',[29]),
 ('aftercare-cards','Aftercare & handouts','Aftercare cards (4 × 6, cut out, with backs)',[34,35,36,37]),
 ('progress-record','Records & business tools','Scalp progress record',[9]),
 ('conditions','Records & business tools','Scalp conditions cheat sheet',[30]),
 ('contra-chart','Records & business tools','Head spa contraindication chart',[31]),
 ('incident','Records & business tools','Client incident report',[32]),
 ('sanitation','Records & business tools','Sanitation & equipment log',[33]),
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
        w.add_metadata({'/Title': title + ' - The Head Spa Collection'})
        w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(os.path.join(out, i + '.pdf'), 'wb') as f: w.write(f)
print(json.dumps([['hd-'+i,c,t,len(p)] for (i,c,t,p) in DOCS], ensure_ascii=False))
