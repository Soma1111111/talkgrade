(function(root){
  "use strict";
  function record(log,event,limit=5000,onWarning){
    const previous=Array.isArray(log)?log:[],next=[...previous,{...event,ts:event.ts||new Date().toISOString()}];
    if(next.length>limit){const removed=next.length-limit;onWarning?.({type:"audit-limit",removed,limit,message:`Activity history reached ${limit} events; the oldest ${removed} event(s) were dropped.`});return next.slice(removed);}
    return next;
  }
  const api={record};root.TG_audit=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
