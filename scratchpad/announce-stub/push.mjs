export const pushConfigured = () => true;
export async function sendPush(s, p) { globalThis.__sent.push(['web', s.endpoint, p]); return s.endpoint === 'e3' ? { ok: false, gone: true } : { ok: true }; }
