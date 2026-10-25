(function(root){"use strict";
function newId(prefix="id"){let s="";if(root.crypto&&root.crypto.getRandomValues){const b=new Uint8Array(12);root.crypto.getRandomValues(b);s=Array.from(b,x=>(x%36).toString(36)).join("");}else s=Math.random().toString(36).slice(2,14).padEnd(12,"0");return `${prefix}_${s}`;}
function slug(value,used=[]){let base=String(value||"criterion").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24)||"criterion",id=base,n=2,set=new Set(used);while(set.has(id))id=`${base}-${n++}`;return id;}
const api={newId,slug};root.TG_ids=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
