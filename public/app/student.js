const root=document.querySelector("#feedback");
const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=String(value??"");return node;};
async function load(){
  const token=location.pathname.split("/").pop();
  try{
    const response=await fetch(`/api/student/${encodeURIComponent(token)}`,{headers:{accept:"application/json"}});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Feedback is unavailable.");
    root.replaceChildren();
    const card=document.createElement("section");card.className="feedback-card";
    card.append(text("h2",`Feedback for ${data.name}`));
    const table=document.createElement("table");table.className="feedback-scores";table.setAttribute("aria-label","Scores by criterion");
    const head=document.createElement("thead"),headRow=document.createElement("tr");
    for(const label of ["Criterion","Score","Feedback"])headRow.append(text("th",label));head.append(headRow);table.append(head);
    const body=document.createElement("tbody"), criteria=Array.isArray(data.rubric?.criteria)?data.rubric.criteria:[];
    for(const criterion of criteria){const score=data.scores?.[criterion.id]||{};const row=document.createElement("tr");row.append(text("th",criterion.name||criterion.id),text("td",`${score.score??"—"} / ${criterion.max??"—"}`),text("td",score.reason||""));body.append(row);}
    table.append(body);card.append(table,text("h2","Overall feedback"),text("p",data.feedback));
    if(data.comments?.length){card.append(text("h2","Line comments"));const list=document.createElement("ul");for(const comment of data.comments)list.append(text("li",`${comment.file}:${comment.from}${comment.to!==comment.from?`–${comment.to}`:""} — ${comment.text}`));card.append(list);}
    root.append(card);
  }catch(error){const message=text("p",error.message);message.className="feedback-status";message.setAttribute("role","alert");root.replaceChildren(message);}
}
load();
