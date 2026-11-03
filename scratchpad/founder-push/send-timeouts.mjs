// 2026-11-03: cron runs that normally take 2-4s sometimes never finished (cron-provider-reminders,
// cron-automations). Outgoing calls had no time limit, so one service that never answered held the
// run open until the platform stopped it. Every outgoing send is now time-bounded, and a timeout on
// a phone send is a plain error, never "gone" (a slow Google must not delete a good phone address).
import { register } from 'node:module';
import crypto from 'crypto';
register('./hooks.mjs', import.meta.url);
const APP = new URL('../../slickchart-vercel/', import.meta.url).pathname;
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(process.env, { DATABASE_URL: 'postgres://x', RESEND_API_KEY: 'k', VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'q',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@p.iam', project_id: 'proj', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
// Every bound asked for is recorded, then shortened to 50ms so the test is fast.
const asked = []; const realTimeout = AbortSignal.timeout.bind(AbortSignal);
AbortSignal.timeout = ms => { asked.push(ms); return realTimeout(50); };
// A service that never answers, unless the request is aborted.
const hang = (init) => new Promise((_, rej) => { if (init && init.signal) init.signal.addEventListener('abort', () => rej(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))); });
let tokenOk = true;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('oauth2') && tokenOk) return { ok: true, status: 200, json: async () => ({ access_token: 'at', expires_in: 3600 }), text: async () => '' };
  return hang(init);
};
const t0 = Date.now();
const { sendFcm } = await import(APP + 'lib/fcm.js');
const r = await Promise.race([sendFcm('abc:APA91b-x', { title: 'Hi' }), new Promise(z => setTimeout(() => z('HUNG'), 3000))]);
ok(r !== 'HUNG', 'a phone send to a Google that never answers ends instead of hanging the run');
ok(r && r.ok === false && !r.gone, 'that timeout is a plain error, never "gone" (the phone address is kept): ' + JSON.stringify(r));
ok(asked.includes(8000), 'the phone send asks for an 8s bound: ' + JSON.stringify(asked));
const { sendEmail } = await import(APP + 'lib/email.js');
const e = await Promise.race([sendEmail({ to: 'a@b.c', subject: 's', text: 't' }).then(() => 'sent', err => 'threw: ' + err.name), new Promise(z => setTimeout(() => z('HUNG'), 3000))]);
ok(/^threw/.test(e), 'an email to a mail service that never answers ends (and throws to its caller, which catches it): ' + e);
const { sendPush } = await import(APP + 'lib/push.js');
globalThis.__webSends = [];
const wp = (await import('web-push')).default; let gotOpts = null; const orig = wp.sendNotification;
wp.sendNotification = async (s, b, o) => { gotOpts = o; };
await sendPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'a', auth: 'b' } }, { title: 'x' });
ok(gotOpts && gotOpts.timeout === 8000, 'a web push with no timeout given gets the 8s default: ' + JSON.stringify(gotOpts));
await sendPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'a', auth: 'b' } }, { title: 'x' }, { timeout: 4000 });
ok(gotOpts && gotOpts.timeout === 4000, 'a caller\'s own timeout still wins (founder alerts use 4s)');
wp.sendNotification = orig;
console.log(Date.now() - t0 < 5000 ? '' : 'slow');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
