// GET /api/admin/roadmap-sales → FOUNDER-ONLY: every Build roadmap sale and where it came from.
//
// Ashley 2026-11-20, after her first Beauty Biz roadmap sale: "can we see where the sale came from?
// I would love to track how those come in just like the app providers." The source of each sale is
// recorded by lib/build-sales.js (src_* columns, from the Stripe session's metadata). This reads it
// back for the daily ops brief, the way /api/admin/referrals gives it the provider sign-up sources.
//
// Gated to FOUNDER_EMAILS via the verified session token's email (CLAUDE.md §0.5), or the Monitor key
// (Authorization: Monitor <key>, as /api/admin/push-state and /api/admin/referrals take) so the brief
// can read it with nobody opening the app. Read-only; buyer emails are masked.
import { dbEnabled, sql, ensureBuildPurchasesTable } from '../../lib/db.js';
import { verifyToken, isSessionValid } from '../../lib/auth.js';
import { monitorKeyOk } from '../feedback.js';
import { excludedBuyerEmails, buildSourceLabel, buildSourceChannel } from '../../lib/build-sales.js';

function norm(s) { return String(s || '').trim().toLowerCase(); }

async function founderFromBearer(req, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = secret && tok ? verifyToken(tok, secret) : null;
  if (!p) return null;
  try { if (p.sid && !(await isSessionValid(q, p.sid))) return null; } catch (e) { return null; }
  const founders = String(process.env.FOUNDER_EMAILS || process.env.OWNER_EMAIL || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const email = norm(p.e);
  return email && founders.includes(email) ? email : null;
}

export function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at < 1) return s ? '***' : '';
  return s.slice(0, Math.min(2, at)) + '***' + s.slice(at);
}

const PRODUCT = { beauty: 'Beauty Biz roadmap', any: 'Master roadmap (any business)' };

function tally(list) {
  const m = {};
  for (const s of list) {
    const k = s.channel;
    if (!m[k]) m[k] = { channel: k, sales: 0, cents: 0 };
    m[k].sales++;
    m[k].cents += s.paidCents || 0;
  }
  return Object.values(m).sort((a, b) => b.sales - a.sales);
}
function centsOf(list) { return list.reduce((a, s) => a + (s.paidCents || 0), 0); }
function publicRow(s) {
  return { when: s.when, product: s.product, paidCents: s.paidCents, buyer: s.buyer, channel: s.channel, source: s.source, landing: s.landing };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!dbEnabled()) { res.status(503).json({ error: 'database not configured' }); return; }
  const q = sql();
  const founder = await founderFromBearer(req, q);
  let viaMonitor = false;
  if (!founder && String(req.headers['authorization'] || '').startsWith('Monitor ')) {
    try { viaMonitor = await monitorKeyOk(req, q, norm(process.env.OWNER_EMAIL)); } catch (e) { viaMonitor = false; }
  }
  if (!founder && !viaMonitor) { res.status(403).json({ error: 'Owner-only.', code: 'notowner' }); return; }

  try {
    await ensureBuildPurchasesTable();
    // build_purchases holds only Build roadmap sales (no provider data), one row per Stripe checkout.
    const rows = await q`SELECT stripe_session_id, email, amount_cents, currency, roadmap, src_source, src_campaign,
        src_content, src_landing, src_referrer, src_label, extract(epoch from created_at) * 1000 AS ts
      FROM build_purchases
      WHERE COALESCE(lower(email), '') <> ALL(${excludedBuyerEmails()}::text[])
      ORDER BY created_at DESC
      LIMIT 500`;
    const now = Date.now();
    const sales = rows.map(r => {
      const src = { source: r.src_source, campaign: r.src_campaign, content: r.src_content, landing: r.src_landing, referrer: r.src_referrer };
      const tracked = !!(r.src_source || r.src_referrer || r.src_landing);
      return {
        when: new Date(Math.round(Number(r.ts))).toISOString(),
        product: PRODUCT[r.roadmap] || 'Build roadmap',
        paidCents: r.amount_cents == null ? null : Number(r.amount_cents),
        buyer: maskEmail(r.email),
        channel: tracked ? buildSourceChannel(src) : 'Not recorded',
        source: r.src_label || buildSourceLabel(src) || 'not recorded (sold before tracking, or no link info reached checkout)',
        landing: r.src_landing || null,
        ts: Number(r.ts)
      };
    });
    const last24h = sales.filter(s => now - s.ts < 24 * 3600e3);
    const last30d = sales.filter(s => now - s.ts < 30 * 24 * 3600e3);
    const total = sales.length;
    const summary = total
      ? `${total} roadmap sale${total === 1 ? '' : 's'} so far ($${(centsOf(sales) / 100).toFixed(0)}). Last 24 hours: ${last24h.length}. By source: `
        + tally(sales).map(t => `${t.channel} ${t.sales}`).join(', ') + '.'
      : 'No roadmap sales yet.';
    res.status(200).json({
      ok: true, summary,
      total, totalCents: centsOf(sales),
      last24h: last24h.map(publicRow), last30dCount: last30d.length,
      bySource: tally(sales), bySource30d: tally(last30d),
      recent: sales.slice(0, 20).map(publicRow)
    });
  } catch (e) {
    console.error('[admin/roadmap-sales] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
