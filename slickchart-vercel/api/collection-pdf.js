// GET /api/collection-pdf  — provider-authed. Hands a signed-in provider with a live subscription the
// links to the printable Esthetician Collection and Lash & Brow Collection PDFs (the same files sold on Etsy), in three styles.
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
  // ?collection=lb picks the Lash & Brow files; anything else is the Esthetician Collection, as before.
  const lb = String((req.query && req.query.collection) || '') === 'lb';
  const doc = String((req.query && req.query.doc) || '');
  if (doc) {
    const style = String((req.query && req.query.style) || 'neutral');
    if (!STYLES.has(style)) { res.status(404).json({ error: 'That page is not in the collection.' }); return; }
    if (LB_DOC_IDS.has(doc)) {
      res.status(200).json({ ok: true, files: LB_FILES, doc: { id: doc, style, url: LB_DIR + style + '/' + doc.slice(3) + '.pdf' } });
      return;
    }
    if (!DOC_IDS.has(doc)) { res.status(404).json({ error: 'That page is not in the collection.' }); return; }
    res.status(200).json({ ok: true, files: FILES, doc: { id: doc, style, url: DIR + style + '/' + doc + '.pdf' } });
    return;
  }
  res.status(200).json({ ok: true, files: lb ? LB_FILES : FILES });
}
