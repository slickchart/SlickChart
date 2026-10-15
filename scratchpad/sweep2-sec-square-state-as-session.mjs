// sweep2-sec: the Square OAuth `state` minted by api/square/connect.js is signToken({u, p:'sq'}) with the
// SESSION secret and NO `k` scope claim. lib/auth.verifyToken only rejects tokens that carry `k`, so the
// state (which travels in URLs: Square's authorize page, the callback query string, history, logs) is a
// full 10-minute provider session. store.js's isSessionValid(undefined sid) returns true.
const A = await import('/home/user/SlickChart/slickchart-vercel/lib/auth.js');
const secret = 'sess';
const state = A.signToken({ u: 'p_victim', p: 'sq' }, secret, 600);          // exactly what connect.js mints
const asSession = A.verifyToken(state, secret);                               // what store.js / clients.js / sqContext call
const gcal = A.signToken({ u: 'p_victim', k: 'gcal' }, secret, 600);          // the Google state, for contrast
console.log('square state accepted as a session token ->', JSON.stringify(asSession));
console.log('google state accepted as a session token ->', JSON.stringify(A.verifyToken(gcal, secret)));
const sidless = await A.isSessionValid(null, asSession && asSession.sid);
console.log('isSessionValid(sid=undefined) ->', sidless);
console.log(asSession && asSession.u && sidless ? 'CONFIRMED-BUG: the Square OAuth state is a usable 10-minute session for every provider endpoint' : 'SOUND');
