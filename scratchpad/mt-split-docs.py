# Split the three 37-page Massage Therapist Collection PDFs into one PDF per document, per style, the same
# way scratchpad/na-split-docs.py does for the Nail Artist Collection. Page map read with pdftotext.
# Run: python3 -I scratchpad/mt-split-docs.py <src dir with the 3 PDFs> <assets/mt-... dir>
import json, os, sys, shutil, pypdf
SRC, DIR = sys.argv[1], sys.argv[2]
NAME = 'Massage Therapist Complete Collection - %s - US Letter.pdf'
TOTAL = 37
DOCS = [
 ('intake','Client forms','Massage client intake',[2,3]),
 ('treatment-plan','Client forms','Body chart & treatment plan',[4]),
 ('consent','Client forms','Massage therapy consent',[5]),
 ('draping','Client forms','Draping, boundaries & area consent',[6]),
 ('clearance','Client forms','Physician clearance for massage',[7]),
 ('policy','Client forms','Booking, cancellation & studio policy',[8]),
 ('swedish-consent','Client forms','Swedish & relaxation consent',[10]),
 ('deep-consent','Client forms','Deep tissue & sports consent',[13]),
 ('prenatal-consent','Client forms','Prenatal massage consent',[16]),
 ('hot-stone-consent','Client forms','Hot stone massage consent',[19]),
 ('cupping-consent','Client forms','Cupping therapy consent',[22]),
 ('lymphatic-consent','Client forms','Lymphatic drainage consent',[25]),
 ('swedish-protocol','Protocols','Swedish & relaxation massage',[11]),
 ('deep-protocol','Protocols','Deep tissue & sports massage',[14]),
 ('prenatal-protocol','Protocols','Prenatal massage',[17]),
 ('hot-stone-protocol','Protocols','Hot stone massage',[20]),
 ('cupping-protocol','Protocols','Cupping therapy',[23]),
 ('lymphatic-protocol','Protocols','Lymphatic drainage',[26]),
 ('swedish-aftercare','Aftercare & handouts','After your Swedish massage',[12]),
 ('deep-aftercare','Aftercare & handouts','After deep tissue massage',[15]),
 ('prenatal-aftercare','Aftercare & handouts','After your prenatal massage',[18]),
 ('hot-stone-aftercare','Aftercare & handouts','After your hot stone massage',[21]),
 ('cupping-aftercare','Aftercare & handouts','After your cupping',[24]),
 ('lymphatic-aftercare','Aftercare & handouts','After lymphatic drainage',[27]),
 ('before-visit','Aftercare & handouts','Before your massage',[28]),
 ('self-care','Aftercare & handouts','Your self-care guide',[29]),
 ('aftercare-cards','Aftercare & handouts','Aftercare cards (4 × 6, cut out, with backs)',[34,35,36,37]),
 ('soap-notes','Records & business tools','SOAP notes',[9]),
 ('pressure-guide','Records & business tools','Pressure & endangerment guide',[30]),
 ('contra-chart','Records & business tools','Massage contraindication chart',[31]),
 ('incident','Records & business tools','Client incident report',[32]),
 ('sanitation','Records & business tools','Sanitation & linen log',[33]),
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
        w.add_metadata({'/Title': title + ' - The Massage Therapist Collection'})
        w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(os.path.join(out, i + '.pdf'), 'wb') as f: w.write(f)
print(json.dumps([['mt-'+i,c,t,len(p)] for (i,c,t,p) in DOCS], ensure_ascii=False))
