// Wires a generated collection (PM_ / NA_) into slickchart.html exactly the way the Hair Stylist
// Collection is wired (CLAUDE.md §1e). Idempotent guard: refuses if the collection is already in.
//   node scratchpad/wire-collection.cjs <pm|na>
const fs=require('fs');
const key=process.argv[2];
const C={
  pm:{P:'PM',sec:'pmcoll',prof:'pmu',title:'The PMU Collection',who:'PMU artists',
      data:'/home/user/SlickChart/scratchpad/pm/pm-data.js',docs:process.env.DOCS_JSON,pages:45,date:'2026-10-19',
      defs:require('/home/user/SlickChart/scratchpad/pm/pm-defs.cjs')},
  na:{P:'NA',sec:'nacoll',prof:'nail',title:'The Nail Artist Collection',who:'nail techs',
      data:'/home/user/SlickChart/scratchpad/na/na-data.js',docs:process.env.DOCS_JSON,pages:37,date:'2026-10-19',
      defs:(()=>{try{return require('/home/user/SlickChart/scratchpad/na/na-defs.cjs');}catch(e){return null;}})()},
}[key];
if(!C)throw new Error('pm or na');
const FILE='/home/user/SlickChart/slickchart-vercel/slickchart.html';
let s=fs.readFileSync(FILE,'utf8');
if(s.includes('const '+C.P+'_FORMS='))throw new Error('already wired');
const D=new Function(fs.readFileSync(C.data,'utf8')+';return {F:'+C.P+'_FORMS,G:'+C.P+'_GUIDES};')();
const docs=JSON.parse(fs.readFileSync(C.docs,'utf8'));
const once=(a,b)=>{const i=s.indexOf(a);if(i<0||s.indexOf(a,i+1)>=0)throw new Error('anchor not unique: '+a.slice(0,80));s=s.replace(a,b);};
// 1. the section
const defLines=C.defs.map(d=>`    {icon:'${d[0]}',bg:'${d[1]}',ic:'${d[2]}',name:${JSON.stringify(d[3]).replace(/^"|"$/g,"'")},sub:${JSON.stringify(d[4]).replace(/^"|"$/g,"'")},id:'${d[5]}'},`).join('\n');
C.defs.forEach(d=>{if(!D.F[d[5]])throw new Error('def without form '+d[5]);if(D.F[d[5]].name!==d[3])throw new Error('name mismatch '+d[5]);});
Object.keys(D.F).forEach(k=>{if(!C.defs.some(d=>d[5]===k))throw new Error('form without def '+k);});
once("const _FORM_DEFS_BY_PROF={\n",`const _FORM_DEFS_BY_PROF={\n  // Ashley's ${C.title.replace(/^The /,'')} (${C.date}): its own section, shown to ${C.who}.\n  ${C.sec}:['${C.title}',[\n${defLines}\n  ]],\n`);
// 2. who sees it
once("  if(hasAny(['hair']))list.push('hscoll');\n",`  if(hasAny(['hair']))list.push('hscoll');\n  if(hasAny(['${C.prof}']))list.push('${C.sec}');\n`);
// 3. the forms, bundled
const formsBlock=`// ${C.title} (Ashley, ${C.date}): same rules as the other collections (CLAUDE.md §1e).\n// Bundled, so nothing is stored on an account unless she edits one.\nconst ${C.P}_FORMS={\n`+
  Object.keys(D.F).map(k=>' '+JSON.stringify(k)+':'+JSON.stringify(D.F[k])).join(',\n')+`\n};\nObject.keys(${C.P}_FORMS).forEach(function(k){ if(!formTmpls[k])formTmpls[k]=${C.P}_FORMS[k]; });\n`;
once("Object.keys(HS_FORMS).forEach(function(k){ if(!formTmpls[k])formTmpls[k]=HS_FORMS[k]; });\n","Object.keys(HS_FORMS).forEach(function(k){ if(!formTmpls[k])formTmpls[k]=HS_FORMS[k]; });\n"+formsBlock);
// 4. the guides, added (never replacing) to her profession's guides
const g=D.G.map(x=>'  '+JSON.stringify({id:x.id,icon:x.icon,title:x.title,cat:x.cat,url:'',shared:0,profs:x.profs,tips:x.tips})).join(',\n');
once("(function(){\n  const add=(prof,list)=>",`// ${C.title}'s client guides. \`profs\` says which professions get each one.\nconst ${C.P}_GUIDES=[\n${g}\n];\n(function(){\n  const add=(prof,list)=>`);
once("  add('hair',HS_GUIDES);\n",`  add('hair',HS_GUIDES);\n  add('${C.prof}',${C.P}_GUIDES);\n`);
// 5. the Library
const hsDocsLine=s.match(/\nconst HS_PRINT_DOCS=\[.*\];\n/)[0];
once(hsDocsLine,hsDocsLine+`const ${C.P}_PRINT_DOCS=${JSON.stringify(docs).replace(/","/g,'", "').replace(/",(\d)/g,'", $1').replace(/\],\[/g,'], [')};\n`);
s=s.replace(/(\{key:'[a-z]+',section:'[a-z]+coll',name:'[^']+',docs:[A-Z]+_PRINT_DOCS,pages:\d+\})\];\n/,(m,a)=>`${a},\n             {key:'${key}',section:'${C.sec}',name:'${C.title}',docs:${C.P}_PRINT_DOCS,pages:${C.pages}}];\n`);
if(!s.includes(`{key:'${key}',section:'${C.sec}'`))throw new Error('_plCollections not updated');
s=s.replace(/(function _plDoc\(id\)\{for\(const c of \[[A-Z_,]+)\]/,(m,a)=>`${a},${C.P}_PRINT_DOCS]`);
if(!s.includes(`${C.P}_PRINT_DOCS]){const d=`))throw new Error('_plDoc not updated');
fs.writeFileSync(FILE,s);
fs.mkdirSync('/tmp/claude-0/-home-user-SlickChart/be0fe3b4-54df-5d41-bda7-89dbec145231/scratchpad/seo',{recursive:true});
fs.writeFileSync(`/tmp/claude-0/-home-user-SlickChart/be0fe3b4-54df-5d41-bda7-89dbec145231/scratchpad/seo/${key}.json`,JSON.stringify({F:D.F,G:D.G.map(x=>({id:x.id,icon:x.icon,title:x.title,cat:x.cat,url:'',shared:0,profs:x.profs,tips:x.tips})),P:docs},null,1));
console.log('wired',key,Object.keys(D.F).length,'forms',D.G.length,'guides',docs.length,'docs');
