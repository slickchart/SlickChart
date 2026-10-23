export const sent = globalThis.__sent = [];
export const nativePushConfigured = () => true;
export const tokenShape = t => t.includes(':') ? 'fcm' : 'apns';
export async function sendFcm(t, p) { sent.push(['fcm', t, p]); return t.includes('dead') ? { ok: false, gone: true } : { ok: true }; }
