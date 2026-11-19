// Like stub-neon-loader.mjs, plus empty stand-ins for other packages not installed here (web-push,
// firebase, etc.), so an api/ handler can be imported to test its gate.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
const STUB = 'data:text/javascript,' + encodeURIComponent('const f=()=>f;f.setVapidDetails=()=>{};export default f;export const neon=()=>async()=>[];export const neonConfig={};export const setVapidDetails=()=>{};export const sendNotification=async()=>{};');
export async function resolve(s, c, n) { if (!s.startsWith('.') && !s.startsWith('node:') && !s.startsWith('data:') && !s.startsWith('/') && !s.startsWith('file:')) { try { return await n(s, c); } catch (e) { return { url: STUB, shortCircuit: true }; } } return n(s, c); }
`));
