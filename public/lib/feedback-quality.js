(function(root){"use strict";
const harsh=new Set("idiot stupid useless lazy hopeless pathetic terrible incompetent careless ridiculous embarrassing worthless garbage awful dumb moron failure shameful clueless atrocious horrible unacceptable disappointing foolish nonsensical disastrous inept".split(" "));
function analyze(text,others=[]){
  text=String(text||"");const findings=[],add=(id,severity,message,penalty,fix)=>findings.push({id,severity,message,penalty,fix});
  const words=text.trim().split(/\s+/).filter(Boolean);
  if(words.length<25)add("short","warning","Feedback is very short.",25);
  if(!/\b(try|consider|add|use|next time|you could|should|improve|work on|focus on|practice)\b/i.test(text))add("no-next-step","warning","Add a specific next step.",20);
  [...harsh].filter(w=>new RegExp(`\\b${w}\\b`,"i").test(text)).slice(0,3).forEach(w=>add("harsh-words","warning",`Consider replacing “${w}” with specific, neutral feedback.`,15,()=>text.replace(new RegExp(`\\b${w}\\b`,`gi`),"needs work")));
  if(!/(?:^|[.!?]\s*)[^.!?]*(?:well|good|clear|effective|strong|correct|nice|thoughtful)/i.test(text))add("all-negative","info","Include something the student did well.",10);
  if((text.match(/\b[A-Z]{4,}\b/g)||[]).length>=3)add("shouting","warning","Several words are all caps.",10,()=>text.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g,(_,a,b)=>a+b.toUpperCase()));
  if((text.match(/!/g)||[]).length>3)add("exclamations","info","Reduce exclamation marks.",5,()=>{let n=0;return text.replace(/!/g,()=>++n<=3?"!":"");});
  if(/\b(minus|deduct|points off)\b/i.test(text))add("arithmetic","info","Remove grading arithmetic from student feedback.",10,()=>text.replace(/\b(?:minus|deduct(?:ed)?|\d+(?:\.\d+)? points? off)\b[^.,;]*/gi,""));
  if(/\b(TODO|TBD|\?{3,}|\{name\})\b/i.test(text))add("placeholder","warning","Feedback contains a placeholder.",20);
  if(others.some(n=>n&&n.length>2&&text.toLowerCase().includes(n.toLowerCase())))add("other-student","warning","Feedback mentions another student.",30);
  if(!/^\s*Score\s*:/im.test(text))add("no-score","info","Add the score for clarity.",5,()=>`${text.trim()}\n\nScore: (add score)`);
  const score=Math.max(0,100-findings.reduce((sum,item)=>sum+item.penalty,0));
  return {score,label:score>=80?"Good":score>=60?"Okay":"Needs work",findings};
}
function applyEasyFixes(text){let value=String(text||"");for(let i=0;i<20;i++){const fix=analyze(value).findings.find(item=>item.fix);if(!fix)break;const next=fix.fix();if(next===value)break;value=next;}return value;}
const api={analyze,check:analyze,applyEasyFixes};root.TG_feedbackQuality=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
