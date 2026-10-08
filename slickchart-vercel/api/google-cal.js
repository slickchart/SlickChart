// GET    /api/google-cal            → { connected, configured, lastOk, needsReconnect, authUrl }
// POST   /api/google-cal            → body { appts:[...] } reconcile her appointments into Google
// DELETE /api/google-cal            → disconnect this provider
//
// Bearer session only. The provider id comes from the VERIFIED token and never from the body
// (CLAUDE.md §0.1): this row holds a token that can write to her calendar, so there is no path where
// one account's request can reach another's connection.
import { sql, dbEnabled } from '../lib/db.js';
import { verifyToken, isSessionValid, signToken } from '../lib/auth.js';
import { appOrigin } from '../lib/email.js';
import {
  ensureGoogleTable, getGoogleConnection, deleteGoogleConnection, googleConfigured,
  syncApptsToGoogle, GOOGLE_SCOPE
} from '../lib/google-cal.js';

async function requireLogin(req, res, q) {
  const secret = process.env.SESSION_SECRET || '';
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = secret && token ? verifyToken(token, secret) : null;
  if (!payload || !payload.u) { res.status(401).json({ error: 'Not logged in.' }); return null; }
  try {
    if (payload.sid && !(await isSessionValid(q, payload.sid))) {
      res.status(401).json({ error: 'This session has been signed out. Please log in again.' });
      return null;
    }
  } catch (e) {}
  return String(payload.u);
}

// Google only redirects to a redirect_uri REGISTERED in the Google console, and the same string
// has to come back on the token exchange. Prefer APP_ORIGIN when it is set explicitly, so there is
// exactly ONE address to register no matter which host she reached the app on (slickchart.app,
// www., a vercel preview). With APP_ORIGIN unset this is the request host, as it was before, so
// nothing changes on a deployment that has not set it.
export function redirectUri(req) {
  const env = String(process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
  const base = /^https?:\/\/[^/\s]+$/i.test(env) ? env : appOrigin(req);
  return base + '/api/google-cal-callback';
}

export default async function handler(req, res) {
  if (!dbEnabled()) { res.status(200).json({ ok: false, reason: 'nodb' }); return; }
  const q = sql();
  const providerId = await requireLogin(req, res, q);
  if (!providerId) return;
  try {
    await ensureGoogleTable();

    if (req.method === 'GET') {
      const conn = await getGoogleConnection(providerId);
      let authUrl = '';
      if (googleConfigured()) {
        // The state is a SHORT-LIVED SIGNED TOKEN carrying the provider id, not the id itself —
        // otherwise anyone could hand the callback a state naming another account and have that
        // account's calendar connected to their Google login.
        const st = signToken({ u: providerId, k: 'gcal' }, process.env.SESSION_SECRET || '', 600);
        const p = new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || '',
          redirect_uri: redirectUri(req),
          response_type: 'code',
          scope: GOOGLE_SCOPE,
          access_type: 'offline',
          include_granted_scopes: 'true',
          prompt: 'consent',            // without this a re-connect returns no refresh token
          state: st
        });
        authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
      }
      res.status(200).json({
        ok: true, configured: googleConfigured(), connected: !!conn,
        lastOk: (conn && Number(conn.last_ok)) || 0,
        needsReconnect: !!(conn && conn.last_error),
        lastError: (conn && conn.last_error) || '',
        authUrl,
        // The exact string that must be registered in the Google console. Surfaced so the
        // self-check can print it rather than anyone having to guess which host to use.
        redirectUri: redirectUri(req)
      });
      return;
    }

    if (req.method === 'POST') {
      const appts = (req.body && req.body.appts) || [];
      if (!Array.isArray(appts)) { res.status(400).json({ error: 'appts must be a list' }); return; }
      const conn = await getGoogleConnection(providerId);
      if (!conn) { res.status(200).json({ ok: false, reason: 'notconnected' }); return; }
      try {
        const r = await syncApptsToGoogle(providerId, appts.slice(0, 500));
        res.status(200).json({ ok: true, ...r });
      } catch (e) {
        if (e && e.code === 'reconnect') { res.status(200).json({ ok: false, reason: 'reconnect' }); return; }
        throw e;
      }
      return;
    }

    if (req.method === 'DELETE') {
      await deleteGoogleConnection(providerId);
      res.status(200).json({ ok: true, connected: false });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[google-cal] failed:', e && e.stack || e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
