# Split the three 37-page Tattoo Artist Collection PDFs into one PDF per document, per style, the same way
# scratchpad/hd-split-docs.py does for the Head Spa Collection. Page map read with pdftotext.
# Run: python3 -I scratchpad/tt-split-docs.py <src dir with the 3 PDFs> <assets/tt-... dir>
import json, os, sys, shutil, pypdf
SRC, DIR = sys.argv[1], sys.argv[2]
NAME = 'Tattoo Artist Complete Collection - %s - US Letter.pdf'
TOTAL = 37
DOCS = [
 ('intake','Client forms','Tattoo client intake',[2,3]),
 ('consult','Client forms','Design consultation & placement',[4]),
 ('consent-release','Client forms','Tattoo consent & release',[5]),
 ('sensitivity','Client forms','Ink & skin sensitivity record',[6]),
 ('photo-release','Client forms','Photo & portfolio release',[7]),
 ('policy','Client forms','Booking & deposit policy',[8]),
 ('standard-consent','Client forms','Standard tattoo consent',[10]),
 ('coverup-consent','Client forms','Cover-up & rework consent',[13]),
 ('fineline-consent','Client forms','Fine line & micro tattoo consent',[16]),
 ('large-consent','Client forms','Large-scale & realism consent',[19]),
 ('touchup-consent','Client forms','Touch-up consent',[22]),
 ('second-skin-consent','Client forms','Second-skin healing consent',[25]),
 ('standard-protocol','Protocols','Standard tattoo',[11]),
 ('coverup-protocol','Protocols','Cover-up & rework',[14]),
 ('fineline-protocol','Protocols','Fine line & micro tattoo',[17]),
 ('large-protocol','Protocols','Color, realism & large-scale',[20]),
 ('touchup-protocol','Protocols','Touch-up',[23]),
 ('second-skin-protocol','Protocols','Second-skin healing',[26]),
 ('standard-aftercare','Aftercare & handouts','Caring for your new tattoo',[12]),
 ('coverup-aftercare','Aftercare & handouts','Caring for your cover-up',[15]),
 ('fineline-aftercare','Aftercare & handouts','Caring for your fine line tattoo',[18]),
 ('large-aftercare','Aftercare & handouts','Caring for your large tattoo',[21]),
 ('touchup-aftercare','Aftercare & handouts','Caring for your touch-up',[24]),
 ('second-skin-aftercare','Aftercare & handouts','Your second-skin aftercare',[27]),
 ('before-visit','Aftercare & handouts','Before your tattoo appointment',[28]),
 ('healing-guide','Aftercare & handouts','Your tattoo healing guide',[29]),
 ('aftercare-cards','Aftercare & handouts','Aftercare cards (4 × 6, cut out, with backs)',[34,35,36,37]),
 ('session-record','Records & business tools','Tattoo session record',[9]),
 ('cheat-sheet','Records & business tools','Tattoo artist cheat sheet',[30]),
 ('contra-chart','Records & business tools','Tattoo contraindication chart',[31]),
 ('incident','Records & business tools','Reaction & incident report',[32]),
 ('sanitation','Records & business tools','Sanitation & sterilization log',[33]),
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
        w.add_metadata({'/Title': title + ' - The Tattoo Artist Collection'})
        w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(os.path.join(out, i + '.pdf'), 'wb') as f: w.write(f)
print(json.dumps([['tt-'+i,c,t,len(p)] for (i,c,t,p) in DOCS], ensure_ascii=False))
