// node --import ./scratchpad/stub-neon-loader.mjs <test>: lets a test import lib/ files that import
// @neondatabase/serverless (not installed here). The stub is never called by those tests.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === '@neondatabase/serverless') return { url: 'data:text/javascript,export function neon(){return async()=>[]};export function neonConfig(){}', shortCircuit: true }; return n(s, c); }
`));
