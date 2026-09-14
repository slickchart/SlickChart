// GET /api/admin/contacts[?format=csv][&all=1]  → owner-only: every email address Ashley has, in one
// list, across all three products.
//
// Four sources feed it and a person can be in several at once (a provider who also grabbed the
// freebie is ONE person on a mailing list, not three rows):
//
//   providers        — SlickChart accounts
//   waitlist         — SlickChart leads
//   build_purchases  — Build Your Own App buyers, with the consent Stripe recorded at checkout
//   free_signups     — the free starter
//
// Consent is carried through honestly rather than flattened to "we have their address":
//
//   opted in   — they asked to hear from you: the waitlist, the free starter, or a buyer who
//                ticked Stripe's marketing box
//   customer   — a SlickChart account holder. Not a marketing opt-in; they signed up for software
//   not asked  — bought before the checkout tickbox existed. This is NOT consent
//   no         — a buyer who was shown the box and declined
//
// `unsubscribed` comes from nurture_optout, the same list every sequence honours, so someone who
// opted out of one thing is out of everything and the export says so.
//
// The CSV exports MAILABLE people only, because the CSV is the thing that gets imported into a mail
// tool months from now and a "no" row surviving that trip is how somebody gets emailed who said not
// to. `&all=1` returns everyone, including the declines and opt-outs, when the question is "who do I
// have" rather than "who can I write to".
//
// Owner gate matches build-buyers: identity comes from the VERIFIED session token, never from
// anything in the request (CLAUDE.md §0.5).
import { sql, ensureProvidersTable, ensureBuildPurchasesTable, dbEnabled } from '../../lib/db.js';
import { verifyToken } from '../../lib/auth.js';
import { ensureNurtureTables } from '../../lib/nurture.js';
import { ensureFreeTables } from '../../lib/free-funnel.js';

function claims(req) {
  const s = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return (s && t ? verifyToken(t, s) : null) || {};
}

const LIST_LABEL = { provider: 'SlickChart', waitlist: 'SlickChart waitlist', buyer: 'Build Your Own App', freebie: 'Free starter' };

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(200).json({ ok: true, count: 0, items: [], note: 'Database not configured.' }); return; }
  try {
    await ensureProvidersTable();
    const q = sql();

    const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
    const p = claims(req);
    let you = p.e ? String(p.e).toLowerCase() : null;
    if (!you && p.u) {
      try { const r = await q`SELECT email FROM providers WHERE id = ${p.u}`; you = (r[0] && r[0].email) ? String(r[0].email).toLowerCase() : null; } catch (e) {}
    }
    if (!owner || you !== owner) { res.status(403).json({ error: 'Owner only' }); return; }

    await ensureBuildPurchasesTable();
    await ensureNurtureTables(q);
    await ensureFreeTables(q);

    // One pass over all four sources. Deliberately NOT four round trips: Neon's HTTP driver opens a
    // fresh connection per query, and this is the founder tapping a button, not a hot path.
    const rows = await q`
      SELECT lower(email) AS email, 'provider' AS src, name, extract(epoch from created_at)*1000 AS ts, NULL::boolean AS opt
        FROM providers WHERE email IS NOT NULL AND email <> ''
      UNION ALL
      SELECT lower(email), 'waitlist', name, extract(epoch from created_at)*1000, NULL::boolean
        FROM waitlist WHERE email IS NOT NULL AND email <> ''
      UNION ALL
      SELECT lower(email), 'buyer', NULL, extract(epoch from created_at)*1000, marketing_opt_in
        FROM build_purchases WHERE email IS NOT NULL AND email <> ''
      UNION ALL
      SELECT lower(email), 'freebie', NULL, extract(epoch from created_at)*1000, NULL::boolean
        FROM free_signups WHERE email IS NOT NULL AND email <> ''`;

    const optedOut = new Set((await q`SELECT email FROM nurture_optout`).map(r => String(r.email || '').toLowerCase()));

    // Fold to one row per person.
    const byEmail = new Map();
    for (const r of rows) {
      const email = String(r.email || '').trim();
      if (!email) continue;
      let c = byEmail.get(email);
      if (!c) { c = { email, lists: new Set(), name: '', ts: Number(r.ts) || 0, buyerOpt: undefined }; byEmail.set(email, c); }
      c.lists.add(r.src);
      if (!c.name && r.name) c.name = String(r.name).trim();
      const ts = Number(r.ts) || 0;
      if (ts && (!c.ts || ts < c.ts)) c.ts = ts;        // first time she ever saw them
      // A repeat buyer can have several purchase rows; a single yes anywhere is consent.
      if (r.src === 'buyer' && typeof r.opt === 'boolean') {
        c.buyerOpt = (c.buyerOpt === true) ? true : r.opt;
      }
    }

    const consentOf = (c) => {
      if (c.lists.has('freebie') || c.lists.has('waitlist')) return 'opted in';
      if (c.lists.has('buyer')) return c.buyerOpt === true ? 'opted in' : (c.buyerOpt === false ? 'no' : 'not asked');
      return 'customer';                                  // a SlickChart account and nothing else
    };

    const items = [...byEmail.values()].map(c => {
      const consent = consentOf(c);
      const unsubscribed = optedOut.has(c.email);
      return {
        email: c.email,
        name: c.name || '',
        lists: [...c.lists].map(s => LIST_LABEL[s] || s),
        consent,
        unsubscribed,
        // "not asked" is not consent, so it is not mailable. It is still in the &all=1 export, and
        // it becomes mailable the moment she asks them.
        mailable: !unsubscribed && (consent === 'opted in' || consent === 'customer'),
        ts: Math.round(c.ts) || null
      };
    }).sort((a, b) => (b.ts || 0) - (a.ts || 0));

    const all = String((req.query && req.query.all) || '') === '1' || /[?&]all=1/.test(req.url || '');
    const mailable = items.filter(i => i.mailable);

    const counts = {
      total: items.length,
      mailable: mailable.length,
      unsubscribed: items.filter(i => i.unsubscribed).length,
      notAsked: items.filter(i => i.consent === 'not asked').length,
      declined: items.filter(i => i.consent === 'no').length,
      bySource: {
        slickchart: items.filter(i => i.lists.includes(LIST_LABEL.provider)).length,
        waitlist: items.filter(i => i.lists.includes(LIST_LABEL.waitlist)).length,
        build: items.filter(i => i.lists.includes(LIST_LABEL.buyer)).length,
        freebie: items.filter(i => i.lists.includes(LIST_LABEL.freebie)).length
      }
    };

    const fmt = (req.query && req.query.format) || (/format=csv/.test(req.url || '') ? 'csv' : '');
    if (fmt === 'csv') {
      const out = all ? items : mailable;
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      // First name / Last name are split out because that is what a mail tool's importer looks for;
      // the rest of the columns are for her, and an importer ignores what it doesn't recognise.
      const head = 'Email,First name,Last name,Lists,Consent,Status,First seen\n';
      const body = out.map(r => {
        const parts = String(r.name || '').split(/\s+/).filter(Boolean);
        return [
          r.email,
          parts[0] || '',
          parts.slice(1).join(' '),
          r.lists.join(' + '),
          r.consent,
          r.unsubscribed ? 'unsubscribed' : 'subscribed',
          r.ts ? new Date(r.ts).toISOString().slice(0, 10) : ''
        ].map(esc).join(',');
      }).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="slickchart-email-list' + (all ? '-everyone' : '') + '.csv"');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(head + body);
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, counts, items: all ? items : mailable });
  } catch (e) {
    console.error('[admin/contacts] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
