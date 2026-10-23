export const calls = globalThis.__calls = [];
export function sql() { return (strs, ...vals) => { const t = strs.join('?'); calls.push({ t, vals });
  if (/FROM native_push_tokens/.test(t)) return Promise.resolve([{ token: 'a'.repeat(64) }, { token: 'proj:fcm1' }, { token: 'proj:dead' }]);
  if (/FROM provider_push_subscriptions/.test(t)) return Promise.resolve([{ id: 'w1', endpoint: 'e1', sub: '{"endpoint":"e1"}' }, { id: 'w2', endpoint: 'e1', sub: '{"endpoint":"e1"}' }, { id: 'w3', endpoint: 'e3', sub: '{"endpoint":"e3"}' }]);
  return Promise.resolve([]); }; }
