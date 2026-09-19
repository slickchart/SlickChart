#!/usr/bin/env node
// CLAUDE.md §0.6: a synced key that ACCUMULATES data must merge on pull, never plain-overwrite.
// Cloud.pull() overwrites by default, so a stale device can wipe newer data from another one.
//
// Keys that already merge (sc_clients, sc_forms, sc_courses, sc_resources, sc_msgstore, …) are
// found automatically from the dispatch in pull(). This check's job is to stop a NEW accumulating
// list quietly joining the plain-overwrite path. It does not fail on the ones already known and
// recorded below — those are SESSION-HANDOFF thread 16 — only on ones nobody has decided about.
const fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','slickchart.html'),'utf8');

// Keys the pull explicitly handles (merge, tombstone union, sticky-true, stamped, special-cased).
const merged=new Set();
const _a=s.indexOf('const setFromServer=');
// pushAllLocal() is referenced earlier in the file too, so search forward from setFromServer.
const _b=s.indexOf('pushAllLocal()',_a);
if(_a<0||_b<0){console.error('check-merge-coverage: could not locate Cloud.pull() dispatch');process.exit(2);}
const pull=s.slice(_a,_b);
[...pull.matchAll(/k\s*===\s*['"](sc_[a-z0-9_]+)['"]/g)].forEach(m=>merged.add(m[1]));
// Keys that never leave the device are not this check's business.
const skip=new RegExp("const _SYNC_SKIP=\\{([^}]*)\\}").exec(s);
if(skip)[...skip[1].matchAll(/(sc_[a-z0-9_]+)\s*:/g)].forEach(x=>merged.add(x[1]));
const pre=/const _SYNC_SKIP_PREFIX=\[([^\]]*)\]/.exec(s);
const skipPrefixes=pre?[...pre[1].matchAll(/['"]([^'"]+)['"]/g)].map(x=>x[1]):[];
['_TOMB_OBJ','_TOMB_ARR','_STICKY_TRUE'].forEach(n=>{
  const m=new RegExp('const '+n+'=\\{([^}]*)\\}').exec(s);
  if(m)[...m[1].matchAll(/(sc_[a-z0-9_]+)\s*:/g)].forEach(x=>merged.add(x[1]));
});

// Synced keys whose stored value is JSON — i.e. a list or a record that accumulates. Two writer
// shapes exist in this file: a direct setItem(k, JSON.stringify(x)), and the wrapped
// (function(_v){ localStorage.setItem(k,_v); _pushKeyNow(k,_v); })(JSON.stringify(x)) form. Scan by
// line so neither shape is missed — a key this check does not SEE is a key it cannot protect.
const accum=new Set();
s.split('\n').forEach(function(line){
  if(line.indexOf('JSON.stringify(')<0)return;
  [...line.matchAll(/setItem\(\s*['"](sc_[a-z0-9_]+)['"]/g)].forEach(m=>accum.add(m[1]));
  [...line.matchAll(/_pushKeyNow\(\s*['"](sc_[a-z0-9_]+)['"]/g)].forEach(m=>accum.add(m[1]));
});

// Already known and accepted as riding the plain overwrite. Each one is real work (a per-item merge
// needs a delete record too, or a union would resurrect deleted rows) and is tracked as thread 16.
// DO NOT add to this list to silence the check — that is the whole point of it.
const KNOWN=new Set(['sc_inventory','sc_vendors','sc_bundles','sc_protocols','sc_staff','sc_docs',
  'sc_autos','sc_body_maps','sc_summary_drafts','sc_client_homecare','sc_client_recs','sc_rec_reasons',
  'sc_custom_note_templates','sc_needle_presets','sc_checkins','sc_session_summaries','sc_routines',
  'sc_shop_bundles','sc_affiliate_links','sc_workspace','sc_notif_settings','sc_amazon_assoc',
  'sc_healing_stage','sc_note_fmt','sc_suggested_forms','sc_square_catalog','sc_payments',
  'sc_provider_note_drafts','sc_deleted_clients','sc_shop_catalog','sc_affiliate_custom','sc_partners',
  // Reviewed and correct as plain-overwrite — ONE record for the account, so last-write-wins is
  // the right behaviour and a merge would add risk without adding safety:
  'sc_captured_photos',      // the crash-safety copy that lives OUTSIDE IndexedDB (CLAUDE.md §3)
  'sc_calendar_feed',        // one feed token, not a list
  'sc_booking_page',         // one booking-page config
  'sc_checkin_cfg',          // one pre-visit check-in config
  'sc_deposit_handled',      // one deposit setting
  'sc_login_email',          // one email
  'sc_professions',          // one selection
  'sc_service_menu',         // one menu (sc_service_menu_custom is the sticky flag that guards it)
  'sc_summary_guide_optout', // one flag set
  'sc_totp_enabled',         // one flag
  'sc_wsname',               // one workspace name
  'sc_room_state_',          // per-room device state, not synced provider data
  // Reviewed and ACCUMULATING — these can lose data if a stale device pulls. Tracked as thread 16.
  // sc_manual_appts is the sharpest of them: a manually-added appointment is a real booking.
  'sc_manual_appts','sc_note_drafts','sc_photo_index','sc_pro_vc_invites','sc_sent_routines',
  'sc_summary_guides','sc_imported_products','sc_deleted_sq']);

const unreviewed=[...accum].filter(k=>!merged.has(k)&&!KNOWN.has(k)
  &&!skipPrefixes.some(p=>k.indexOf(p)===0)).sort();
const stillOpen=[...accum].filter(k=>!merged.has(k)&&KNOWN.has(k)).sort();

if(unreviewed.length){
  console.error('check-merge-coverage: NEW synced key(s) that accumulate data but plain-overwrite on pull.');
  console.error('A stale device can wipe newer data from another one (CLAUDE.md §0.6).\n');
  unreviewed.forEach(k=>console.error('  '+k));
  console.error('\nGive each a merge in Cloud.pull(), or record the decision in KNOWN with a reason.');
  process.exit(1);
}
console.log('merge-coverage: clean ('+merged.size+' keys merge on pull; '+stillOpen.length+' known unmerged, tracked as thread 16)');
