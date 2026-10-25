/* CSV and feedback exports. Spreadsheet-formula safe. */
(function(root){
  "use strict";
  const R=root.TG_rubric||require("./rubric.js");
  function cell(value){let s=value===null||value===undefined?"":String(value);if(typeof value==="string"&&/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function csvColumns(rubric,preset="generic"){
    return preset==="moodle"
      ?[{key:"studentId",label:"Identifier"},{key:"name",label:"Full name"},{key:"total",label:"Grade"},{key:"max",label:"Maximum grade"},{key:"feedback",label:"Feedback comments"}]
      :[{key:"name",label:"Student"},...rubric.criteria.map(c=>({key:`criterion:${c.id}`,label:`${c.name} (/${c.max})`})),{key:"total",label:"Total"},{key:"max",label:"Out of"},{key:"percent",label:"Percent"},{key:"feedback",label:"Feedback"}];
  }
  function valuesFor(rubric,row){const total=R.totalScore(rubric,row.scores||{}),max=R.totalMax(rubric);return {name:row.name,studentId:row.studentId,total,max,percent:max?Math.round(total/max*1000)/10:0,feedback:row.feedback,...Object.fromEntries(rubric.criteria.map(c=>[`criterion:${c.id}`,row.scores?.[c.id]?.score??""]))};}
  function toCSV(rubric,rows,{columns,preset="generic"}={}){
    const available=csvColumns(rubric,preset),selected=Array.isArray(columns)?columns:available.map(x=>x.key),lookup=new Map(available.map(x=>[x.key,x]));
    const cols=selected.map(key=>lookup.get(key)).filter(Boolean),lines=[cols.map(x=>cell(x.label)).join(",")];
    rows.forEach(row=>{const values=valuesFor(rubric,row);lines.push(cols.map(col=>cell(values[col.key])).join(","));});
    return lines.join("\r\n")+"\r\n";
  }
  function feedbackBundle(rubric,rows){const bar="=".repeat(60);return rows.map(row=>`${bar}\n${row.name}\n${bar}\n${row.feedback||"(no feedback written)"}\n`).join("\n");}
  function safeBaseName(name){return String(name||"student").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_").replace(/[. ]+$/g,"").slice(0,100)||"student";}
  function feedbackZipFiles(rubric,rows){
    const used=new Set(),entries=[];
    for(const row of rows){const base=safeBaseName(row.name),key=base.toLowerCase();let unique=base,n=2;while(used.has(unique.toLowerCase()))unique=`${base}-${n++}`;used.add(unique.toLowerCase());const scores=rubric.criteria.map(c=>`- ${c.name}: ${row.scores?.[c.id]?.score??"—"}/${c.max}`).join("\n"),total=R.totalScore(rubric,row.scores||{}),max=R.totalMax(rubric),feedback=row.feedback||"(no feedback written)";
      const markdown=`# Feedback for ${row.name}\n\n**Score:** ${total}/${max}${max?` (${Math.round(total/max*100)}%)`:""}\n\n## Score breakdown\n${scores||"- No criteria"}\n\n## Feedback\n${feedback}\n`;
      const plain=`Feedback for ${row.name}\nScore: ${total}/${max}\n\nScore breakdown\n${scores.replace(/^- /gm,"")}\n\nFeedback\n${feedback}\n`;
      entries.push({path:`${unique}.md`,text:markdown},{path:`${unique}.txt`,text:plain});
    }
    return entries;
  }
  const api={cell,toCSV,csvColumns,valuesFor,feedbackBundle,feedbackZipFiles,safeBaseName};
  root.TG_export=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
