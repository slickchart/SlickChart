#!/usr/bin/env node
// CLAUDE.md §0.1 — every data read/write is scoped to the AUTHENTICATED caller.
//
// A shared Square token once let one provider's operations land in another provider's directory.
// The rule that prevents a repeat is mechanical: identity comes from the verified session token
// (providerFromReq / verifyToken / isSessionValid), never from a provider_id / owner / email / id
// in the request body or query string — those are attacker-controlled.
//
// This flags two shapes:
//   A. an owner-ish identity read straight out of req.body / req.query, and
//   B. a SQL statement against a per-provider table with no owner/provider column in its WHERE.
//
// A finding is not automatically a bug — some endpoints legitimately take an id that is then
// checked against the token. Each one needs a human decision, recorded in ALLOW below WITH a reason.
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','api');

// Reviewed and safe. Key is "<file>:<why>".
const ALLOW={
  // Public, unauthenticated by design; scoped by a slug/token that IS the credential.
  'book.js':'public booking page, scoped by slug',
  'client-page.js':'serves the client PWA shell, no provider data',
  'client-link.js':'passwordless: generic response, never reveals whether an email exists',
  'client-code.js':'passwordless: same',
  'build-id.js':'returns the build string only',
  'cloud-status.js':'returns whether sync is enabled',
  // Owner-only tools. Both verify the session token, check the session is still valid, and gate on
  // FOUNDER_EMAILS using the TOKEN'S email. The email in the request is the subject being looked
  // up, never the authorizer — which is exactly what §0.5 requires. Re-read them if either changes.
  'admin/kv-health.js':'founder-gated via the verified token email; query email is the lookup subject',
  'admin/provider-lookup.js':'founder-gated via the verified token email; email is the lookup subject',
  // Passwordless reset: the email IS the input by nature. Non-enumerable — always 200, rate-limited
  // per email, and a request for an unknown address behaves identically to a known one (§0.4).
  'request-reset.js':'passwordless reset; always returns 200 and is rate-limited, so it reveals nothing',
};
const PER_PROVIDER=/\b(from|into|update|delete\s+from)\s+(clients|kv|client_events|square_connections|providers|course_versions)\b/i;
const OWNERISH=/req\.(body|query)\s*\.\s*(provider_?id|owner|email|uid|user_?id|account)\b|(?:const|let|var)\s*\{[^}]*\b(provider_?id|owner)\b[^}]*\}\s*=\s*req\.(body|query)/;

const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
  const f=path.join(d,e.name);
  if(e.isDirectory())walk(f); else if(e.name.endsWith('.js'))files.push(f);
}})(ROOT);

const findings=[];
for(const f of files){
  const rel=path.relative(ROOT,f);
  if(ALLOW[rel]||ALLOW[path.basename(f)])continue;
  const src=fs.readFileSync(f,'utf8');
  const lines=src.split('\n');
  lines.forEach((ln,i)=>{
    if(ln.trim().startsWith('//')||ln.trim().startsWith('*'))return;
    if(OWNERISH.test(ln))findings.push({rel,line:i+1,kind:'identity from the request',text:ln.trim().slice(0,110)});
  });
  // SQL against a per-provider table with no owner column anywhere in the statement.
  const sqlRe=/(?:sql|query)\s*`([^`]*)`/gs;let m;
  while((m=sqlRe.exec(src))){
    const q=m[1];
    if(!PER_PROVIDER.test(q))continue;
    if(/\b(owner|provider_id|provider)\b/i.test(q))continue;
    if(/create\s+table|alter\s+table|information_schema/i.test(q))continue;
    const line=src.slice(0,m.index).split('\n').length;
    findings.push({rel,line,kind:'SQL with no owner in it',text:q.replace(/\s+/g,' ').trim().slice(0,110)});
  }
}
if(findings.length){
  console.error('check-tenant-isolation: '+findings.length+' place(s) need a look (CLAUDE.md §0.1).\n');
  findings.forEach(x=>console.error('  '+x.rel+':'+x.line+'  ['+x.kind+']\n      '+x.text));
  console.error('\nEach is either a real leak or a reviewed exception — fix it, or add the file to ALLOW with a reason.');
  process.exit(1);
}
console.log('tenant-isolation: clean ('+files.length+' endpoint files, '+Object.keys(ALLOW).length+' reviewed exceptions)');
