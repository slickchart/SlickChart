export const calls = globalThis.__sqlCalls = [];
export function neon() {
  return async (strings, ...vals) => {
    const text = strings.join('?').replace(/\s+/g, ' ');
    calls.push({ text, vals });
    const h = globalThis.__sqlHandler;
    return (h && h(text, vals)) || [];
  };
}
