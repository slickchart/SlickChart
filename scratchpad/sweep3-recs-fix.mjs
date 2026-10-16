// Proposed fix for the sweep3 workspace-only-save family, injected by the sweep3-recs-* repros when
// SWEEP3_FIX=1. persistWorkspace() also writes the three dedicated per-client keys that _reloadAll()
// reads AFTER sc_workspace, and the client-file "in office" toggle saves the product itself.
export const FIX = process.env.SWEEP3_FIX ? `
(function(){
  var _pw=persistWorkspace;
  persistWorkspace=function(){ _pw.apply(this,arguments);
    try{persistClientRecs();}catch(e){} try{persistRecReasons();}catch(e){} try{persistClientHomecare();}catch(e){} };
  toggleProdInOffice=function(id,aid){const a=affiliateLinks.find(x=>x.id===aid);if(a){a.inOffice=!a.inOffice;a._ts=Date.now();try{persistAffiliateLinks();}catch(e){}}_rerenderRecs(id);};
})();` : undefined;
