// ?cancel_contacts=1 on the health sweep stays owner-only (2026-11-19).
//   node --import ./scratchpad/stub-neon-loader.mjs scratchpad/test-cancel-contacts-gate.mjs
process.env.DATABASE_URL = 'postgres://x'; process.env.SESSION_SECRET = 's';
const { default: h } = await import('../slickchart-vercel/api/admin/health-sweep.js');
let out = []; const mk = () => { const r = { headers: {}, setHeader() {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; out.push(r); return r; } }; return r; };
const r1 = mk(); await h({ method: 'GET', headers: {}, query: { cancel_contacts: '1' } }, r1);
const r2 = mk(); await h({ method: 'GET', headers: { authorization: 'Monitor wrong' }, query: { cancel_contacts: '1' } }, r2);
const r3 = mk(); await h({ method: 'GET', headers: { authorization: 'Bearer forged' }, query: { cancel_contacts: '1' } }, r3);
const ok = [r1, r2, r3].every(r => r.code === 403 && !(r.body && r.body.contacts));
console.log((ok ? 'PASS' : 'FAIL') + ' no key, a wrong key and a forged session all get 403 with no contacts', [r1.code, r2.code, r3.code]);
process.exit(ok ? 0 : 1);
