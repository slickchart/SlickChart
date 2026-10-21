const stubs = {
  '@neondatabase/serverless': new URL('./neon-stub.mjs', import.meta.url).href,
  'web-push': new URL('./webpush-stub.mjs', import.meta.url).href,
};
export async function resolve(spec, ctx, next) {
  if (stubs[spec]) return { url: stubs[spec], shortCircuit: true };
  return next(spec, ctx);
}
