# Split the three 45-page PMU Collection PDFs into one PDF per document, per style, the same way
# scratchpad/hs-split-docs.py does for the Hair Stylist Collection. Page map read with pdftotext.
# Run: python3 -I scratchpad/pm-split-docs.py <src dir with the 3 PDFs> <assets/pm-... dir>
import json, os, sys, shutil, pypdf
SRC, DIR = sys.argv[1], sys.argv[2]
NAME = 'PMU Complete Collection - %s - US Letter.pdf'
TOTAL = 45
DOCS = [
 ('intake','Client forms','PMU client intake & health history',[2,3]),
 ('brow-design','Client forms','Brow mapping & design approval',[4]),
 ('consent','Client forms','General PMU consent',[5]),
 ('patch-test','Client forms','Patch test consent & record',[6]),
 ('photo-release','Client forms','PMU photo & media release',[7]),
 ('policy','Client forms','PMU booking & touch-up policy',[8]),
 ('touchup','Client forms','Touch-up session form',[10]),
 ('microblading-consent','Client forms','Microblading consent',[11]),
 ('powder-consent','Client forms','Powder & ombré brow consent',[14]),
 ('lip-consent','Client forms','Lip blush consent',[17]),
 ('eyeliner-consent','Client forms','Permanent eyeliner consent',[20]),
 ('saline-consent','Client forms','Saline tattoo removal consent',[23]),
 ('smp-consent','Client forms','Scalp micropigmentation consent',[26]),
 ('areola-consent','Client forms','Areola restoration consent',[29]),
 ('freckles-consent','Client forms','Faux freckles consent',[32]),
 ('microblading-protocol','Protocols','Microblading',[12]),
 ('powder-protocol','Protocols','Powder, ombré & combo brows',[15]),
 ('lip-protocol','Protocols','Lip blush',[18]),
 ('eyeliner-protocol','Protocols','Eyeliner & lash enhancement',[21]),
 ('saline-protocol','Protocols','Saline tattoo removal',[24]),
 ('smp-protocol','Protocols','Scalp micropigmentation',[27]),
 ('areola-protocol','Protocols','Areola restoration',[30]),
 ('freckles-protocol','Protocols','Faux freckles',[33]),
 ('microblading-aftercare','Aftercare & handouts','Caring for microbladed brows',[13]),
 ('powder-aftercare','Aftercare & handouts','Caring for your powder brows',[16]),
 ('lip-aftercare','Aftercare & handouts','Caring for your lip blush',[19]),
 ('eyeliner-aftercare','Aftercare & handouts','Caring for your new eyeliner',[22]),
 ('saline-aftercare','Aftercare & handouts','After your saline removal',[25]),
 ('smp-aftercare','Aftercare & handouts','Caring for your scalp after SMP',[28]),
 ('areola-aftercare','Aftercare & handouts','After your areola restoration',[31]),
 ('freckles-aftercare','Aftercare & handouts','Caring for your new freckles',[34]),
 ('before-visit','Aftercare & handouts','Before your PMU appointment',[35]),
 ('healing-guide','Aftercare & handouts','What to expect while you heal',[36]),
 ('aftercare-cards','Aftercare & handouts','Aftercare cards (4 × 6, cut out, with backs)',[41,42,43,44,45]),
 ('pigment-record','Records & business tools','Procedure & pigment record',[9]),
 ('color-theory','Records & business tools','Pigment & color theory',[37]),
 ('contra-chart','Records & business tools','PMU contraindication chart',[38]),
 ('incident','Records & business tools','Adverse reaction & incident report',[39]),
 ('sanitation','Records & business tools','BBP, sanitation & sharps log',[40]),
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
        w.add_metadata({'/Title': title + ' - The PMU Collection'})
        w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        with open(os.path.join(out, i + '.pdf'), 'wb') as f: w.write(f)
print(json.dumps([['pm-'+i,c,t,len(p)] for (i,c,t,p) in DOCS], ensure_ascii=False))
