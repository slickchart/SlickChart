import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const {chromium}=pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

async function run(label, cfg){
  const p=await b.newPage({viewport:{width:390,height:844}});
  await p.goto('http://localhost:8899/slickchart-provider-demo.html',{waitUntil:'load'});
  await p.waitForTimeout(3500);
  const r=await p.evaluate(async (cfg)=>{
    const calls=[]; const toasts=[]; const modals=[];
    // Top-level function declarations are overridable window props (CLAUDE.md §2).
    window._sqFetch=async function(path,opts){
      calls.push({path,body:(opts&&opts.body)||null});
      if(path==='/api/square/booking-options'){
        if(cfg.optsThrow) throw new Error('Square is not connected yet.');
        return {services:cfg.services,teamMembers:cfg.teamMembers};
      }
      if(path==='/api/square/book'){
        if(cfg.bookThrow) throw new Error('That time is no longer available.');
        return {ok:true};
      }
      return {};
    };
    window._apptsLive=function(){return !!cfg.live;};
    window._loadSquareAppts=async function(){
      if(cfg.squareHasIt){
        // squareAppts starts as null when Square has never loaded, so ASSIGN rather than mutate.
        squareAppts=[{at:new Date('2026-11-05T10:00:00.000Z'),client:'Callie Hernandez',tx:'Signature Facial',dur:60}];
      }
    };
    window.proToast=function(t){toasts.push(String(t));};
    window.confirmModal=function(o){modals.push(((o&&o.title)||'')+': '+((o&&o.body)||''));};
    window._notifyBookingClient=function(){};
    window.pushBookingNotif=function(){};
    window.renderRequests=function(){};
    window._manualOverlap=function(){return null;};
    window._pushKeyNow=function(){};
    window._gcalPushSoon=function(){};
    const req={id:'bktest1',clientId:'',client:'Callie Hernandez',providerId:'p',
      treatment:'Signature Facial',date:'2026-11-05',dateLabel:'Thursday, November 5',
      time:'10:00 AM',note:'',status:'pending',created:Date.now()};
    // SlickBridge is a const binding like CL/Cloud: mutate it in place, do not reassign (CLAUDE.md §2).
    SlickBridge.getBookings=function(){return [req];};
    SlickBridge.setBookings=function(){};
    SlickBridge.post=function(){};
    manualAppts.length=0; confirmedAppts.length=0;

    confirmBooking('bktest1');
    await new Promise(r=>setTimeout(r,700));

    const booked=calls.filter(c=>c.path==='/api/square/book');
    return {
      squareBookCalls:booked.length,
      bookBody:booked[0]?booked[0].body:null,
      manualAppts:manualAppts.length,
      manualEntry:manualAppts[0]?{client:manualAppts[0].client,tx:manualAppts[0].tx,date:manualAppts[0].date,time:manualAppts[0].time}:null,
      confirmedAppts:confirmedAppts.length,
      toasts, modals,
      landedInSquare: (booked.length>0 && !cfg.bookThrow) || (!!cfg.squareHasIt && booked.length>0)
    };
  }, cfg);
  await p.close();
  return {label, ...r};
}

const SERVICES=[{variationId:'VAR1',variationVersion:7,name:'Signature Facial',durationMinutes:60,teamMemberIds:['TM1']},
                {variationId:'VAR2',variationVersion:3,name:'Dermaplane',durationMinutes:45,teamMemberIds:['TM1']}];
const TEAM=[{id:'TM1',name:'Ashley'}];

const cases=[
  ['A. Square live, service matches',     {live:true, services:SERVICES, teamMembers:TEAM}],
  ['B. Square live, NO matching service', {live:true, services:[{variationId:'V9',variationVersion:1,name:'Lash Lift',durationMinutes:60,teamMemberIds:['TM1']}], teamMembers:TEAM}],
  ['C. Square live, book call fails',     {live:true, services:SERVICES, teamMembers:TEAM, bookThrow:true}],
  ['D. Square NOT connected',             {live:false, services:[], teamMembers:[]}],
  ['E. Call errors but Square DID book it',{live:true, services:SERVICES, teamMembers:TEAM, bookThrow:true, squareHasIt:true}],
];
let bad=0;
for(const [label,cfg] of cases){
  const r=await run(label,cfg);
  console.log('\n'+r.label);
  console.log('  POST /api/square/book  :', r.squareBookCalls);
  console.log('  manualAppts added      :', r.manualAppts, r.manualEntry?JSON.stringify(r.manualEntry):'');
  console.log('  confirmedAppts         :', r.confirmedAppts);
  if(r.bookBody)console.log('  body                   :', JSON.stringify({svc:r.bookBody.serviceVariationId,ver:r.bookBody.serviceVariationVersion,dur:r.bookBody.durationMinutes,start:r.bookBody.startAt,tm:r.bookBody.teamMemberId,notify:r.bookBody.notify,idem:r.bookBody.idempotencyKey}));
  if(r.toasts.length)console.log('  toast                  :', r.toasts.join(' | '));
  if(r.modals.length)console.log('  told her               :', r.modals.join(' | '));
  const both = r.landedInSquare && r.manualAppts>0;
  if(both)bad++;
  console.log('  Square ended up with it:', r.landedInSquare?'yes':'no');
  console.log('  double-sent to Google? :', both?'*** YES - BUG ***':'no');
  const reachedSomething = r.squareBookCalls>0 || r.manualAppts>0;
  if(!reachedSomething)bad++;
  console.log('  left the app?          :', reachedSomething?'yes':'*** NO - BUG ***');
}
console.log('\n'+(bad?('FAILURES: '+bad):'all four paths behaved'));
await b.close();
