// GET /api/collection-pdf  — provider-authed. Hands a signed-in provider with a live subscription the
// links to the printable Esthetician, Lash & Brow, Hair Stylist, PMU, Nail Artist, Massage Therapist and Head Spa Collection PDFs (the same files sold on Etsy), in three styles.
//
// The files sit under an unguessable folder name that appears nowhere but here: the page never links
// to it, robots are told not to index it (vercel.json), and the app only learns the address from this
// endpoint after the caller's session and subscription are checked. It is not DRM — a provider can
// pass a link on, exactly as an Etsy buyer can pass on a download — it just keeps the files out of
// search engines and away from anyone who is not a signed-in subscriber.
import { sessionFromReq } from '../lib/auth.js';
import { sql, dbEnabled, getSubscription } from '../lib/db.js';

const DIR = '/assets/ec-9308d13917a6f75f4f385060/';
const FILES = [
  { style: 'neutral', label: 'Neutral', url: DIR + 'neutral.pdf' },
  { style: 'blush', label: 'Blush', url: DIR + 'blush.pdf' },
  { style: 'luxe', label: 'Luxe', url: DIR + 'luxe.pdf' }
];
// One file per document, per style (scratchpad/ec-split-docs.py), so a provider can view and print a
// single form or handout. ?doc=<id>&style=<style> answers with that one file's address.
const DOC_IDS = new Set(["intake", "general-consent", "photo-release", "policies", "virtual", "minor", "peel-consent", "derma-consent", "micro-consent", "wax-consent", "facial-consent", "acne-consent", "hydro-consent", "led-consent", "microcurrent-consent", "tint-consent", "peel-protocol", "derma-protocol", "micro-protocol", "wax-protocol", "facial-protocol", "acne-protocol", "hydro-protocol", "led-protocol", "microcurrent-protocol", "tint-protocol", "peel-aftercare", "derma-aftercare", "micro-aftercare", "wax-aftercare", "facial-aftercare", "acne-aftercare", "hydro-aftercare", "led-aftercare", "microcurrent-aftercare", "tint-aftercare", "before-appointment", "spf-guide", "homecare-plan", "aftercare-cards", "skin-analysis", "treatment-record", "contra-cheat", "patch-test", "incident", "sanitation", "cover"]);
// The Lash & Brow Collection (2026-10-17), split the same way by scratchpad/lb-split-docs.py. Its ids
// carry an lb- prefix in the app, so the two collections never share a name.
const LB_DIR = '/assets/lb-a5025eda48748f3494bcacd7/';
const LB_FILES = [
  { style: 'neutral', label: 'Neutral', url: LB_DIR + 'neutral.pdf' },
  { style: 'blush', label: 'Blush', url: LB_DIR + 'blush.pdf' },
  { style: 'luxe', label: 'Luxe', url: LB_DIR + 'luxe.pdf' }
];
const LB_DOC_IDS = new Set(["lb-intake", "lb-lash-map", "lb-brow-design", "lb-service-consent", "lb-patch-test", "lb-photo-release", "lb-policy", "lb-ext-consent", "lb-lift-consent", "lb-lam-consent", "lb-tint-consent", "lb-wax-consent", "lb-removal-consent", "lb-ext-protocol", "lb-lift-protocol", "lb-lam-protocol", "lb-tint-protocol", "lb-wax-protocol", "lb-removal-protocol", "lb-ext-aftercare", "lb-lift-aftercare", "lb-lam-aftercare", "lb-tint-aftercare", "lb-wax-aftercare", "lb-removal-aftercare", "lb-before-visit", "lb-retention", "lb-aftercare-cards", "lb-service-record", "lb-styling", "lb-contra-chart", "lb-incident", "lb-hygiene-log", "lb-cover"]);
// The Hair Stylist Collection (2026-10-17), split by scratchpad/hs-split-docs.py; ids carry an hs- prefix.
const HS_DIR = '/assets/hs-cd08c7917b34626fe2a21967/';
const HS_FILES = [
  { style: 'neutral', label: 'Neutral', url: HS_DIR + 'neutral.pdf' },
  { style: 'blush', label: 'Blush', url: HS_DIR + 'blush.pdf' },
  { style: 'luxe', label: 'Luxe', url: HS_DIR + 'luxe.pdf' }
];
const HS_DOC_IDS = new Set(["hs-intake", "hs-consult", "hs-chem-consent", "hs-allergy-test", "hs-photo-release", "hs-policy", "hs-color-consent", "hs-lightening-consent", "hs-keratin-consent", "hs-perm-consent", "hs-relaxer-consent", "hs-ext-consent", "hs-color-protocol", "hs-lightening-protocol", "hs-keratin-protocol", "hs-perm-protocol", "hs-relaxer-protocol", "hs-ext-protocol", "hs-color-aftercare", "hs-lightening-aftercare", "hs-keratin-aftercare", "hs-perm-aftercare", "hs-relaxer-aftercare", "hs-ext-aftercare", "hs-before-visit", "hs-hair-care", "hs-aftercare-cards", "hs-service-record", "hs-color-theory", "hs-contra-chart", "hs-incident", "hs-sanitation", "hs-cover"]);
// The PMU Collection (2026-10-19), split by scratchpad/pm-split-docs.py; ids carry a pm- prefix.
const PM_DIR = '/assets/pm-8881ba4d736d7954ddb1e516/';
const PM_FILES = [
  { style: 'neutral', label: 'Neutral', url: PM_DIR + 'neutral.pdf' },
  { style: 'blush', label: 'Blush', url: PM_DIR + 'blush.pdf' },
  { style: 'luxe', label: 'Luxe', url: PM_DIR + 'luxe.pdf' }
];
const PM_DOC_IDS = new Set(["pm-intake", "pm-brow-design", "pm-consent", "pm-patch-test", "pm-photo-release", "pm-policy", "pm-touchup", "pm-microblading-consent", "pm-powder-consent", "pm-lip-consent", "pm-eyeliner-consent", "pm-saline-consent", "pm-smp-consent", "pm-areola-consent", "pm-freckles-consent", "pm-microblading-protocol", "pm-powder-protocol", "pm-lip-protocol", "pm-eyeliner-protocol", "pm-saline-protocol", "pm-smp-protocol", "pm-areola-protocol", "pm-freckles-protocol", "pm-microblading-aftercare", "pm-powder-aftercare", "pm-lip-aftercare", "pm-eyeliner-aftercare", "pm-saline-aftercare", "pm-smp-aftercare", "pm-areola-aftercare", "pm-freckles-aftercare", "pm-before-visit", "pm-healing-guide", "pm-aftercare-cards", "pm-pigment-record", "pm-color-theory", "pm-contra-chart", "pm-incident", "pm-sanitation", "pm-cover"]);
// The Nail Artist Collection (2026-10-19), split by scratchpad/na-split-docs.py; ids carry an na- prefix.
const NA_DIR = '/assets/na-97315595add70d4ee045ac48/';
const NA_FILES = [
  { style: 'neutral', label: 'Neutral', url: NA_DIR + 'neutral.pdf' },
  { style: 'blush', label: 'Blush', url: NA_DIR + 'blush.pdf' },
  { style: 'luxe', label: 'Luxe', url: NA_DIR + 'luxe.pdf' }
];
const NA_DOC_IDS = new Set(["na-intake", "na-consult", "na-service-consent", "na-allergy", "na-photo-release", "na-policy", "na-gel-consent", "na-acrylic-consent", "na-gel-ext-consent", "na-dip-consent", "na-pedicure-consent", "na-manicure-consent", "na-gel-protocol", "na-acrylic-protocol", "na-gel-ext-protocol", "na-dip-protocol", "na-pedicure-protocol", "na-manicure-protocol", "na-gel-aftercare", "na-acrylic-aftercare", "na-gel-ext-aftercare", "na-dip-aftercare", "na-pedicure-aftercare", "na-manicure-aftercare", "na-before-visit", "na-nail-care", "na-aftercare-cards", "na-service-record", "na-systems", "na-contra-chart", "na-incident", "na-sanitation", "na-cover"]);
// The Massage Therapist Collection (2026-10-19), split by scratchpad/mt-split-docs.py; ids carry an mt- prefix.
const MT_DIR = '/assets/mt-22356de748488743d57612cf/';
const MT_FILES = [
  { style: 'neutral', label: 'Neutral', url: MT_DIR + 'neutral.pdf' },
  { style: 'blush', label: 'Blush', url: MT_DIR + 'blush.pdf' },
  { style: 'luxe', label: 'Luxe', url: MT_DIR + 'luxe.pdf' }
];
const MT_DOC_IDS = new Set([]);
// The Head Spa Collection (2026-10-19), split by scratchpad/hd-split-docs.py; ids carry an hd- prefix.
const HD_DIR = '/assets/hd-d5b1a5175d2a99be58ea00a7/';
const HD_FILES = [
  { style: 'neutral', label: 'Neutral', url: HD_DIR + 'neutral.pdf' },
  { style: 'blush', label: 'Blush', url: HD_DIR + 'blush.pdf' },
  { style: 'luxe', label: 'Luxe', url: HD_DIR + 'luxe.pdf' }
];
const HD_DOC_IDS = new Set([]);
const STYLES = new Set(['neutral', 'blush', 'luxe']);

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  let p = null;
  try { p = await sessionFromReq(req, dbEnabled() ? sql() : null); } catch (e) { p = null; }
  if (!p || !p.u) { res.status(401).json({ error: 'Please sign in to SlickChart to download these.' }); return; }
  // Same rule as signing in (api/login.js): only a paying account gets in when payment is required.
  // A provider who is behind on a payment is let in there with a banner, so she is let in here too.
  if ((process.env.REQUIRE_PAYMENT || '').toLowerCase() === 'true' && p.u !== 'owner') {
    const email = String(p.e || '').trim().toLowerCase();
    const founders = ['botanicalaestheticsbyashley@gmail.com']
      .concat(String(process.env.FOUNDER_EMAILS || '').toLowerCase().split(','))
      .map(s => s.trim()).filter(Boolean);
    if (!founders.includes(email)) {
      let sub = null;
      try { sub = email && dbEnabled() ? await getSubscription(email) : null; } catch (e) { sub = null; }
      const ok = !!(sub && ['active', 'trialing', 'past_due'].includes(sub.status));
      if (!ok) { res.status(402).json({ error: 'The printable collection comes with an active SlickChart subscription.' }); return; }
    }
  }
  // ?collection=lb picks the Lash & Brow files, ?collection=hs the Hair Stylist ones, ?collection=pm the PMU ones, ?collection=na the Nail Artist ones, ?collection=mt the Massage Therapist ones, ?collection=hd the Head Spa ones; anything else is the Esthetician Collection, as before.
  const collection = String((req.query && req.query.collection) || '');
  const lb = collection === 'lb';
  const doc = String((req.query && req.query.doc) || '');
  if (doc) {
    const style = String((req.query && req.query.style) || 'neutral');
    if (!STYLES.has(style)) { res.status(404).json({ error: 'That page is not in the collection.' }); return; }
    if (MT_DOC_IDS.has(doc)) {
      res.status(200).json({ ok: true, files: MT_FILES, doc: { id: doc, style, url: MT_DIR + style + '/' + doc.slice(3) + '.pdf' } });
      return;
    }
    if (HD_DOC_IDS.has(doc)) {
      res.status(200).json({ ok: true, files: HD_FILES, doc: { id: doc, style, url: HD_DIR + style + '/' + doc.slice(3) + '.pdf' } });
      return;
    }
    if (NA_DOC_IDS.has(doc)) {
      res.status(200).json({ ok: true, files: NA_FILES, doc: { id: doc, style, url: NA_DIR + style + '/' + doc.slice(3) + '.pdf' } });
      return;
    }
    if (PM_DOC_IDS.has(doc)) {
      res.status(200).json({ ok: true, files: PM_FILES, doc: { id: doc, style, url: PM_DIR + style + '/' + doc.slice(3) + '.pdf' } });
      return;
    }
    if (HS_DOC_IDS.has(doc)) {
      res.status(200).json({ ok: true, files: HS_FILES, doc: { id: doc, style, url: HS_DIR + style + '/' + doc.slice(3) + '.pdf' } });
      return;
    }
    if (LB_DOC_IDS.has(doc)) {
      res.status(200).json({ ok: true, files: LB_FILES, doc: { id: doc, style, url: LB_DIR + style + '/' + doc.slice(3) + '.pdf' } });
      return;
    }
    if (!DOC_IDS.has(doc)) { res.status(404).json({ error: 'That page is not in the collection.' }); return; }
    res.status(200).json({ ok: true, files: FILES, doc: { id: doc, style, url: DIR + style + '/' + doc + '.pdf' } });
    return;
  }
  res.status(200).json({ ok: true, files: collection === 'mt' ? MT_FILES : collection === 'hd' ? HD_FILES : collection === 'na' ? NA_FILES : collection === 'pm' ? PM_FILES : (collection === 'hs' ? HS_FILES : (lb ? LB_FILES : FILES)) });
}
