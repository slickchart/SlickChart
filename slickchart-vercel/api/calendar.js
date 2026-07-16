// GET /api/calendar?t=<token>  → an iCalendar (.ics) feed of the provider's appointments.
// Google Calendar ("From URL") and Apple Calendar ("Subscribe") poll this to stay in sync.
// The client keeps a normalized `sc_calendar_feed` list in its cloud store; we wrap it in VCALENDAR.
import { verifyToken } from '../lib/auth.js';
import { sql, dbEnabled } from '../lib/db.js';

function esc(s) { return String(s == null ? '' : s).replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n'); }
function wrap(events) {
  const now = new Date(); const pad = n => String(n).padStart(2, '0');
  const stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' +
    pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
  // Sanitize datetime/uid fields too (not just SUMMARY/DESCRIPTION) so a stray CRLF in any field can't
  // inject extra iCalendar lines/properties. Datetimes keep only valid ICS chars.
  const dt = v => String(v || '').replace(/[^0-9TZ]/g, '');
  const body = (events || []).map(e => [
    'BEGIN:VEVENT',
    'UID:' + esc(e.uid || ('sc-' + Math.random().toString(36).slice(2) + '@slickchart')),
    'DTSTAMP:' + stamp,
    'DTSTART:' + dt(e.start),
    'DTEND:' + dt(e.end || e.start),
    'SUMMARY:' + esc(e.title),
    e.notes ? ('DESCRIPTION:' + esc(e.notes)) : ''
  ].filter(Boolean).join('\r\n')).join('\r\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SlickChart//Calendar//EN', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:SlickChart Appointments', body, 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

export default async function handler(req, res) {
  const secret = process.env.SESSION_SECRET || '';
  const t = (req.query && req.query.t) || '';
  const p = secret && t ? verifyToken(String(t), secret, { scope: 'cal' }) : null;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="slickchart.ics"');
  let events = [];
  if (p && p.k === 'cal' && p.u && dbEnabled()) {
    try {
      const q = sql();
      const rows = await q`SELECT v FROM kv WHERE owner = ${p.u} AND k = 'sc_calendar_feed'`;
      events = JSON.parse((rows[0] && rows[0].v) || '[]');
    } catch (e) { events = []; }
  }
  res.statusCode = 200;
  res.end(wrap(events));
}
