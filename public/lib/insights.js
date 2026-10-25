"use strict";
(function(root){
  "use strict";

  function redact(text,names=[]){
    let value=String(text||"");
    for(const name of names.filter(Boolean).sort((a,b)=>b.length-a.length)){
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      value=value.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,"giu"),"a student");
    }
    return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"an email address")
      .replace(/\b(?:student|learner|user)[ _-]?(?:id|number)\s*[:=#]?\s*[A-Z0-9_-]{3,}\b/gi,"an identifier")
      .replace(/\b[A-Z]?\d{5,}\b/g,"an identifier").slice(0,180);
  }

  function aggregate(submissions,rubric,graderId="me"){
    const scoreMap=s=>graderId==="me"?(s.gradings?.me?.scores||s.scores||{}):(s.gradings?.[graderId]?.scores||{});
    const graded=submissions.filter(s=>Object.values(scoreMap(s)).some(x=>Number.isFinite(x?.score)));
    const names=submissions.map(s=>s.name).filter(Boolean),criteria=rubric.criteria.map(c=>{
      let lost=0,loss=0,total=0,scored=0;
      graded.forEach(s=>{
        const x=scoreMap(s)[c.id];
        if(!Number.isFinite(x?.score))return;
        scored++;total+=x.score;
        const deduction=Math.max(0,c.max-x.score);
        if(deduction>0)lost++;
        loss+=deduction;
      });
      return {criterionId:c.id,name:c.name,scoredCount:scored,lostRate:scored?lost/scored:0,avgLoss:scored?loss/scored:0,avgScorePct:scored&&c.max?total/scored/c.max:0};
    });

    const issues=new Map();
    graded.forEach(s=>{
      const seen=new Set();
      Object.entries(scoreMap(s)).forEach(([id,x])=>{
        const criterion=rubric.criteria.find(c=>c.id===id);
        if(!criterion||!x||x.inferred||!Number.isFinite(x.score)||x.score>=criterion.max||!Array.isArray(x.tags))return;
        x.tags.forEach(tag=>{
          if(typeof tag!=="string"||!tag.trim())return;
          const key=id+"|"+tag;
          if(seen.has(key))return;
          seen.add(key);
          const value=issues.get(key)||{criterionId:id,tag,count:0,loss:0,studentIds:[],example:""};
          value.count++;value.loss+=Math.max(0,criterion.max-x.score);value.studentIds.push(s.id);
          if(!value.example&&x.reason)value.example=redact(x.reason,names);
          issues.set(key,value);
        });
      });
    });

    const recurring=[...issues.values()].map(x=>({...x,pct:graded.length?x.count/graded.length:0,avgLoss:x.count?x.loss/x.count:0}))
      .sort((a,b)=>(b.count*b.avgLoss)-(a.count*a.avgLoss));
    const classTotal=graded.reduce((sum,s)=>sum+rubric.criteria.reduce((n,c)=>n+(Number.isFinite(scoreMap(s)[c.id]?.score)?scoreMap(s)[c.id].score:0),0),0);
    return {gradedCount:graded.length,classAverage:classTotal/Math.max(1,graded.length),criteria,issues:recurring};
  }

  function buildDigest(data){
    const top=data.issues.slice(0,5),best=[...data.criteria].sort((a,b)=>b.avgScorePct-a.avgScorePct).slice(0,3);
    return `# Class misconception digest\n\n${data.gradedCount} submissions graded. Class average: ${Number(data.classAverage||0).toFixed(1)} points.\n\n## What most students lost points on\n${top.length?top.map(x=>`- **${x.tag}** (${x.count}, ${Math.round(x.pct*100)}%; average loss ${x.avgLoss.toFixed(1)} points): ${x.example||"Review this concept"}`).join("\n"):"- No recurring deductions yet."}\n\n## What went well\n${best.map(x=>`- ${x.name}: ${Math.round(x.avgScorePct*100)}% average`).join("\n")||"- No graded criteria yet."}\n\n## Suggested focus for the next session\nRevisit the most common issue with a short worked example, then give students a chance to apply it.`;
  }

  const api={aggregate,buildDigest,analyze:aggregate,redact};
  root.TG_insights=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
