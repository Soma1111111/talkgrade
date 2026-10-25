(function(root){
  "use strict";
  const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  function redacted(value){return String(value||"").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[EMAIL]").replace(/\b(?:student|learner|user)[ _-]?(?:id|number)\s*[:=#]\s*["']?[A-Z0-9_-]{3,}["']?/gi,"[ID]");}
  function prepare(student,students,privacy){
    const names=[...new Set([student.name,...students.map(s=>s.name)].map(x=>String(x||"").trim()).filter(Boolean))];
    const labels=names.map((name,index)=>({name,label:`S${index+1}`}));
    const protect=value=>{let text=privacy.stripIdentifiers?redacted(value):String(value||"");if(privacy.anonymise)for(const item of [...labels].sort((a,b)=>b.name.length-a.name.length))text=text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escape(item.name)}(?![\\p{L}\\p{N}_])`,"giu"),item.label);return text;};
    return {labels,payload:{student:privacy.anonymise?protect(student.name):student.name,code:privacy.sendCode?protect(student.code):"",notes:protect(student.notes)}};
  }
  function restore(result,labels){if(!result||!labels?.length)return result;const text=value=>{let out=String(value||"");for(const item of labels)out=out.replace(new RegExp(`\\b${item.label}\\b`,"g"),item.name);return out;};return {...result,feedback:text(result.feedback),scores:Object.fromEntries(Object.entries(result.scores||{}).map(([id,score])=>[id,score&&typeof score==="object"?{...score,reason:text(score.reason)}:score]))};}
  root.TG_privacyFlow={prepare,restore};
})(globalThis);
