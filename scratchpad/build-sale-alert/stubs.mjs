export const sent=[];export const pushes=[];let notified={};
export function dbEnabled(){return true;} export async function ensureTable(){} export async function ensureBuildPurchasesTable(){}
export function sql(){return async (strings,...v)=>{const q=strings.join('?');
  if(/^UPDATE build_purchases SET notified_at/.test(q.trim())){const sid=v[0];if(notified[sid])return [];notified[sid]=1;return [{stripe_session_id:sid}];}
  if(/count\(\*\)/.test(q))return [{n:3,cents:29100}];return [];};}
export async function sendEmail(m){sent.push(m);} export function trustedOrigin(){return 'https://slickchart.app';} export async function addToAudience(){}
export function nativePushConfigured(){return true;} export async function pushFoundersReport(p){pushes.push(p);return {devices:1,sent:1,providerIds:['p1']};}
export async function recordNotify(){}
