// sweep2: _mergeThreads / _mergeMsgStore union by client id with no delete record, so a removed
// client's conversation comes back from any device that still holds it. The thread list hides it
// (no CL entry) but the unread COUNT does not — a Messages badge that can never be cleared — and the
// removed client's messages sit on the account again.
import { makeServer, launch, device, flush, check, report, sleep } from './sweep-dup-xdevice-lib.mjs';
const srv = makeServer({
  sc_clients: JSON.stringify({ c9: { id: 'c9', name: 'Gone Client', _uAt: Date.now() - 1e5 }, c1: { id: 'c1', name: 'Kept', _uAt: Date.now() - 1e5 } }),
  sc_threads: JSON.stringify([{ id: 'c9', preview: 'hi', unread: true }]),
  sc_msgstore: JSON.stringify({ c9: [{ from: 'client', text: 'hi', ts: Date.now() - 1e5, _mid: 'm1' }] }),
}, { c9: { id: 'c9', name: 'Gone Client' }, c1: { id: 'c1', name: 'Kept' } });
// FIX=1: both merges drop a client that was REMOVED (not merged into another chart).
const FIX_JS = `(function(){
  const skip=function(){const g=_goneClientIds();return function(id){return !!g[id]&&!_mergeTargetOf(id,g);};};
  const oT=_mergeThreads,oM=_mergeMsgStore;
  window._mergeThreads=function(s,l){const r=oT(s,l);if(!r||r.str==null)return r;const sk=skip();const a=JSON.parse(r.str).filter(function(t){return !(t&&sk(t.id));});const str=JSON.stringify(a);
    let sv=[];try{sv=JSON.parse(s||'[]').filter(function(t){return !(t&&sk(t.id));});}catch(e){}return {str:str,changed:str!==JSON.stringify(sv)};};
  window._mergeMsgStore=function(s,l){const r=oM(s,l);if(!r||r.str==null)return r;const sk=skip();const o=JSON.parse(r.str);Object.keys(o).forEach(function(id){if(sk(id))delete o[id];});
    let sv={};try{sv=JSON.parse(s||'{}')||{};}catch(e){}const drop=Object.keys(sv).some(sk);return {str:JSON.stringify(o),changed:r.changed||drop};};
})();`;
const P = process.env.FIX ? FIX_JS : null;
const b = await launch();
const phone = await device(b, srv, 'phone', null, P);
const compSeed = await phone.evaluate(() => ({ sc_threads: _lsGet('sc_threads'), sc_msgstore: _lsGet('sc_msgstore') }));
// remove the client the way the delete flow does, then save messages
await phone.evaluate(() => { _cleanupClientData('c9'); delete CL['c9']; _markClientDeleted('c9'); saveClients(); saveMessages(); });
await flush(phone);
check('account: thread gone after delete', !/c9/.test(srv.kv.sc_threads || ''), srv.kv.sc_threads);
const comp = await device(b, srv, 'computer', compSeed, P);
await flush(comp); await sleep(500);
check('account: thread still gone after the computer launches', !/c9/.test(srv.kv.sc_threads || ''), srv.kv.sc_threads);
check('account: removed client\'s messages still gone', !/c9/.test(srv.kv.sc_msgstore || ''), srv.kv.sc_msgstore);
const phone2 = await device(b, srv, 'phone-relaunch', await phone.evaluate(() => ({ sc_threads: _lsGet('sc_threads'), sc_msgstore: _lsGet('sc_msgstore') })), P);
const n = await phone2.evaluate(() => threads.filter(t => t.unread).length);
check('phone: no unread badge for a removed client', n === 0, n);
await b.close();
process.exit(report() ? 1 : 0);
