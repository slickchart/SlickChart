// POST /api/square/book
// Creates a REAL booking in Square Appointments.
//
// Body: {
//   serviceVariationId, serviceVariationVersion?, durationMinutes, startAt,  // required booking bits
//   teamMemberId,                                                            // who performs it
//   customerId?  | (customerName? + customerEmail?)                          // who it's for
// }
// startAt must be RFC3339 (e.g. "2026-07-15T17:00:00Z"). The app builds this
// from the chosen date + time before calling.
//
// Requires the token to have "Appointments (write)" + "Customers (write/read)".
import { squareFetch as _sqf, sqContext, resolveLocationId } from '../../lib/square.js';
import { sendEmail } from '../../lib/email.js';

function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Best-effort booking confirmation email to the client. Square only emails clients for
// API-created bookings when the seller's Appointments notifications are enabled — which isn't
// guaranteed — so SlickChart sends its own so the client is reliably notified.
async function sendBookingEmail({ to, first, svcName, whenText, biz }) {
  const who = biz ? _esc(biz) : 'your provider';
  const line = whenText ? `<strong>${_esc(svcName)}</strong> on <strong>${_esc(whenText)}</strong>` : `<strong>${_esc(svcName)}</strong>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px;color:#1a1a1a;">
    <div style="background:#14100c;border-radius:14px;padding:22px;text-align:center;color:#f4ede2;"><div style="font-size:20px;font-weight:700;">You're booked ✓</div></div>
    <div style="padding:22px 6px 6px;">
      <p style="font-size:16px;line-height:1.7;margin:0 0 14px;">Hi ${_esc(first)},</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 14px;">Your appointment with ${who} is confirmed:</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 14px;">${line}.</p>
      <p style="font-size:14px;line-height:1.7;color:#3a3a3a;margin:0;">See you then! If you need to change anything, just reply to this email.</p>
    </div></div>`;
  const text = `Hi ${first}, your appointment with ${biz || 'your provider'} is confirmed: ${svcName}${whenText ? (' on ' + whenText) : ''}. See you then! If you need to change anything, just reply to this email.`;
  return sendEmail({ to, subject: `Appointment confirmed${biz ? (' — ' + biz) : ''}`, html, text });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const ctx = await sqContext(req, res); if (!ctx) return;
  const sf = (p, o) => _sqf(p, o, ctx.token);

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const serviceVariationId = body.serviceVariationId;
    const teamMemberId = body.teamMemberId;
    const startAt = body.startAt;
    if (!serviceVariationId || !teamMemberId || !startAt) {
      res.status(400).json({ error: 'serviceVariationId, teamMemberId and startAt are all required.' });
      return;
    }

    const locationId = await resolveLocationId(ctx.token, ctx.locationId);
    if (!locationId) { res.status(400).json({ error: 'No Square location found for this account.' }); return; }

    // ── Resolve the customer: use the given id, else find by email, else create ──
    let customerId = (body.customerId || '').trim();
    if (!customerId) {
      const name = (body.customerName || '').trim();
      const email = (body.customerEmail || '').trim();
      if (email) {
        try {
          const found = await sf('/v2/customers/search', {
            method: 'POST',
            body: { limit: 1, query: { filter: { email_address: { exact: email } } } }
          });
          if (found.customers && found.customers[0]) customerId = found.customers[0].id;
        } catch (e) { /* fall through to create */ }
      }
      if (!customerId) {
        const parts = name.split(/\s+/).filter(Boolean);
        const created = await sf('/v2/customers', {
          method: 'POST',
          body: {
            given_name: parts[0] || name || 'Client',
            family_name: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
            email_address: email || undefined
          }
        });
        customerId = created.customer && created.customer.id;
      }
    }
    if (!customerId) { res.status(400).json({ error: 'Could not find or create a customer for this booking.' }); return; }

    // ── Build the appointment segment + create the booking ──
    const segment = {
      team_member_id: teamMemberId,
      service_variation_id: serviceVariationId,
      duration_minutes: Math.max(parseInt(body.durationMinutes, 10) || 60, 1)
    };
    if (body.serviceVariationVersion != null) segment.service_variation_version = body.serviceVariationVersion;

    // Prefer the client's stable key so a retried booking (lost response, tap-after-error) resolves
    // to the SAME appointment instead of creating a duplicate. Fall back to a generated one.
    const clientKey = String(body.idempotencyKey || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 45);
    const bookKey = clientKey || ('sc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
    const result = await sf('/v2/bookings', {
      method: 'POST',
      body: {
        idempotency_key: bookKey,
        booking: {
          location_id: locationId,
          customer_id: customerId,
          start_at: startAt,
          appointment_segments: [segment]
        }
      }
    });

    const b = result.booking || {};

    // Notify the client by email (best-effort — never fail the booking if email has trouble).
    const notifyEmail = String(body.customerEmail || '').trim();
    let notified = false;
    if (body.notify && notifyEmail) {
      try {
        await sendBookingEmail({
          to: notifyEmail,
          first: String(body.customerName || '').trim().split(/\s+/)[0] || 'there',
          svcName: String(body.serviceName || 'your appointment').slice(0, 200),
          whenText: String(body.whenText || '').slice(0, 200),
          biz: String(body.businessName || '').slice(0, 120)
        });
        notified = true;
      } catch (e) { /* client still booked; email is best-effort */ }
    }

    res.status(200).json({ ok: true, notified, booking: { id: b.id, startAt: b.start_at || startAt, status: b.status || 'PENDING', customerId } });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.squareErrors || null });
  }
}
