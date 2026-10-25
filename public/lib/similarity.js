(function(root){
  "use strict";
  const T=root.TG_tokenizer;
  function hash(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function fingerprints(code,k=5,w=4){
    const tokens=T.tokenize(code);if(tokens.length<k)return [];
    const grams=[];for(let i=0;i<=tokens.length-k;i++){const text=tokens.slice(i,i+k).map(x=>x.value).join(" ");grams.push({hash:hash(text),line:tokens[i].line});}
    const out=[],seen=new Set();for(let i=0;i<=grams.length-w;i++){let best=i;for(let j=i+1;j<i+w;j++)if(grams[j].hash<=grams[best].hash)best=j;const item=grams[best],key=`${item.hash}:${item.line}`;if(!seen.has(key)){seen.add(key);out.push(item);}}
    return out;
  }
  function mergeLines(lines){const sorted=[...new Set(lines)].sort((a,b)=>a-b),out=[];for(const line of sorted){const last=out[out.length-1];if(last&&line-last[1]<=3)last[1]=line;else out.push([line,line]);}return out;}
  function sourceText(submission){const files=submission.files?.length?submission.files:[{text:submission.code||""}];return files.slice().sort((a,b)=>(a.path||"").localeCompare(b.path||"")).map(file=>file.text||"").join("\nFILE\n");}
  function byHash(code,excluded){const result=new Map();for(const fp of fingerprints(code)){if(excluded.has(fp.hash))continue;if(!result.has(fp.hash))result.set(fp.hash,new Set());result.get(fp.hash).add(fp.line);}return result;}
  function compare(submissions,{threshold=.6,minFingerprints=20,starterCode="",limit=100}={}){
    const excluded=new Set(fingerprints(starterCode).map(x=>x.hash));
    const items=(submissions||[]).map(s=>({id:s.id,name:s.name,hashes:byHash(sourceText(s),excluded)}));
    const inverted=new Map();items.forEach((item,index)=>item.hashes.forEach((_,fingerprint)=>{if(!inverted.has(fingerprint))inverted.set(fingerprint,[]);inverted.get(fingerprint).push(index);}));
    const candidates=new Map();inverted.forEach((indices,fingerprint)=>{for(let i=0;i<indices.length;i++)for(let j=i+1;j<indices.length;j++){const a=indices[i],b=indices[j],key=`${a}:${b}`;if(!candidates.has(key))candidates.set(key,{a,b,shared:[]});candidates.get(key).shared.push(fingerprint);}});
    const pairs=[];for(const candidate of candidates.values()){
      const A=items[candidate.a],B=items[candidate.b];if(A.hashes.size<minFingerprints||B.hashes.size<minFingerprints)continue;
      const containment=candidate.shared.length/Math.min(A.hashes.size,B.hashes.size),jaccard=candidate.shared.length/(A.hashes.size+B.hashes.size-candidate.shared.length);if(containment<threshold)continue;
      const lineMatches=new Set();candidate.shared.forEach(fingerprint=>{const a=[...A.hashes.get(fingerprint)].sort((x,y)=>x-y),b=[...B.hashes.get(fingerprint)].sort((x,y)=>x-y),n=Math.max(a.length,b.length);for(let i=0;i<n;i++)lineMatches.add(`${a[i%a.length]}:${b[i%b.length]}`);});
      const matches=[...lineMatches].map(value=>{const [lineA,lineB]=value.split(":").map(Number);return {lineA,lineB};}).sort((x,y)=>x.lineA-y.lineA||x.lineB-y.lineB);
      pairs.push({a:A.id,b:B.id,nameA:A.name,nameB:B.name,shared:candidate.shared.length,containment,jaccard,linesA:mergeLines(matches.map(x=>x.lineA)),linesB:mergeLines(matches.map(x=>x.lineB)),matches});
    }
    pairs.sort((a,b)=>b.containment-a.containment||b.jaccard-a.jaccard||String(a.nameA).localeCompare(String(b.nameA)));
    const visible=pairs.slice(0,Math.max(0,Math.min(100,Number(limit)||100)));
    Object.defineProperty(visible,"totalPairs",{value:pairs.length,enumerable:false});
    return visible;
  }
  const api={hash,fingerprints,compare,mergeLines};root.TG_similarity=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
