(function(root){
  "use strict";
  const BIN_COUNT=10,WINDOW=5,MIN_FATIGUE_GRADED=9;
  function median(values){const a=values.slice().sort((x,y)=>x-y);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:0;}
  function histogram(values,max){return Array.from({length:BIN_COUNT},(_,i)=>{const from=max*i/BIN_COUNT,to=max*(i+1)/BIN_COUNT;return {from,to,count:values.filter(v=>v>=from&&(i===BIN_COUNT-1?v<=to:v<to)).length};});}
  function average(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;}
  function wordCount(text){return String(text||"").trim().split(/\s+/).filter(Boolean).length;}
  function summarize(items,rubric){
    const criteria=Array.isArray(rubric?.criteria)?rubric.criteria:[];
    const graded=items.filter(x=>x.scores&&criteria.some(c=>Number.isFinite(x.scores?.[c.id]?.score)))
      .slice().sort((a,b)=>(Number(a.scoredAt)||0)-(Number(b.scoredAt)||0));
    const max=criteria.reduce((n,c)=>n+(Number(c.max)||0),0);
    const entries=graded.map(s=>({id:s.id,name:s.name||s.id||"Submission",scoredAt:Number(s.scoredAt)||0,total:criteria.reduce((n,c)=>n+(Number.isFinite(s.scores?.[c.id]?.score)?s.scores[c.id].score:0),0),notesWords:wordCount(s.notes),activeMs:Math.max(0,Number(s.activeMs)||0)}));
    const totals=entries.map(x=>x.total);
    const trend=entries.map((x,i)=>({id:x.id,name:x.name,scoredAt:x.scoredAt,value:x.total,average:average(totals.slice(Math.max(0,i-WINDOW+1),i+1))}));
    const totalHistogram=histogram(totals,max);
    const criterionHistograms=criteria.map(c=>{
      const values=graded.map(s=>s.scores?.[c.id]?.score).filter(Number.isFinite);
      return {criterionId:c.id,name:c.name,max:c.max,scored:values.length,bins:histogram(values,c.max)};
    });
    const activeTimes=entries.map(x=>x.activeMs),third=Math.floor(graded.length/3);
    let fatigue=[];
    if(graded.length>=MIN_FATIGUE_GRADED&&third>0){
      const first=entries.slice(0,third),last=entries.slice(-third);
      const firstPct=average(first.map(x=>max?x.total/max*100:0)),lastPct=average(last.map(x=>max?x.total/max*100:0)),shift=lastPct-firstPct;
      if(Math.abs(shift)>=8)fatigue.push({kind:"score-shift",firstPct,lastPct,change:shift,message:`Average total score changed by ${shift>0?"+":""}${shift.toFixed(1)} percentage points between the first and last thirds of grading.`});
      const firstWords=average(first.map(x=>x.notesWords)),lastWords=average(last.map(x=>x.notesWords));
      if(firstWords>0&&lastWords<firstWords*.6)fatigue.push({kind:"shorter-notes",firstWords,lastWords,ratio:lastWords/firstWords,message:`Average note length changed from ${firstWords.toFixed(1)} words in the first third to ${lastWords.toFixed(1)} in the last third.`});
    }
    return {
      graded:graded.length,total:items.length,completion:items.length?graded.length/items.length:0,max,
      totalHistogram,criterionHistograms,histogram:totalHistogram,totals,trend,
      medianMs:median(activeTimes),slowestMs:Math.max(0,...activeTimes),
      fatigue,firstThirdCount:third,lastThirdCount:third
    };
  }
  const api={summarize,median,histogram,BIN_COUNT,WINDOW,MIN_FATIGUE_GRADED};
  root.TG_dashboardStats=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
