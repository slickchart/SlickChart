const map = { './db.js': 'db', './fcm.js': 'fcm', './apns.js': 'apns', './push.js': 'push' };
export async function resolve(spec, ctx, next) {
  if (map[spec] && /announce-push\.js$/.test(ctx.parentURL || '')) return { url: new URL('./' + map[spec] + '.mjs', import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
