(function () {
  "use strict";

  const R = window.TG_rubric;
  const F = window.TG_facts;
  const H = window.TG_heuristic;
  const C = window.TG_consistency;
  const X = window.TG_export;
  const K = window.TG_commands;
  const RI = window.TG_rubricImport;
  const CM = window.TG_courses;
  const TL = window.TG_templates;
  const SI = window.TG_submissions;
  const FQ = window.TG_feedbackQuality;

  const $ = (sel) => document.querySelector(sel);
  const KEY = "talkgrade-state-v1";
  const MAX_FILES = 200;
  const MAX_CODE = 60000;

  /* ---------- tiny DOM helper (always textContent, never innerHTML) ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    kids.flat().forEach((kid) => {
      if (kid === null || kid === undefined || kid === false) return;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
    return el;
  }

  /* ---------- state ---------- */
  let state = load() || { rubric: null, students: [], currentId: null, dismissed: [], tone: "warm" };
  state.privacy = { ...window.TG_settings.defaults.privacy, ...(state.privacy || {}) };
  state.rubricLibrary = state.rubricLibrary || [];
  state.similarityReviews = Array.isArray(state.similarityReviews) ? state.similarityReviews : [];
  let indexedStore = null;
  let stateRevision = 0;
  let flags = [];
  let checked = false;
  let busy = false;
  let toastTimer = null;
  const scoreHistory = new Map();
  let translationCandidate=null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s || !Array.isArray(s.students)) return null;
      if (!Array.isArray(s.assignments)) { const id = `assignment-${Date.now().toString(36)}`; s.assignmentId = id; s.assignmentTitle = "Imported assignment"; s.courseName = "My course"; s.assignments = [{id,title:s.assignmentTitle,course:s.courseName,rubric:s.rubric,students:s.students,dismissed:s.dismissed||[],starterCode:"",tone:s.tone||"warm"}]; }
      if (!Array.isArray(s.courses)) s.courses = [];
      s.assignments.forEach(a => {
        if (!a.courseId) { let c=s.courses.find(x=>x.name===(a.course||"My course")); if(!c){c={id:`course-${Math.random().toString(36).slice(2,10)}`,name:a.course||"My course",archived:false};s.courses.push(c);} a.courseId=c.id; }
        a.settings=a.settings||{consistency:{tolerance:.25,driftTolerance:.3,minPeers:2}};
        a.auditLog=Array.isArray(a.auditLog)?a.auditLog:[];
        a.similarityReviews=Array.isArray(a.similarityReviews)?a.similarityReviews:[];
      });
      const active=s.assignments.find(a=>a.id===s.assignmentId); if(active){s.courseId=active.courseId;s.assignmentTitle=active.title;s.courseName=s.courses.find(c=>c.id===active.courseId)?.name||"My course";s.dueDate=active.dueDate||null;s.starterCode=active.starterCode||"";s.assignmentArchived=Boolean(active.archived);s.assignmentSettings=active.settings;s.auditLog=active.auditLog;s.similarityReviews=active.similarityReviews;}
      return s;
    } catch (_) { return null; }
  }
  function initializeTheme(){
    let saved="";try{saved=localStorage.getItem("talkgrade-theme")||"";}catch(_){}
    const mode=saved||((window.matchMedia?.("(prefers-color-scheme: dark)").matches)?"dark":"light");
    const setTheme=value=>{document.documentElement.dataset.theme=value;const button=$("#theme-toggle");if(button){button.textContent=value==="dark"?"Light theme":"Dark theme";button.setAttribute("aria-label",`Switch to ${value==="dark"?"light":"dark"} theme`);}};
    setTheme(mode);$("#theme-toggle")?.addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";try{localStorage.setItem("talkgrade-theme",next);}catch(_){}setTheme(next);});
  }
  function animateWelcomeOnce(){
    const title=$("#welcome-title");if(!title||$("#welcome").hidden)return;
    let seen=false;try{seen=sessionStorage.getItem("talkgrade-welcome-typed")==="1";}catch(_){}
    if(seen||window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return;
    try{sessionStorage.setItem("talkgrade-welcome-typed","1");}catch(_){}
    const full=title.textContent;title.setAttribute("aria-label",full);title.textContent="";
    let index=0;const timer=window.setInterval(()=>{index=Math.min(full.length,index+2);title.textContent=full.slice(0,index);if(index>=full.length)window.clearInterval(timer);},18);
  }
  function save() {
    try {
      stateRevision++;
      state.storageUpdatedAt = Date.now();
      state=CM.snapshot(state);
      localStorage.setItem(KEY, JSON.stringify(state)); renderAssignments();
    } catch (_) { /* storage may be blocked; the app still works */ }
    if(indexedStore){const assignments=state.assignments||[],submissions=assignments.flatMap(a=>(a.students||[]).map(s=>({...s,assignmentId:a.id}))),events=assignments.flatMap(a=>(a.auditLog||[]).map((e,i)=>({...e,id:e.id||`${a.id}-event-${i}`,assignmentId:a.id})));Promise.all([indexedStore.put("state",{id:"current",value:state,updatedAt:state.storageUpdatedAt}),indexedStore.replaceAll("courses",state.courses||[]),indexedStore.replaceAll("assignments",assignments),indexedStore.replaceAll("submissions",submissions),indexedStore.replaceAll("rubrics",state.rubricLibrary||[]),indexedStore.replaceAll("events",events)]).catch(()=>showStorageStatus("IndexedDB could not save this change. A local browser copy is still available."));}
  }
  async function initializeIndexedDB(){
    const notice=$("#storage-status");
    try{
      const store=await window.TG_store.open();indexedStore=store;
      const revision=stateRevision,row=await store.get("state","current"),localTime=Number(state.storageUpdatedAt)||0;
      if(revision===stateRevision&&row?.value&&Number(row.updatedAt)>localTime){state=row.value;state.privacy={...window.TG_settings.defaults.privacy,...(state.privacy||{})};state.rubricLibrary=state.rubricLibrary||[];state.similarityReviews=state.similarityReviews||[];renderAll();}
      save();
      if(!store.persistent)showStorageStatus("IndexedDB is unavailable. TalkGrade is using the browser's local storage fallback.");
      else if(!row)showStorageStatus("Your existing browser data was migrated into IndexedDB.",4500);
    }catch(_){showStorageStatus("IndexedDB could not open. TalkGrade is using the browser's local storage fallback.");}
  }
  function showStorageStatus(message,timeout=0){const notice=$("#storage-status");notice.textContent=message;notice.hidden=false;if(timeout)window.setTimeout(()=>{notice.hidden=true;},timeout);}
  function renderAssignments(){const select=$("#assignment-switch");if(!select)return;const courses=state.courses||[];const cs=$("#course-switch");cs.replaceChildren();courses.forEach(c=>cs.append(h("option",{value:c.id,selected:c.id===state.courseId},`${c.name}${c.archived?" (archived)":""}`)));select.replaceChildren();(state.assignments||[]).filter(a=>!state.courseId||a.courseId===state.courseId).forEach(a=>select.append(h("option",{value:a.id,selected:a.id===state.assignmentId},`${a.title}${a.archived?" (archived)":""}${a.dueDate?` · due ${a.dueDate}`:""}`)));}
  function switchAssignment(id){const next=CM.switchAssignment(state,id);if(next.assignmentId===state.assignmentId&&id!==state.assignmentId)return;state=next;flags=[];checked=false;save();renderAll();}
  const current = () => state.students.find((s) => s.id === state.currentId) || null;
  const graded = () => state.students.filter((s) => s.scores);
  let activeTracking={studentId:null,checkpoint:null,lastActivity:null};
  const noteAuditBaseline=new Map(),feedbackAuditBaseline=new Map();
  function logAudit(type,summary,st=null,before=null,after=null,extra={}){
    state.auditLog=window.TG_audit.record(state.auditLog,{type,summary,assignmentId:state.assignmentId||null,submissionId:st?.id||null,actor:"you",before,after,...extra},5000,warning=>showStorageStatus(warning.message,7000));
    save();
  }
  function scoreSnapshot(scores){return Object.fromEntries(Object.entries(scores||{}).map(([id,value])=>[id,{score:value?.score,manual:Boolean(value?.manual),inferred:Boolean(value?.inferred)}]));}
  function rubricSnapshot(rubric){return rubric?{title:rubric.title,criterionCount:rubric.criteria?.length||0,criteria:(rubric.criteria||[]).map(c=>c.id)}:null;}
  function flushTextAudit(st,field){
    if(!st)return;const isNotes=field==="notes",value=String(st[field]||""),baselines=isNotes?noteAuditBaseline:feedbackAuditBaseline,previous=baselines.get(st.id);
    if(previous===undefined){baselines.set(st.id,value);return;}
    if(previous===value)return;
    logAudit(isNotes?"notes-edited":"feedback-edited",`${isNotes?"Notes":"Feedback"} edited`,st,{characters:previous.length},{characters:value.length});baselines.set(st.id,value);
  }
  function dashboardTimerEligible(){return Boolean(current()&&!$("#workspace").hidden&&document.visibilityState==="visible"&&document.hasFocus());}
  function syncActiveTime(persist=false){
    const now=Date.now(),oldId=activeTracking.studentId,oldCheckpoint=activeTracking.checkpoint,lastActivity=activeTracking.lastActivity;
    if(oldId&&oldCheckpoint!==null){
      const student=state.students.find(s=>s.id===oldId),creditEnd=Math.min(now,(lastActivity||oldCheckpoint)+180000),elapsed=Math.max(0,creditEnd-oldCheckpoint);
      if(student&&elapsed){student.activeMs=(Number(student.activeMs)||0)+elapsed;if(persist)save();}
    }
    const student=current();
    activeTracking=dashboardTimerEligible()?{studentId:student.id,checkpoint:now,lastActivity:now}: {studentId:null,checkpoint:null,lastActivity:null};
  }
  function noteDashboardActivity(){if(dashboardTimerEligible()){syncActiveTime(false);activeTracking.lastActivity=Date.now();}}
  window.setInterval(()=>syncActiveTime(true),30000);
  document.addEventListener("visibilitychange",()=>syncActiveTime(true));
  window.addEventListener("focus",()=>syncActiveTime(true));
  window.addEventListener("blur",()=>syncActiveTime(true));
  document.addEventListener("pointerdown",noteDashboardActivity,true);
  document.addEventListener("keydown",noteDashboardActivity,true);
  document.addEventListener("input",noteDashboardActivity,true);
  window.addEventListener("pagehide",()=>syncActiveTime(true));

  function say(message) {
    const status = $("#status");
    status.textContent = "";
    window.setTimeout(() => { status.textContent = message; }, 20);
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3500);
  }

  /* ---------- rendering ---------- */
  function renderStudents() {
    const list = $("#student-list");
    list.replaceChildren();
    const max = state.rubric ? R.totalMax(state.rubric) : 0;
    state.students.forEach((s) => {
      const label = s.scores ? `${R.totalScore(state.rubric, s.scores)}/${max}` : "not graded";
      list.append(h("li", {}, h("button", {
        type: "button", class: "student-btn", "aria-current": s.id === state.currentId ? "true" : "false",
        onclick: () => select(s.id)
      }, h("span", {}, s.name), s.studentId?h("small",{class:"muted"},`ID: ${s.studentId}`):null,h("span", { class: "student-score" }, label))));
    });
    $("#progress").textContent = state.students.length ? `${graded().length} of ${state.students.length} graded` : "";
    $("#btn-score-all").hidden = !state.students.some((s) => s.sampleNotes);
  }

  function renderFacts(st) {
    const f = F.extractFacts(st.code);
    const chips = [
      [f.hasTests ? "Has tests" : "No tests found", !f.hasTests],
      [`Comments: ${Math.round(f.commentRatio * 100)}% of lines`, !f.hasComments],
      [f.nestedLoops ? "Nested loops" : "No nested loops", f.nestedLoops],
      [`${f.lineCount} lines`, false]
    ];
    const ul = $("#facts");
    ul.replaceChildren(...chips.map(([text, bad]) => h("li", { class: "chip" + (bad ? " bad" : "") }, text)));
  }

  function renderScores(st) {
    const body = $("#score-body");
    body.replaceChildren();
    state.rubric.criteria.forEach((c) => {
      const s = st.scores && st.scores[c.id];
      const input = h("input", {
        type: "number", min: 0, max: c.max, step: 0.5, value: s ? s.score : "", "aria-label": `${c.name} score out of ${c.max}`,
        disabled: !s, onchange: (e) => setScore(st, c.id, e.target.value)
      });
      const why = s ? [s.reason || "",
        s.inferred ? h("span", { class: "badge" }, "assumed full marks (not mentioned)") : null,
        s.manual ? h("span", { class: "badge" }, "edited by you") : null,
        ...(s.lines||[]).map(ref=>h("button",{type:"button",class:"line-chip",onclick:()=>jumpToEvidence(st,ref)},`${ref.file||"file"}:L${ref.from}${ref.to!==ref.from?`–${ref.to}`:""}${ref.outOfRange?" (out of range)":""}`))] : "";
      const row=h("tr",{tabindex:"0",onmouseenter:()=>highlightEvidence(st,s?.lines||[]),onmouseleave:()=>{st.highlightEvidence=[];renderCodeFile(st);},onfocus:()=>highlightEvidence(st,s?.lines||[]),onfocusout:e=>{if(!e.currentTarget.contains(e.relatedTarget)){st.highlightEvidence=[];renderCodeFile(st);}}},h("th", { scope: "row" }, `${c.name} `, h("span", { class: "muted small" }, `/ ${c.max}`)), h("td", {}, input), h("td", {}, why));
      body.append(row);
    });
    $("#total").textContent = st.scores ? `${R.totalScore(state.rubric, st.scores)} / ${R.totalMax(state.rubric)}` : "–";
  }

  function renderFeedbackQuality(st){
    const text=st?.feedback||"",others=state.students.filter(s=>s.id!==st?.id).map(s=>s.name).filter(Boolean),result=FQ.analyze(text,others),summary=$("#feedback-quality-score"),list=$("#feedback-quality-findings"),button=$("#feedback-quality-fix");
    summary.textContent=`${result.label} · ${result.score}/100`;
    summary.className=`quality-score ${result.label.toLowerCase().replace(/\s+/g,"-")}`;
    list.replaceChildren(...result.findings.map(item=>h("li",{class:`quality-${item.severity}`},`${item.message} (-${item.penalty})${item.fix?" · fix available":""}`)));
    if(!result.findings.length)list.append(h("li",{class:"quality-good"},"No feedback quality issues found."));
    button.disabled=!result.findings.some(item=>item.fix);
    return result;
  }

  function commentsAt(st,file,line){return (st.comments||[]).filter(c=>c.file===file&&line>=c.from&&line<=c.to);}
  function renderCodeFile(st){
    const files=st.files?.length?st.files:[{path:st.filename||"submission",text:st.code||""}],file=files.find(f=>f.path===st.activeFile)||files[0],code=$("#code");code.replaceChildren();if(!file)return;
    String(file.text||"").split("\n").forEach((text,i)=>{const line=i+1,comments=commentsAt(st,file.path,line),highlight=(st.highlightEvidence||[]).some(x=>x.file===file.path&&line>=x.from&&line<=x.to),gutter=h("span",{class:"line-gutter"},h("button",{type:"button",class:"line-number","aria-label":`Add comment on line ${line}`,onclick:()=>openCommentDialog(st,file.path,line)},String(line)),comments.length?h("button",{type:"button",class:"line-marker","aria-label":`View ${comments.length} comments on line ${line}`,onclick:()=>openCommentDialog(st,file.path,line)},`💬 ${comments.length}`):null),row=h("span",{class:`code-line${highlight?" evidence-highlight":""}${comments.length?" has-comment":""}`,id:`code-line-${line}`,"data-line":line},gutter,h("span",{class:"line-text"},text||" "));code.append(row);});
    const all=(st.comments||[]).map((c,index)=>({...c,index})).filter(c=>c.file===file.path),summary=$("#comment-summary-list");summary.replaceChildren(...all.map(c=>h("li",{},h("button",{type:"button",onclick:()=>openCommentDialog(st,file.path,c.from)},`L${c.from}${c.to!==c.from?`–${c.to}`:""}: ${c.text||"Line reference"}`),c.outOfRange?h("span",{class:"badge"},"out of range"):null)));
  }
  function highlightEvidence(st,refs){st.highlightEvidence=(refs||[]).filter(x=>x.file===st.activeFile);renderCodeFile(st);}
  function jumpToEvidence(st,ref){if(ref.file&&st.files?.some(f=>f.path===ref.file)&&st.activeFile!==ref.file){st.activeFile=ref.file;renderWork();}st.highlightEvidence=[ref];renderCodeFile(st);const target=$(`#code-line-${ref.from}`);target?.scrollIntoView({block:"center",behavior:"smooth"});}
  function attachLineEvidence(st){
    const api=window.TG_linerefs,file=st.activeFile||st.files?.[0]?.path||st.filename||"submission",text=st.files?.find(f=>f.path===file)?.text||st.code||"",lineCount=String(text).split("\n").length;
    const noteComments=api.splitNotesIntoComments(st.notes).filter(c=>c.text).map(c=>({...c,file,source:"notes",outOfRange:c.to>lineCount}));
    st.comments=(st.comments||[]).filter(c=>c.source!=="notes"||c.file!==file).concat(noteComments);
    for(const criterion of state.rubric.criteria){const score=st.scores?.[criterion.id];if(!score)continue;const matched=H.splitClauses(st.notes).filter(clause=>criterion.keywords.some(word=>clause.toLowerCase().includes(word.toLowerCase()))),refs=[...api.extractLineRefs(score.reason||""),...matched.flatMap(clause=>api.extractLineRefs(clause))],unique=new Map();refs.forEach(x=>unique.set(`${x.from}-${x.to}`,{from:x.from,to:x.to,file,outOfRange:x.to>lineCount}));score.lines=[...unique.values()];}
  }

  function renderWork() {
    const st = current();
    $("#welcome").hidden = Boolean(state.rubric && state.students.length);
    $("#workspace").hidden = !(state.rubric && state.students.length && st);
    if (!st) return;
    $("#student-name").value = st.name;
    $("#student-id").value = st.studentId || "";
    const files=st.files?.length?st.files:[{path:st.filename||"submission",text:st.code||""}];
    if(!st.activeFile||!files.some(f=>f.path===st.activeFile))st.activeFile=files[0]?.path||"";
    const tabs=$("#file-tabs");tabs.replaceChildren();
    files.forEach((file,index)=>tabs.append(h("button",{type:"button",role:"tab","aria-selected":String(file.path===st.activeFile),tabindex:file.path===st.activeFile?"0":"-1",onclick:()=>{st.activeFile=file.path;renderWork();},onkeydown:e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const next=e.key==="Home"?0:e.key==="End"?files.length-1:(index+(e.key==="ArrowRight"?1:-1)+files.length)%files.length;st.activeFile=files[next].path;renderWork();tabs.querySelector('[aria-selected="true"]')?.focus();}},file.path)));
    $("#student-file").textContent = files.length>1?`${files.length} files`:st.filename||files[0]?.path||"";
    renderCodeFile(st);
    $("#notes").value = st.notes || "";
    $("#feedback").value = st.feedback || "";
    if(!noteAuditBaseline.has(st.id))noteAuditBaseline.set(st.id,String(st.notes||""));
    if(!feedbackAuditBaseline.has(st.id))feedbackAuditBaseline.set(st.id,String(st.feedback||""));
    renderFeedbackQuality(st);
    $("#btn-sample-notes").hidden = !st.sampleNotes;
    $("#tone").value = state.tone;
    renderFacts(st);
    renderScores(st);
  }

  function renderFlags() {
    const box = $("#flags");
    box.replaceChildren();
    const history=$("#flag-history-list");
    if(history) history.replaceChildren(...(state.auditLog||[]).filter(e=>e.type==="consistency-flag").slice().reverse().map(e=>{const detail=(e.changes||[]).map(c=>{const st=state.students.find(s=>s.id===c.studentId),criterion=state.rubric?.criteria.find(x=>x.id===c.criterionId);return `${st?.name||c.studentId} · ${criterion?.name||c.criterionId}: ${c.before} → ${c.after}`;});if(!detail.length)detail.push(...(e.studentIds||[]).map(id=>state.students.find(s=>s.id===id)?.name||id));return h("li",{},h("time",{datetime:e.ts},new Date(e.ts).toLocaleString()),` · ${e.action} · ${labelFor(e.kind)}${detail.length?`: ${detail.join("; ")}`:""}`);}));
    const gradedCount = graded().length;
    if (!checked) { box.append(h("p", { class: "muted" }, "Score a few submissions, then choose “Check consistency”.")); return; }
    if (gradedCount < 2) { box.append(h("p", { class: "muted" }, "Grade at least two submissions to compare them.")); return; }
    if (!flags.length) {
      box.append(h("p", { class: "ok" }, `No inconsistencies found across ${gradedCount} graded submissions. Your marking looks even.`));
      return;
    }
    const groups=new Map();flags.forEach(f=>{if(f.suggestions.length){if(!groups.has(f.kind))groups.set(f.kind,[]);groups.get(f.kind).push(f);}});
    groups.forEach((group,kind)=>box.append(h("button",{type:"button",onclick:()=>applyKind(kind,group)},`Apply all ${group.reduce((n,f)=>n+f.suggestions.length,0)} suggestions: ${labelFor(kind)}`)));
    flags.forEach((f) => {
      const actions = f.suggestions.map((sg) => {
        const st = state.students.find((s) => s.id === sg.studentId);
        const crit = state.rubric.criteria.find((c) => c.id === sg.criterionId);
        return h("button", { type: "button", onclick: () => applySuggestion(sg,f) }, `Set ${st.name}: ${crit.name} to ${sg.score}`);
      });
      const first = state.students.find((s) => s.id === f.studentIds[0]);
      const explanation=Object.entries(C.explain(f)).map(([key,value])=>h("li",{},`${key}: ${typeof value==="object"?JSON.stringify(value):String(value)}`));
      box.append(h("article", { class: `flag ${f.severity}` },
        h("h3", {}, `${f.severity === "high" ? "High" : "Medium"} · ${labelFor(f.kind)}`),
        h("p", {}, f.message),
        h("details",{},h("summary",{},"Why was this flagged?"),h("ul",{},explanation)),
        h("div", { class: "row" }, actions,
          h("button", { type: "button", onclick: () => select(first.id) }, `Open ${first.name}`),
          h("button", { type: "button", onclick: () => dismiss(f.id) }, "Dismiss"))));
    });
  }

  const LABELS = {
    "fact-lenient": "Possibly too lenient", "fact-harsh": "Possibly too harsh", "tag-variance": "Same issue, different penalty",
    "noted-no-deduction": "Problem noted, no deduction", "praise-low-score": "Praise, low score", drift: "Standard drifted"
  };
  const labelFor = (kind) => LABELS[kind] || kind;

  function renderAll() {
    renderAssignments();
    renderStudents();
    renderWork();
    renderFlags();
    $("#tone").value = state.tone;
  }

  /* ---------- actions ---------- */
  function select(id) {
    flushTextAudit(current(),"notes");flushTextAudit(current(),"feedback");
    syncActiveTime(true);
    state.currentId = id;
    save();
    renderStudents();
    renderWork();
    syncActiveTime(false);
    $("#notes").focus();
  }

  function move(delta) {
    const i = state.students.findIndex((s) => s.id === state.currentId);
    const next = state.students[i + delta];
    if (!next) { say(delta > 0 ? "That is the last submission." : "That is the first submission."); return; }
    select(next.id);
    say(`Now grading ${next.name}.`);
  }
  function moveUngraded(delta){const i=state.students.findIndex(s=>s.id===state.currentId);for(let n=i+delta;n>=0&&n<state.students.length;n+=delta)if(!state.students[n].scores){select(state.students[n].id);say(`Now grading ${state.students[n].name}.`);return;}say(delta>0?"No more ungraded submissions ahead.":"No earlier ungraded submissions.");}

  function snapshotEditable(st){return {scores:structuredClone(st.scores||null),comments:structuredClone(st.comments||[])};}
  const historyKey=st=>`${state.assignmentId||"standalone"}:${st.id}`;
  function recordEditableChange(st,before,label){const after=snapshotEditable(st),key=historyKey(st),stack=scoreHistory.get(key)||window.TG_undo.create(50);scoreHistory.set(key,window.TG_undo.push(stack,{label,revert:()=>structuredClone(before),apply:()=>structuredClone(after)}));}
  function restoreEditable(st,value){st.scores=value.scores;st.comments=value.comments;save();if(current()===st){renderWork();renderScores(st);}renderStudents();if(checked)recheck(false);}
  function historyAction(direction){const st=current();if(!st)return;const key=historyKey(st),stack=scoreHistory.get(key)||window.TG_undo.create(50),result=direction==="undo"?window.TG_undo.undo(stack,null):window.TG_undo.redo(stack,null);scoreHistory.set(key,result.stack);if(!result.label){say(`Nothing to ${direction}.`);return;}restoreEditable(st,result.state);logAudit(direction,`${direction==="undo"?"Undid":"Redid"}: ${result.label}`,st);say(`${direction==="undo"?"Undid":"Redid"}: ${result.label}.`);}
  let commentContext=null;
  function openCommentDialog(st,file,line){commentContext={studentId:st.id,file,line};$("#comment-context").textContent=`${st.name} · ${file} · line ${line}`;$("#comment-from").value=line;$("#comment-to").value=line;$("#comment-text").value="";renderCommentList(st,file,line);$("#comment-dialog").showModal();$("#comment-text").focus();}
  function renderCommentList(st,file,line){const list=$("#comment-list"),items=(st.comments||[]).map((c,index)=>({...c,index})).filter(c=>c.file===file&&(!line||(line>=c.from&&line<=c.to)));list.replaceChildren(...items.map(c=>h("li",{},`Lines ${c.from}${c.to!==c.from?`–${c.to}`:""}: ${c.text}${c.source==="notes"?" (from notes)":""}`,c.outOfRange?h("span",{class:"badge"},"out of range"):null,h("button",{type:"button",onclick:()=>{const before=snapshotEditable(st),comment=st.comments[c.index];st.comments.splice(c.index,1);recordEditableChange(st,before,"comment removal");logAudit("comment-removed","Line comment removed",st,{file:comment.file,from:comment.from,to:comment.to,characters:String(comment.text||"").length},null);save();renderCommentList(st,file,line);renderCodeFile(st);}} ,"Remove"))));}
  function addManualComment(){if(!commentContext)return;const st=state.students.find(s=>s.id===commentContext.studentId),from=Number($("#comment-from").value),to=Number($("#comment-to").value),text=$("#comment-text").value.trim();if(!st||!Number.isInteger(from)||from<1||!Number.isInteger(to)||to<from||!text){say("Enter a comment and a valid line range.");return;}const before=snapshotEditable(st),lineCount=String(st.files?.find(f=>f.path===commentContext.file)?.text||st.code||"").split("\n").length;st.comments=st.comments||[];st.comments.push({id:window.TG_ids.newId("comment"),file:commentContext.file,from,to,text,source:"manual",outOfRange:to>lineCount});recordEditableChange(st,before,"comment addition");logAudit("comment-added","Line comment added",st,null,{file:commentContext.file,from,to,characters:text.length});save();renderCommentList(st,commentContext.file,from);renderCodeFile(st);$("#comment-text").value="";say(`Comment added on line${from===to?"":"s"} ${from}${to!==from?`–${to}`:""}.`);}

  function setScore(st, criterionId, value) {
    if (!st.scores) { say("Score this submission first, then edit the numbers."); return; }
    const crit = state.rubric.criteria.find((c) => c.id === criterionId);
    const score = R.clampScore(value, crit.max);
    if (score === null) { renderScores(st); return; }
    const before=snapshotEditable(st),previous=st.scores[criterionId]?.score;st.scores[criterionId] = { ...st.scores[criterionId], score, manual: true, inferred: false };recordEditableChange(st,before,"score edit");logAudit("score-edited",`${crit.name} score edited`,st,{criterionId,score:previous},{criterionId,score});
    save();
    renderScores(st);
    renderStudents();
    if (checked) recheck(false);
  }

  function logFlag(event){logAudit("consistency-flag",`${event.action||"updated"} ${event.kind||"consistency"} flag`,event.studentIds?.length===1?state.students.find(s=>s.id===event.studentIds[0]):null,null,null,event);}
  function applySuggestion(sg,flag) {
    const st = state.students.find((s) => s.id === sg.studentId);
    if(!st||!st.scores)return;
    const before=st.scores[sg.criterionId]?.score;
    setScore(st, sg.criterionId, sg.score);
    const crit = state.rubric.criteria.find((c) => c.id === sg.criterionId);
    logFlag({action:"applied",flagId:flag?.id||null,kind:flag?.kind||"unknown",studentIds:[st.id],changes:[{studentId:st.id,criterionId:sg.criterionId,before,after:sg.score}]});
    say(`${st.name}: ${crit.name} set to ${sg.score}.`);
  }

  function applyKind(kind,group){
    const changesByKey=new Map();group.filter(f=>f.kind===kind).forEach(f=>f.suggestions.forEach(sg=>changesByKey.set(`${sg.studentId}:${sg.criterionId}`,{...sg,flag:f})));
    const plan=[...changesByKey.values()].map(sg=>{const st=state.students.find(s=>s.id===sg.studentId),crit=state.rubric.criteria.find(c=>c.id===sg.criterionId);return st&&crit&&st.scores?{...sg,student:st,criterion:crit,before:st.scores[sg.criterionId]?.score,after:R.clampScore(sg.score,crit.max)}:null;}).filter(x=>x&&x.after!==null&&x.before!==x.after);
    if(!plan.length){say("There are no score changes to apply.");return;}
    const listing=plan.map(x=>`${x.student.name} · ${x.criterion.name}: ${x.before} → ${x.after}`).join("\n");
    if(!window.confirm(`Apply all ${labelFor(kind)} suggestions?\n\n${listing}`))return;
    const byStudent=new Map();plan.forEach(x=>{if(!byStudent.has(x.student.id))byStudent.set(x.student.id,{student:x.student,before:snapshotEditable(x.student)});x.student.scores[x.criterion.id]={...x.student.scores[x.criterion.id],score:x.after,manual:true,inferred:false};});
    byStudent.forEach(({student,before})=>recordEditableChange(student,before,"bulk consistency suggestions"));
    logFlag({action:"applied",flagId:null,kind,studentIds:[...byStudent.keys()],changes:plan.map(x=>({studentId:x.student.id,criterionId:x.criterion.id,before:x.before,after:x.after}))});
    renderStudents();renderWork();if(checked)recheck(false);say(`Applied ${plan.length} ${labelFor(kind).toLowerCase()} suggestion(s).`);
  }

  function dismiss(id) {
    const flag=flags.find(f=>f.id===id);
    if(flag)logFlag({action:"dismissed",flagId:id,kind:flag.kind,studentIds:flag.studentIds.slice(),changes:[]});
    state.dismissed.push(id);
    save();
    recheck(false);
    say("Flag dismissed.");
  }

  function recheck(announce) {
    const entries = graded().map((s) => ({ id: s.id, name: s.name, facts: F.extractFacts(s.code), scores: s.scores }));
    flags = C.check({ rubric: state.rubric, entries, settings: state.assignmentSettings?.consistency || {} }).filter((f) => !state.dismissed.includes(f.id));
    checked = true;
    renderFlags();
    if (announce) {
      say(entries.length < 2 ? "Grade at least two submissions to compare them."
        : flags.length ? `${flags.length} possible inconsistenc${flags.length === 1 ? "y" : "ies"} found.` : "No inconsistencies found.");
      if (entries.length >= 2) $("#flags-h").scrollIntoView({ block: "nearest" });
    }
  }

  async function analyze(st) {
    if (busy || !st) return;
    if (!st.notes.trim()) { say("Say or type your notes first."); $("#notes").focus(); return; }
    const auditBefore={scores:scoreSnapshot(st.scores),feedbackCharacters:String(st.feedback||"").length};
    busy = true;
    const btn = $("#btn-analyze");
    btn.disabled = true;
    let result;
    let note = "";
    try {
      const privateInput = window.TG_privacyFlow.prepare(st, state.students, state.privacy);
      const res = await fetch("api/analyze", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ rubric: state.rubric, submission: privateInput.payload, notes: privateInput.payload.notes, tone: state.tone, privacy: { anonymise: false, sendCode: state.privacy.sendCode, stripIdentifiers: false } })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      result = window.TG_privacyFlow.restore(data, state.privacy.anonymise ? privateInput.labels : []);
      note = data.warning || "";
    } catch (_) {
      result = H.analyze({ rubric: state.rubric, notes: st.notes, student: st.name, tone: state.tone });
      note = "Used the built-in offline rules.";
    }
    st.scores = result.scores;attachLineEvidence(st);st.scoredAt=Date.now();
    st.feedback = result.feedback;
    st.engine = result.engine;
    busy = false;
    btn.disabled = false;
    save();
    logAudit("analyzed","Submission analyzed",st,auditBefore,{scores:scoreSnapshot(st.scores),feedbackCharacters:String(st.feedback||"").length,engine:st.engine});
    renderStudents();
    if (current() === st) { $("#feedback").value = st.feedback; renderScores(st);renderFeedbackQuality(st);feedbackAuditBaseline.set(st.id,String(st.feedback||""));noteAuditBaseline.set(st.id,String(st.notes||"")); }
    if (checked) recheck(false);
    say(`${st.name} scored ${R.totalScore(state.rubric, st.scores)} of ${R.totalMax(state.rubric)}. ${note}`.trim());
  }

  function runCommand(text) {
    const cmd = K.parseCommand(text, state.rubric);
    const st = current();
    switch (cmd.type) {
      case "next": move(1); break;
      case "prev": move(-1); break;
      case "next-ungraded": moveUngraded(1); break;
      case "undo": historyAction("undo"); break;
      case "redo": historyAction("redo"); break;
      case "comment": {const count=String(st.files?.find(f=>f.path===st.activeFile)?.text||st.code||"").split("\n").length,before=snapshotEditable(st);st.comments=st.comments||[];st.comments.push({id:window.TG_ids.newId("comment"),file:st.activeFile||st.filename,from:cmd.from,to:cmd.to,text:cmd.text,source:"manual",outOfRange:cmd.to>count});recordEditableChange(st,before,"comment addition");save();renderWork();say(`Comment added on line${cmd.from===cmd.to?"":"s"} ${cmd.from}${cmd.to!==cmd.from?`–${cmd.to}`:""}.`);break;}
      case "open": {const match=state.students.find(s=>s.name.toLowerCase()===cmd.query.toLowerCase())||state.students.find(s=>s.name.toLowerCase().includes(cmd.query.toLowerCase()));if(match){select(match.id);say(`Opened ${match.name}.`);}else say(`No student matches ${cmd.query}.`);break;}
      case "view": {const key=cmd.view.replace(/\s+/g,"").toLowerCase(),btn=$("#btn-"+key);if(btn){btn.click();say(`Opened ${cmd.view}.`);}else say(`No view matches ${cmd.view}.`);break;}
      case "export": if(cmd.format==="csv")$("#btn-csv")?.click();else{$("#btn-export")?.click();$("#export-feedback-zip")?.click();}break;
      case "analyze": analyze(st); break;
      case "check": recheck(true); break;
      case "set": {
        if (!st.scores) { say("Score this submission first."); break; }
        setScore(st, cmd.criterionId, cmd.score);
        const crit = state.rubric.criteria.find((c) => c.id === cmd.criterionId);
        say(`${crit.name} set to ${R.clampScore(cmd.score, crit.max)}.`);
        break;
      }
      case "error": say(cmd.message); break;
      case "empty": break;
      default: say("I did not understand that command. Try “next student”, “set testing to 2” or “check consistency”.");
    }
  }

  /* ---------- data loading ---------- */
  function loadSample() {
    const s = window.TG_SAMPLE;
    const courses = state.courses || [];
    let demoCourse = courses.find(c => c.name === "Demo course");
    if (!demoCourse) { demoCourse = { id: `course-demo-${Date.now().toString(36)}`, name: "Demo course", archived: false }; courses.push(demoCourse); }
    state = {
      rubric: s.rubric,
      students: s.students.map((x) => ({ id: x.id, name: x.name, filename: x.filename, code: x.code, notes: "", sampleNotes: x.sampleNotes, scores: null, feedback: "" })),
      currentId: s.students[0].id, dismissed: [], tone: state.tone || "warm", assignmentId: `demo-${Date.now().toString(36)}`, assignmentTitle: "Demo assignment", courseId: demoCourse.id, courseName: "Demo course", assignments: state.assignments || [], courses, dueDate: null, assignmentArchived: false, assignmentSettings: {consistency:{tolerance:.25,driftTolerance:.3,minPeers:2}}
    };
    flags = []; checked = false;
    save();
    renderAll();
    window.TG_router?.navigate("grade");
    say("Sample loaded: six submissions. Use sample dictation on each, or press Score all samples.");
  }

  async function scoreAllSamples() {
    for (const st of state.students) {
      if (!st.sampleNotes) continue;
      st.notes = st.sampleNotes;
      await analyze(st);
    }
    renderWork();
    recheck(true);
  }

  async function importFiles(fileList) {
    const files=Array.from(fileList),entries=[],skipped=[];
    for(const file of files){
      if(/\.zip$/i.test(file.name)){
        if(file.size>50*1024*1024){skipped.push({path:file.name,reason:"ZIP exceeds 50 MB"});continue;}
        try{const packed=await window.TG_zip.readZip(new Uint8Array(await file.arrayBuffer()),{maxBytes:10*1024*1024,maxEntries:200,maxRatio:100});entries.push(...SI.fromArchive(packed));}
        catch(e){skipped.push({path:file.name,reason:e.message||"Unreadable ZIP"});}continue;
      }
      const path=file.webkitRelativePath||file.name,parts=path.replace(/\\/g,"/").split("/").filter(Boolean);
      const sizeLimit=/\.json$/i.test(path)?SI.MAX_SUBMISSION:SI.MAX_FILE;if(file.size>sizeLimit){skipped.push({path,reason:/\.json$/i.test(path)?"JSON roster exceeds 2 MB":"file exceeds 200 KB"});continue;}
      let bytes;try{bytes=new Uint8Array(await file.arrayBuffer());}catch(_){skipped.push({path,reason:"could not read file"});continue;}
      const relative=file.webkitRelativePath?parts.slice(1):parts,folderGroup=relative.length>=2?relative[0]:null;
      entries.push({path:file.webkitRelativePath?relative.join("/"):path,bytes,group:folderGroup});
    }
    const result=SI.ingest(entries,{existingCount:state.students.length});
    skipped.push(...result.skipped);
    const added=result.submissions;
    if (!added.length) { showImportReport(0,skipped); say(`No usable submissions found${skipped.length?` (${skipped.length} skipped)`:""}.`); return; }
    if (!state.rubric) state.rubric = window.TG_SAMPLE.rubric;
    const stamp = Date.now().toString(36);
    const fresh = added.map((x, i) => {const fs=x.files||[];return {id:`u${stamp}${i}`,name:x.name,studentId:x.studentId||"",filename:fs.length===1?fs[0].path:`${fs.length} files`,files:fs,activeFile:fs[0]?.path||"",code:fs.map(f=>f.text).join("\n\n"),notes:"",scores:null,feedback:""};});
    state.students = state.students.concat(fresh);
    if (!state.currentId || !current()) state.currentId = fresh[0].id;
    save();
    renderAll();
    showImportReport(fresh.length,skipped);say(`Imported ${fresh.length} submission${fresh.length===1?"":"s"}${skipped.length?`, skipped ${skipped.length}`:""}.`);
  }

  function showImportReport(count,skipped){const dlg=$("#import-report-dialog"),list=$("#import-report-skipped");$("#import-report-summary").textContent=`Imported ${count} submission${count===1?"":"s"}. ${skipped.length} file${skipped.length===1?" was":"s were"} skipped.`;list.replaceChildren(...skipped.map(x=>h("li",{},`${x.path}: ${x.reason}`)));if(skipped.length||!count)dlg.showModal();}

  async function droppedSubmissionFiles(items){
    const found=[];
    async function walk(entry,parent=""){
      if(entry.isFile){const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));found.push({name:file.name,webkitRelativePath:`${parent}${file.name}`,size:file.size,arrayBuffer:()=>file.arrayBuffer()});return;}
      if(entry.isDirectory){const reader=entry.createReader();let batch=[];do{batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));for(const child of batch)await walk(child,`${parent}${entry.name}/`);}while(batch.length);}
    }
    for(const item of Array.from(items||[])){const entry=item.webkitGetAsEntry?.();if(entry)await walk(entry);else{const file=item.getAsFile?.();if(file)found.push(file);}}
    return found;
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportRows() {
    return graded().map((s) => ({ id:s.id,studentId:s.studentId||"",name: s.name, scores: s.scores, feedback: s.feedback }));
  }
  function warnFeedbackQuality(rows){
    const names=rows.map(row=>row.name).filter(Boolean),warned=rows.filter(row=>FQ.analyze(row.feedback,names.filter(name=>name!==row.name)).findings.length);
    const target=$("#export-quality-warning");if(target)target.textContent=warned.length?`${warned.length} student's feedback has quality warnings. Export is still available; review the feedback quality panel before sharing.`:"No feedback quality warnings in the current export.";
    return warned.length;
  }

  /* ---------- wiring ---------- */
  function wire() {
    const views = ["insights", "similarity", "dashboard", "calibration", "activity", "export", "settings"];
    function showView(name,fromRoute=false) {
      const home=name==="home",grade=name==="grade";
      if(!home){flushTextAudit(current(),"notes");flushTextAudit(current(),"feedback");}
      document.body.classList.toggle("landing-page",home);
      if(home){$("#welcome").hidden=false;$("#workspace").hidden=true;animateWelcomeOnce();}
      else if(grade){renderWork();}
      else {$("#welcome").hidden = true; $("#workspace").hidden = true;}
      views.forEach(v => { const el = $(`#${v}-view`); if (el) el.hidden = v !== name; });
      syncActiveTime(true);
      if(!fromRoute&&window.TG_router)window.TG_router.navigate(name);
    }
    function renderActivity(){
      const filter=$("#activity-filter"),selected=filter.value||"all",list=$("#activity-list"),empty=$("#activity-empty");
      const submissions=state.students.map(s=>({id:s.id,name:s.name}));
      filter.replaceChildren(h("option",{value:"all"},"All submissions"),...submissions.map(s=>h("option",{value:s.id},s.name)));
      filter.value=selected==="all"||submissions.some(s=>s.id===selected)?selected:"all";
      const events=(state.auditLog||[]).filter(e=>filter.value==="all"||e.submissionId===filter.value).slice().sort((a,b)=>String(b.ts||"").localeCompare(String(a.ts||"")));
      list.replaceChildren(...events.map(event=>{
        const student=submissions.find(s=>s.id===event.submissionId),stamp=event.ts||"",detail=event.type==="consistency-flag"?`${event.action||"Flag"} · ${event.kind||"consistency"}`:event.type==="calibration-resolved"?`Resolved ${event.criterionId}: ${event.before??"—"} → ${event.finalScore}`:event.summary||event.type;
        const changes=event.changes?.length?` · ${event.changes.length} score change(s)`:"";
        return h("li",{},h("time",{datetime:stamp},stamp?new Date(stamp).toLocaleString():"Time unavailable"),` · ${event.actor||"you"} · ${student?.name?`${student.name} · `:""}${detail}${changes}`,event.before!==null&&event.before!==undefined&&event.after!==null&&event.after!==undefined?h("span",{class:"muted"},` (${JSON.stringify(event.before)} → ${JSON.stringify(event.after)})`):null);
      }));
      empty.hidden=events.length>0;
    }
    $("#btn-activity").addEventListener("click",()=>{showView("activity");renderActivity();});
    $("#activity-filter").addEventListener("change",renderActivity);
    function renderExportColumns(){
      const preset=$("#export-preset").value||"generic",rubric=state.rubric||window.TG_SAMPLE.rubric,container=$("#export-columns"),columns=X.csvColumns(rubric,preset);
      container.replaceChildren(...columns.map((column,index)=>h("label",{class:"export-column"},h("input",{type:"checkbox",value:column.key,checked:preset==="moodle"?index<columns.length:true}),` ${column.label}`)));
    }
    function selectedExportColumns(){const container=$("#export-columns"),inputs=[...container.querySelectorAll("input")];return inputs.length?inputs.filter(node=>node.checked).map(node=>node.value):undefined;}
    renderExportColumns();
    $("#btn-export").addEventListener("click",()=>{renderExportColumns();showView("export");});
    $("#export-preset").addEventListener("change",renderExportColumns);
    $("#export-csv-selected").addEventListener("click",()=>{
      const rows=exportRows();if(!rows.length){$("#export-status").textContent="Grade at least one submission before exporting.";return;}
      const preset=$("#export-preset").value||"generic",warned=warnFeedbackQuality(rows),columns=selectedExportColumns();
      if(columns?.length===0){$("#export-status").textContent="Select at least one CSV column.";return;}
      download("talkgrade-grades.csv",X.toCSV(state.rubric||window.TG_SAMPLE.rubric,rows,{preset,columns}),"text/csv;charset=utf-8");
      $("#export-status").textContent=`CSV exported with ${columns?.length||X.csvColumns(state.rubric||window.TG_SAMPLE.rubric,preset).length} columns.${warned?` ${warned} feedback draft(s) have warnings; export was not blocked.`:""}`;
    });
    $("#export-feedback-zip").addEventListener("click",()=>{
      const rows=exportRows();if(!rows.length){$("#export-status").textContent="Grade at least one submission before exporting.";return;}
      const entries=X.feedbackZipFiles(state.rubric||window.TG_SAMPLE.rubric,rows),zip=window.TG_zip.writeZip(entries);
      download("talkgrade-student-feedback.zip",zip,"application/zip");$("#export-status").textContent=`Exported ${rows.length} student feedback files as Markdown and plain text.`;
    });
    $("#export-course-backup").addEventListener("click",()=>{
      if(!state.courseId){$("#export-status").textContent="Choose a course before creating a backup.";return;}
      const backup=window.TG_courseBackup.exportCourse(state,state.courseId),name=window.TG_export.safeBaseName(backup.course.name);
      download(`${name}-talkgrade-backup.json`,JSON.stringify(backup,null,2),"application/json;charset=utf-8");$("#export-status").textContent=`Backed up ${backup.course.name} and ${backup.assignments.length} assignment(s).`;
    });
    $("#restore-course-backup").addEventListener("click",async()=>{
      const file=$("#course-backup-file").files[0];if(!file){$("#export-status").textContent="Choose a course backup JSON file first.";return;}
      if(file.size>20*1024*1024){$("#export-status").textContent="Course backups are limited to 20 MB.";return;}
      try{const backup=JSON.parse(await file.text());if(!window.confirm(`Restore “${backup.course?.name||"this course"}” as a new course copy?`))return;state=window.TG_courseBackup.restoreCourse(state,backup);save();renderAll();showView("home");$("#export-status").textContent=`Restored ${state.courseName} as a new course copy.`;say(`Restored ${state.courseName} as a new course copy.`);}catch(error){$("#export-status").textContent=error.message||"Could not restore this course backup.";}
    });
    $("#export-print-reports").addEventListener("click",()=>{
      const target=$("#print-reports"),rubric=state.rubric||window.TG_SAMPLE.rubric,rows=graded();if(!rows.length){$("#export-status").textContent="Grade at least one submission before printing reports.";return;}
      const warned=warnFeedbackQuality(exportRows());if(warned)$("#export-status").textContent=`Printing reports with ${warned} feedback quality warning(s).`;
      target.replaceChildren(...rows.map(st=>{
        const total=R.totalScore(rubric,st.scores),max=R.totalMax(rubric),table=h("table",{},h("caption",{},"Score breakdown"),h("thead",{},h("tr",{},h("th",{scope:"col"},"Criterion"),h("th",{scope:"col"},"Score"),h("th",{scope:"col"},"Maximum"))),h("tbody",{},...rubric.criteria.map(c=>h("tr",{},h("th",{scope:"row"},c.name),h("td",{},st.scores?.[c.id]?.score??"—"),h("td",{},c.max)))));
        const comments=st.comments?.length?h("section",{},h("h3",{},"Line comments"),h("ul",{},...st.comments.map(c=>h("li",{},`${c.file||"file"}: lines ${c.from}${c.to!==c.from?`–${c.to}`:""} — ${c.text}`)))):null;
        return h("article",{class:"print-student"},h("h1",{},st.name),st.studentId?h("p",{},`Student ID: ${st.studentId}`):null,h("p",{class:"print-total"},`Score: ${total}/${max}${max?` (${Math.round(total/max*100)}%)`:""}`),table,comments,h("section",{},h("h3",{},"Feedback"),h("p",{},st.feedback||"(no feedback written)")));
      }));
      document.body.classList.add("printing-reports");const cleanup=()=>{document.body.classList.remove("printing-reports");window.removeEventListener("afterprint",cleanup);};window.addEventListener("afterprint",cleanup);window.print();
    });
    window.addEventListener("talkgrade:navigate",event=>{showView(event.detail.view,true);if(event.detail.view==="activity")renderActivity();});
    function renderInsights(){const grader=$("#insights-grader").value||"me",data=window.TG_insights.aggregate(state.students,state.rubric||window.TG_SAMPLE.rubric,grader);$("#insights-summary").textContent=data.gradedCount+" submissions graded; class average "+data.classAverage.toFixed(1)+" points.";const box=$("#insights-content");box.replaceChildren();data.criteria.forEach(x=>box.append(h("p",{},x.name+": "+Math.round(x.lostRate*100)+"% lost points at least once; average loss "+x.avgLoss.toFixed(1)+"; average score "+Math.round(x.avgScorePct*100)+"%.")));data.issues.slice(0,10).forEach(x=>box.append(h("p",{},x.tag+" — "+x.count+" students ("+Math.round(x.pct*100)+"%), average loss "+x.avgLoss.toFixed(1)+".")));$("#digest").value=window.TG_insights.buildDigest(data);$("#digest-polished").value="";$("#digest-polish-status").textContent="";}
    $("#btn-insights").addEventListener("click",()=>{showView("insights");const select=$("#insights-grader"),graders=[...new Set(["me",...state.students.flatMap(s=>Object.keys(s.gradings||{}))])].filter(g=>g==="me"||state.students.some(s=>Object.values(s.gradings?.[g]?.scores||{}).some(x=>Number.isFinite(x?.score))));select.replaceChildren(...graders.map(g=>h("option",{value:g},g)));select.value=graders.includes("me")?"me":graders[0]||"me";renderInsights();});
    $("#insights-grader").addEventListener("change",renderInsights);    $("#digest-download").addEventListener("click", () => download("misconception-digest.md", $("#digest").value, "text/markdown;charset=utf-8"));
    $("#digest-use-polished").addEventListener("click",()=>{if(!$("#digest-polished").value.trim()){say("Polish the digest first.");return;}$("#digest").value=$("#digest-polished").value;say("AI-polished digest copied into the editable draft.");});
    $("#digest-polish").addEventListener("click",async()=>{const status=$("#digest-polish-status"),button=$("#digest-polish");button.disabled=true;try{status.textContent="Checking AI availability…";const health=await fetch("api/health").then(r=>r.json());if(health.engine!=="gemini"){status.textContent="Gemini is not configured. Your local digest is ready.";return;}const data=window.TG_insights.aggregate(state.students,state.rubric||window.TG_SAMPLE.rubric,$("#insights-grader").value||"me"),payload={gradedCount:data.gradedCount,classAverage:data.classAverage,criteria:data.criteria.map(x=>({name:x.name,lostRate:x.lostRate,avgLoss:x.avgLoss,avgScorePct:x.avgScorePct})),issues:data.issues.slice(0,10).map(x=>({tag:x.tag,count:x.count,pct:x.pct,avgLoss:x.avgLoss,example:x.example}))},res=await fetch("api/insights/polish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}),out=await res.json();if(!res.ok)throw Error(out.message||out.error||"AI polishing failed.");$("#digest-polished").value=out.text;status.textContent="Gemini-polished draft ready. Review it before using; the original is unchanged.";}catch(e){status.textContent=e.message||"Could not polish the digest.";}finally{button.disabled=false;}});
    $("#btn-similarity").addEventListener("click", () => { showView("similarity"); renderSimilarity(); });
    let similarityVisibleLimit=20;
    $("#similarity-threshold").addEventListener("input", () => { $("#threshold-value").value = `${$("#similarity-threshold").value}%`;similarityVisibleLimit=20;renderSimilarity(); });
    let activeSimilarityPair = null;
    const similarityPairKey = pair => [pair.a, pair.b].sort().join("::");
    function similarityReview(pair) { return (state.similarityReviews || []).find(x => x.pairKey === similarityPairKey(pair)) || null; }
    function similarityText(student) { return (student.files?.length ? student.files : [{ text: student.code || "" }]).slice().sort((a,b)=>(a.path||"").localeCompare(b.path||"")).map(file=>file.text||"").join("\nFILE\n"); }
    function similarityFileNames(student) { return (student.files||[]).map(file=>file.path).filter(Boolean).sort((a,b)=>a.localeCompare(b)); }
    let similarityMatchIndex=0;
    function focusSimilarityMatch(index) {
      const match=activeSimilarityPair?.matches?.[index];if(!match)return;
      $("#similarity-match-status").textContent=`Match ${index+1} of ${activeSimilarityPair.matches.length}: line ${match.lineA} corresponds to line ${match.lineB}.`;
      document.querySelectorAll(".similarity-line.current-match").forEach(x=>x.classList.remove("current-match"));
      [["a",match.lineA],["b",match.lineB]].forEach(([side,line])=>{const row=$(`#similarity-code-${side} [data-line="${line}"]`);if(!row)return;row.classList.add("current-match");row.scrollIntoView({block:"center",inline:"nearest",behavior:"smooth"});});
    }
    function stepSimilarityMatch(delta) {const count=activeSimilarityPair?.matches?.length||0;if(!count)return;similarityMatchIndex=(similarityMatchIndex+delta+count)%count;focusSimilarityMatch(similarityMatchIndex);}
    function renderMatchedCode(student, ranges, label, side) {
      const pre=h("pre",{id:`similarity-code-${side}`,class:"similarity-code",tabindex:"0","aria-label":label}),text=similarityText(student);
      text.split("\n").forEach((line,index)=>{const lineNumber=index+1,matched=ranges.some(([from,to])=>lineNumber>=from&&lineNumber<=to);pre.append(h("span",{class:`similarity-line${matched?" matched":""}`,"data-line":lineNumber},h("span",{class:"similarity-line-number","aria-label":`Line ${lineNumber}`},String(lineNumber)),h("span",{class:"similarity-match-tag"},matched?"MATCH":""),h("span",{class:"similarity-line-text"},line||" "),document.createTextNode("\n")));});
      return pre;
    }
    function renderSimilarityDetail(pair) {
      const detail=$("#similarity-detail"),a=state.students.find(s=>s.id===pair.a),b=state.students.find(s=>s.id===pair.b);
      if(!a||!b){detail.hidden=true;return;}
      detail.hidden=false;$("#similarity-detail-summary").textContent=`${pair.shared} shared fingerprints · ${Math.round(pair.containment*100)}% containment · ${Math.round(pair.jaccard*100)}% Jaccard. Matching ranges are highlighted in both submissions; similarity is not proof of copying.`;
      const filesA=similarityFileNames(a),filesB=similarityFileNames(b);
      $("#similarity-columns").replaceChildren(h("article",{class:"similarity-code-panel"},h("h4",{},a.name),filesA.length?h("p",{class:"muted small"},filesA.join(" · ")):null,renderMatchedCode(a,pair.linesA,`Matched source lines for ${a.name}`,"a")),h("article",{class:"similarity-code-panel"},h("h4",{},b.name),filesB.length?h("p",{class:"muted small"},filesB.join(" · ")):null,renderMatchedCode(b,pair.linesB,`Matched source lines for ${b.name}`,"b")));
      if(pair.matches?.length)focusSimilarityMatch(similarityMatchIndex%pair.matches.length);
    }
    function setSimilarityReview(pair,status) {
      const key=similarityPairKey(pair);state.similarityReviews=(state.similarityReviews||[]).filter(x=>x.pairKey!==key);
      if(status)state.similarityReviews.push({pairKey:key,submissionIds:[pair.a,pair.b],status,updatedAt:new Date().toISOString()});
      save();renderSimilarity();
    }
    function renderSimilarity() {
      const threshold=Number($("#similarity-threshold").value)/100;
      const pairs=window.TG_similarity.compare(state.students,{threshold,minFingerprints:20,starterCode:state.starterCode||"",limit:100});
      const box=$("#similarity-results");box.replaceChildren();
      if(!pairs.length)box.append(h("p",{},"No pairs meet this threshold."));
      pairs.slice(0,similarityVisibleLimit).forEach(p=>{
        const review=similarityReview(p),reviewLabel=review?.status==="reviewed"?"Reviewed":review?.status==="not-concern"?"Not a concern":"Not reviewed";
        box.append(h("article",{class:`flag medium similarity-pair${review?" is-reviewed":""}`},
          h("div",{class:"panel-head"},h("h3",{},`${p.nameA} and ${p.nameB}`),h("span",{class:"similarity-status"},reviewLabel)),
          h("p",{},`${Math.round(p.containment*100)}% containment · ${Math.round(p.jaccard*100)}% Jaccard · ${p.shared} shared fingerprints. Similarity is a lead for human review, not proof of copying.`),
          h("div",{class:"similarity-actions"},
            h("button",{type:"button",onclick:()=>{activeSimilarityPair=p;similarityMatchIndex=0;renderSimilarityDetail(p);$("#similarity-detail").scrollIntoView({block:"nearest",behavior:"smooth"});}},"Compare matched lines"),
            h("button",{type:"button",onclick:()=>setSimilarityReview(p,"reviewed")},"Mark reviewed"),
            h("button",{type:"button",onclick:()=>setSimilarityReview(p,"not-concern")},"Not a concern"),
            review?h("button",{type:"button",onclick:()=>setSimilarityReview(p,null)},"Clear review"):null)));
      });
      if(pairs.totalPairs>similarityVisibleLimit)box.append(h("p",{class:"muted"},`Showing ${Math.min(similarityVisibleLimit,pairs.length)} of ${pairs.totalPairs} matching pairs.`));
      if(similarityVisibleLimit<pairs.length)box.append(h("button",{type:"button",onclick:()=>{similarityVisibleLimit=Math.min(100,similarityVisibleLimit+20);renderSimilarity();}},`Show more (${Math.min(100,similarityVisibleLimit+20)} of ${pairs.totalPairs||pairs.length})`));
      const active=activeSimilarityPair&&pairs.find(p=>similarityPairKey(p)===similarityPairKey(activeSimilarityPair));
      if(active)renderSimilarityDetail(active);else $("#similarity-detail").hidden=true;
    }
    $("#similarity-prev-match").addEventListener("click",()=>stepSimilarityMatch(-1));
    $("#similarity-next-match").addEventListener("click",()=>stepSimilarityMatch(1));
    $("#similarity-detail-close").addEventListener("click",()=>{$("#similarity-detail").hidden=true;activeSimilarityPair=null;});
    const svgNode=(name,attrs={})=>{const node=document.createElementNS("http://www.w3.org/2000/svg",name);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)));return node;};
    function renderHistogramChart(target,title,bins,max){
      const chart=svgNode("svg",{viewBox:"0 0 640 260",role:"img","aria-label":title,class:"dashboard-chart"}),titleNode=svgNode("title");titleNode.textContent=title;chart.append(titleNode);
      const left=48,top=18,width=570,height=190,highest=Math.max(1,...bins.map(x=>x.count));
      chart.append(svgNode("line",{x1:left,y1:top+height,x2:left+width,y2:top+height,stroke:"currentColor"}),svgNode("line",{x1:left,y1:top,x2:left,y2:top+height,stroke:"currentColor"}));
      bins.forEach((bin,index)=>{const slot=width/bins.length,barWidth=slot*.62,barHeight=bin.count/highest*(height-18),x=left+index*slot+(slot-barWidth)/2,y=top+height-barHeight,rect=svgNode("rect",{x,y,width:barWidth,height:barHeight,rx:3,class:"dashboard-bar"});chart.append(rect);const count=svgNode("text",{x:x+barWidth/2,y:y-4,"text-anchor":"middle",class:"dashboard-svg-label"});count.textContent=String(bin.count);chart.append(count);const label=svgNode("text",{x:left+index*slot+slot/2,y:top+height+17,"text-anchor":"middle",class:"dashboard-svg-label"});label.textContent=Number(max)?`${Math.round(bin.from/max*100)}%`:`${index+1}`;chart.append(label);});
      const table=h("table",{class:"dashboard-data-table"},h("caption",{},title),h("thead",{},h("tr",{},h("th",{scope:"col"},"Score range"),h("th",{scope:"col"},"Submissions"))),h("tbody",{},...bins.map((bin,index)=>h("tr",{},h("th",{scope:"row"},`${bin.from.toFixed(1)}–${bin.to.toFixed(1)}`),h("td",{},bin.count)))));
      target.append(chart,table);
    }
    function renderTrendChart(target,trend,max){
      if(!trend.length){target.replaceChildren(h("p",{class:"muted"},"Grade submissions to see the score trend."));return;}
      const chart=svgNode("svg",{viewBox:"0 0 640 280",role:"img","aria-label":"Total scores in grading order and their five-submission moving average",class:"dashboard-chart"}),titleNode=svgNode("title");titleNode.textContent="Scores by grading order with five-submission moving average";chart.append(titleNode);
      const left=48,top=18,width=570,height=210,denom=Math.max(1,trend.length-1),range=max||1;
      chart.append(svgNode("line",{x1:left,y1:top+height,x2:left+width,y2:top+height,stroke:"currentColor"}),svgNode("line",{x1:left,y1:top,x2:left,y2:top+height,stroke:"currentColor"}));
      const points=trend.map((item,index)=>({x:left+width*(trend.length===1?.5:index/denom),y:top+height-(item.value/range)*height,averageY:top+height-(item.average/range)*height,item}));
      const polyline=svgNode("polyline",{points:points.map(p=>`${p.x},${p.y}`).join(" "),fill:"none",class:"dashboard-score-line"});chart.append(polyline);
      const average=svgNode("polyline",{points:points.map(p=>`${p.x},${p.averageY}`).join(" "),fill:"none",class:"dashboard-average-line"});chart.append(average);
      points.forEach((point,index)=>{chart.append(svgNode("circle",{cx:point.x,cy:point.y,r:4,class:"dashboard-score-point"}));const label=svgNode("text",{x:point.x,y:top+height+18,"text-anchor":"middle",class:"dashboard-svg-label"});label.textContent=String(index+1);chart.append(label);});
      const table=h("table",{class:"dashboard-data-table"},h("caption",{},"Scores in grading order"),h("thead",{},h("tr",{},h("th",{scope:"col"},"Order"),h("th",{scope:"col"},"Submission"),h("th",{scope:"col"},"Total"),h("th",{scope:"col"},"Five-submission average"))),h("tbody",{},...trend.map((item,index)=>h("tr",{},h("th",{scope:"row"},index+1),h("td",{},item.name),h("td",{},`${item.value.toFixed(1)} / ${max}`),h("td",{},item.average.toFixed(2))))));
      target.replaceChildren(chart,table);
    }
    function renderDashboard(){
      const data=window.TG_dashboardStats.summarize(state.students,state.rubric||window.TG_SAMPLE.rubric);
      $("#dashboard-summary").textContent=`${data.graded} of ${data.total} submissions graded. Median active time: ${Math.round(data.medianMs/60000)} min; slowest: ${Math.round(data.slowestMs/60000)} min.`;
      $("#dashboard-progress").replaceChildren(h("p",{},`${Math.round(data.completion*100)}% complete (${data.graded}/${data.total})`),h("progress",{max:1,value:data.completion,"aria-label":"Grading progress"}));
      renderHistogramChart($("#dashboard-total-chart"),"Total score distribution",data.totalHistogram,data.max);
      const criteriaBox=$("#dashboard-criteria-charts");criteriaBox.replaceChildren(...data.criterionHistograms.map(item=>{const section=h("section",{class:"dashboard-criterion"},h("h4",{},`${item.name} (${item.scored} scored, max ${item.max})`));renderHistogramChart(section,`${item.name} score distribution`,item.bins,item.max);return section;}));
      renderTrendChart($("#dashboard-trend-chart"),data.trend,data.max);
      const fmtTime=ms=>{const minutes=Math.floor(ms/60000),seconds=Math.round(ms%60000/1000);return `${minutes}m ${seconds}s`;};
      $("#dashboard-time").replaceChildren(h("p",{},`Median active time per submission: ${fmtTime(data.medianMs)}.`),h("p",{},`Slowest active grading time: ${fmtTime(data.slowestMs)}.`),h("p",{class:"muted"},"Active time counts only while the grading workspace is visible and focused; idle intervals are capped at three minutes."));
      const fatigue=$("#dashboard-fatigue");fatigue.replaceChildren(...(data.fatigue.length?data.fatigue.map(item=>h("p",{},item.message)):[h("p",{class:"muted"},data.graded<9?`Fatigue signals need at least 9 graded submissions; currently ${data.graded}.`:"No score-shift or shorter-notes signal detected.")]));
    }
    $("#btn-dashboard").addEventListener("click",()=>{syncActiveTime();showView("dashboard");renderDashboard();});
    function calibrationSubmissions(){return state.students.map(s=>({...s,gradings:{...(s.gradings||{}),...(s.scores?{me:{scores:s.scores}}:{})}}));}
    function calibrationGraders(){return [...new Set(["me",...state.students.flatMap(s=>Object.keys(s.gradings||{})).filter(x=>x!=="consensus")])];}
    function renderCalibrationResults(){
      const box=$("#calibration-results");box.replaceChildren();const graders=state.calibrationSelected||calibrationGraders();
      if(graders.length<2){box.append(h("p",{},"Select at least two graders with scores on shared submissions."));return;}
      const metrics=window.TG_calibration.compare(calibrationSubmissions(),state.rubric||window.TG_SAMPLE.rubric,graders),strict=metrics.strictness||[];
      box.append(h("h3",{},"Per-criterion agreement"));
      const table=h("table",{},h("thead",{},h("tr",{},...["Criterion","Graders","n","Bias (A−B)","Mean abs. diff.","Exact","Within 0.5","Weighted κ / label","Summary"].map(x=>h("th",{scope:"col"},x))))),tbody=h("tbody",{});
      metrics.forEach(m=>{const notEnough=m.n<3?`Not enough data (need 3 shared scores; n=${m.n})`:null;tbody.append(h("tr",{},h("th",{scope:"row"},m.criterionName),h("td",{},m.graderA+" / "+m.graderB),h("td",{},m.n),h("td",{},m.bias===null?notEnough:m.bias.toFixed(2)),h("td",{},m.mad===null?notEnough:m.mad.toFixed(2)),h("td",{},m.exact===null?notEnough:Math.round(m.exact*100)+"%"),h("td",{},m.within===null?notEnough:Math.round(m.within*100)+"%"),h("td",{},(m.qwk===null?notEnough:m.qwk.toFixed(2))+" · "+m.label),h("td",{},m.summary)));});
      table.append(tbody);box.append(table,h("h3",{},"Relative strictness"),...strict.map(x=>h("p",{},x.grader+": "+(x.strictness===null?"not enough shared submissions":(x.strictness*100).toFixed(1)+" percentage points "+(x.strictness>0?"more lenient":x.strictness<0?"stricter":"from group average")+" (n="+x.n+")."))),h("h3",{},"Largest disagreements"));
      const disagreements=metrics.flatMap(m=>m.disagreements).sort((a,b)=>b.difference-a.difference);
      if(!disagreements.length)box.append(h("p",{},"No disagreements meet the threshold."));
      disagreements.forEach(d=>{const st=state.students.find(s=>s.id===d.submissionId),consensus=st?.gradings?.consensus?.scores?.[d.criterionId]?.score,button=h("button",{type:"button",disabled:consensus!==undefined,onclick:()=>openCalibrationResolve(d)},consensus!==undefined?"Resolved: consensus "+consensus:"Resolve");box.append(h("article",{class:"flag medium"},h("p",{},(st?.name||d.submissionId)+" · "+d.criterionName+": "+d.graderA+" "+d.a+" vs "+d.graderB+" "+d.b+" ("+d.difference.toFixed(1)+" points apart)"),button));});
    }
    let calibrationTarget=null;
    function openCalibrationResolve(d){calibrationTarget=d;$("#calibration-resolve-context").textContent=(state.students.find(s=>s.id===d.submissionId)?.name||d.submissionId)+" · "+d.criterionName+": "+d.graderA+" scored "+d.a+"; "+d.graderB+" scored "+d.b+".";$("#calibration-resolve-choice").options[0].textContent="Use "+d.graderA+"'s score ("+d.a+")";$("#calibration-resolve-choice").options[1].textContent="Use "+d.graderB+"'s score ("+d.b+")";$("#calibration-resolve-choice").value="a";$("#calibration-resolve-score").max=d.criterionMax;$("#calibration-resolve-score").value=d.a;$("#calibration-resolve-error").textContent="";$("#calibration-resolve-dialog").showModal();}
    $("#calibration-resolve-choice").addEventListener("change",e=>{if(calibrationTarget&&e.target.value!=="custom")$("#calibration-resolve-score").value=e.target.value==="a"?calibrationTarget.a:calibrationTarget.b;});
    $("#calibration-resolve-save").addEventListener("click",()=>{if(!calibrationTarget)return;try{const out=window.TG_calibration.resolve({submissions:calibrationSubmissions(),submissionId:calibrationTarget.submissionId,criterionId:calibrationTarget.criterionId,finalScore:Number($("#calibration-resolve-score").value),by:"you",rubric:state.rubric||window.TG_SAMPLE.rubric,audit:state.auditLog||[]}),updated=out.submissions.find(s=>s.id===calibrationTarget.submissionId),original=state.students.find(s=>s.id===calibrationTarget.submissionId);original.gradings={...(original.gradings||{}),consensus:updated.gradings.consensus};state.auditLog=out.audit;save();$("#calibration-resolve-dialog").close();calibrationTarget=null;renderCalibrationResults();say("Disagreement resolved and recorded in the audit trail.");}catch(e){$("#calibration-resolve-error").textContent=e.message;}});
    $("#calibration-resolve-cancel").addEventListener("click",()=>$("#calibration-resolve-dialog").close());
    $("#grader-export").addEventListener("click",()=>{const rows=state.students.filter(s=>s.scores).map(s=>({id:s.id,name:s.name,studentId:s.studentId||"",scores:s.scores}));if(!rows.length){say("Grade at least one submission before exporting gradings.");return;}download("talkgrade-my-gradings.json",JSON.stringify({version:1,grader:"me",assignmentTitle:state.assignmentTitle||"",rubricId:state.rubricSourceId||null,rubric:state.rubric,students:rows},null,2),"application/json");say("Your gradings were exported.");});
    $("#btn-calibration").addEventListener("click",()=>{showView("calibration");const list=$("#calibration-graders"),available=calibrationGraders();list.replaceChildren(h("h3",{},"Compare graders"));available.forEach(grader=>list.append(h("label",{},h("input",{type:"checkbox",value:grader,checked:true,onchange:()=>{state.calibrationSelected=[...list.querySelectorAll("input:checked")].map(x=>x.value);renderCalibrationResults();}})," "+grader)));state.calibrationSelected=available;renderCalibrationResults();});
    $("#grader-import").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;if(f.size>2*1024*1024){say("Grading JSON is limited to 2 MB.");return;}try{const imported=JSON.parse(await f.text());if(!imported||typeof imported!=="object")throw Error("Grading file must contain a JSON object or array.");const items=(Array.isArray(imported)?imported:imported.students||[]).filter(x=>x&&typeof x==="object"),graderId=String($("#grader-name").value||imported.grader||f.name.replace(/\.json$/i,"")).trim().slice(0,80);if(!graderId||graderId==="me"||graderId==="consensus")throw Error("Choose a distinct grader name.");const rubric=state.rubric||window.TG_SAMPLE.rubric,incoming=imported.rubric?.criteria;if(incoming&&(incoming.length!==rubric.criteria.length||incoming.some((c,i)=>c.id!==rubric.criteria[i].id||Number(c.max)!==Number(rubric.criteria[i].max))))throw Error("This grading file uses a different rubric.");const matched=new Set();state.students.forEach(s=>{const other=items.find(x=>!matched.has(x)&&((x.id&&x.id===s.id)||x.name===s.name));if(!other)return;matched.add(other);const source=other.scores||other.grading?.scores||{},scores={};rubric.criteria.forEach(c=>{const score=Number(source[c.id]?.score??source[c.id]);if(Number.isFinite(score)&&score>=0&&score<=c.max)scores[c.id]={...(typeof source[c.id]==="object"?source[c.id]:{}),score};});s.gradings={...(s.gradings||{}),[graderId]:{scores}};});if(!matched.size)throw Error("No submissions in that file matched this assignment.");state.calibrationSelected=[...new Set(["me",graderId])];save();$("#btn-calibration").click();say("Imported gradings for "+graderId+".");}catch(err){say(err.message||"Could not read that grading JSON.");}});    $("#btn-settings").addEventListener("click",()=>{const c=state.assignmentSettings?.consistency||{};$("#consistency-tolerance").value=c.tolerance??.25;$("#consistency-drift").value=c.driftTolerance??.3;$("#consistency-peers").value=c.minPeers??2;$("#privacy-anonymise").checked=state.privacy.anonymise;$("#privacy-code").checked=state.privacy.sendCode;$("#privacy-strip").checked=state.privacy.stripIdentifiers;$("#consistency-settings-save").disabled=!state.assignmentId;$("#consistency-settings-error").textContent="";renderFlags();updateDataFlow();showView("settings");});
    function updateDataFlow(){const box=$("#data-flow-detail"),gemini=$("#engine").textContent.toLowerCase().includes("gemini");if(!gemini){box.textContent="Offline grading runs locally in this browser. The browser stores your class data in IndexedDB with a localStorage recovery copy.";return;}const parts=["The browser sends the grading request to this TalkGrade server, which forwards it to Google's Gemini API.",state.privacy.anonymise?"Student names are replaced with anonymous labels in the browser before the request; names are restored only after the response.":"Student display name is included in the request because anonymization is off.",state.privacy.sendCode?"Submission code is included in the request.":"Submission code is omitted from the request.",state.privacy.stripIdentifiers?"Email addresses and explicitly labelled student/user IDs are redacted in the browser before sending.":"Identifier redaction is off.","PDF/image rubric extraction sends the selected document to Gemini. Insight polishing sends class-level aggregates and issue examples."];box.textContent=parts.join(" ");}
    ["#privacy-anonymise","#privacy-code","#privacy-strip"].forEach(selector=>$(selector).addEventListener("change",()=>{state.privacy={anonymise:$("#privacy-anonymise").checked,sendCode:$("#privacy-code").checked,stripIdentifiers:$("#privacy-strip").checked};save();updateDataFlow();say("AI privacy preferences saved.");}));$("#consistency-settings-save").addEventListener("click",()=>{if(!state.assignmentId){$("#consistency-settings-error").textContent="Choose an assignment first.";return;}const next=CM.updateAssignment(state,state.assignmentId,{title:state.assignmentTitle||"Assignment",dueDate:state.dueDate||"",tolerance:Number($("#consistency-tolerance").value),driftTolerance:Number($("#consistency-drift").value),minPeers:Number($("#consistency-peers").value)});if(next.errors?.length){$("#consistency-settings-error").textContent=next.errors.join(" ");return;}state=next;save();$("#consistency-settings-error").textContent="Settings saved.";if(checked)recheck(false);say("Consistency settings saved.");});
    $("#assignment-switch").addEventListener("change", e => switchAssignment(e.target.value));
    $("#course-switch").addEventListener("change", e => { const c=(state.courses||[]).find(x=>x.id===e.target.value);if(!c)return;state.courseId=c.id;state.courseName=c.name;const a=(state.assignments||[]).find(x=>x.courseId===c.id);if(a)switchAssignment(a.id);else{state.assignmentId=null;state.assignmentTitle="";state.rubric=null;state.students=[];state.currentId=null;renderAll();save();} });
    $("#btn-new-assignment").addEventListener("click", () => {
      const title=window.prompt("Assignment name");if(!title?.trim())return;save();if(!state.courseId)state=CM.createCourse(state,state.courseName||"My course");try{state=CM.createAssignment(state,{title,rubric:state.rubric||window.TG_SAMPLE.rubric});}catch(e){say(e.message);return;}flags=[];checked=false;save();renderAll();say(`Created ${title.trim()}.`);
    });
    $("#btn-edit-assignment").addEventListener("click",()=>{if(!state.assignmentId){say("Create or choose an assignment first.");return;}$("#assignment-title").value=state.assignmentTitle||"";$("#assignment-due").value=state.dueDate||"";$("#assignment-starter-code").value=state.starterCode||"";const c=state.assignmentSettings?.consistency||{};$("#setting-tolerance").value=c.tolerance??.25;$("#setting-drift").value=c.driftTolerance??.3;$("#setting-peers").value=c.minPeers??2;$("#assignment-error").textContent="";$("#assignment-dialog").showModal();});
    $("#assignment-cancel").addEventListener("click",()=>$("#assignment-dialog").close());
    $("#assignment-save").addEventListener("click",()=>{const details={title:$("#assignment-title").value,dueDate:$("#assignment-due").value,starterCode:$("#assignment-starter-code").value,tolerance:Number($("#setting-tolerance").value),driftTolerance:Number($("#setting-drift").value),minPeers:Number($("#setting-peers").value)},next=CM.updateAssignment(state,state.assignmentId,details);if(next.errors?.length){$("#assignment-error").textContent=next.errors.join(" ");return;}state=next;save();$("#assignment-dialog").close();say("Assignment details saved.");});
    $("#btn-archive-assignment").addEventListener("click",()=>{if(!state.assignmentId)return;state=CM.toggleAssignmentArchive(state,state.assignmentId);save();renderAssignments();say(state.assignmentArchived?"Assignment archived. Select it from the assignment list to restore it.":"Assignment restored.");});
    $("#btn-new-course").addEventListener("click",()=>{const name=window.prompt("Course name");if(!name?.trim())return;state=CM.createCourse(state,name);state.assignmentId=null;state.assignmentTitle="";state.dueDate=null;state.assignmentSettings=null;state.rubric=null;state.students=[];state.currentId=null;save();renderAll();say(`Created course ${name.trim()}.`);});
    $("#btn-rename-course").addEventListener("click",()=>{const c=(state.courses||[]).find(x=>x.id===state.courseId);if(!c)return;const name=window.prompt("Course name",c.name);if(!name?.trim())return;state=CM.renameCourse(state,c.id,name);save();renderAll();say("Course renamed.");});
    $("#btn-archive-course").addEventListener("click",()=>{const c=(state.courses||[]).find(x=>x.id===state.courseId);if(!c)return;state=CM.toggleCourseArchive(state,c.id);save();renderAssignments();say(c.archived?"Course archived. Select it to restore or manage its assignments.":"Course restored.");});
    $("#btn-delete-course").addEventListener("click",()=>{const c=(state.courses||[]).find(x=>x.id===state.courseId);if(!c)return;if(!window.confirm(`Delete ${c.name} and all its assignments and submissions? This cannot be undone.`))return;state=CM.deleteCourse(state,c.id);const next=state.courses.find(x=>!x.archived);if(next){state.courseId=next.id;state.courseName=next.name;const a=state.assignments.find(x=>x.courseId===next.id);if(a)switchAssignment(a.id);else{state.rubric=null;state.students=[];renderAll();save();}}else{state.courseName="";state.rubric=null;state.students=[];state.currentId=null;save();renderAll();}say("Course and its assignments deleted.");});
    $("#btn-delete-assignment").addEventListener("click", () => {
      if(!state.assignmentId||!window.confirm("Delete this assignment and its submissions?"))return;
      state=CM.deleteAssignment(state,state.assignmentId);
      const next=state.assignments.find(a=>!a.archived);if(next)switchAssignment(next.id);else{state.rubric=null;state.students=[];state.currentId=null;state.dismissed=[];save();renderAll();}
    });
    $("#wipe-data").addEventListener("click", async () => { if (!window.confirm("Delete all TalkGrade data stored by this app in this browser?")) return; localStorage.removeItem(KEY);await indexedStore?.wipe();state = {rubric:null,students:[],currentId:null,dismissed:[],tone:"warm",privacy:{...window.TG_settings.defaults.privacy}}; flags=[]; checked=false; renderAll(); say("Local TalkGrade data wiped."); });
    const importDialog = $("#rubric-import-dialog");
    let importedRubric = null;
    let rubricImportBytes=null;
    let lastSavedImported=null;
    function renderRubricPreview(){
      const box=$("#rubric-preview-table"),warn=$("#rubric-import-warnings");box.replaceChildren();warn.replaceChildren();if(!importedRubric)return;
      $("#rubric-import-title-field").value=importedRubric.title||"";
      const table=h("table",{},h("thead",{},h("tr",{},... ["Criterion","Points","Description","Keywords","Suggested fact","Confidence","Order"].map(x=>h("th",{},x)))),h("tbody",{}));const body=table.querySelector("tbody");
      importedRubric.criteria.forEach((c,i)=>{const inp=(type,value,label)=>h("input",{type,value:value??"","aria-label":`${label} for ${c.name||`row ${i+1}`}`}),name=inp("text",c.name,"Criterion name"),points=inp("number",c.max,"Maximum points"),desc=h("textarea",{rows:2,"aria-label":`Description for ${c.name}`},c.description||""),keywords=h("div",{class:"keyword-chips"}),keywordInput=inp("text","","Add keyword"),fact=h("select",{"aria-label":`Fact suggestion for ${c.name}`});
        const drawKeywords=()=>keywords.replaceChildren(...(c.keywords||[]).map((word,k)=>h("span",{class:"keyword-chip"},word,h("button",{type:"button","aria-label":`Remove keyword ${word}`,onclick:()=>{c.keywords.splice(k,1);drawKeywords();syncRubricPreview();}},"×"))));drawKeywords();keywordInput.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();const value=keywordInput.value.trim().replace(/,$/,"");if(value&&c.keywords.length<30)c.keywords.push(value);keywordInput.value="";drawKeywords();syncRubricPreview();}});
        [["","None / reject suggestion"],["hasTests","Has tests"],["hasComments","Has comments"],["noNestedLoops","No nested loops"]].forEach(([v,l])=>fact.append(h("option",{value:v,selected:(c.fact||"")===v},l)));if(c.suggestedFact&&!c.fact)fact.value="";
        name.oninput=()=>{c.name=name.value;syncRubricPreview();};points.oninput=()=>{c.max=Number(points.value);syncRubricPreview();};desc.oninput=()=>{c.description=desc.value;syncRubricPreview();};fact.onchange=()=>{c.fact=fact.value;syncRubricPreview();};
        const up=h("button",{type:"button",disabled:i===0,"aria-label":`Move ${c.name} up`,onclick:()=>{[importedRubric.criteria[i-1],importedRubric.criteria[i]]=[importedRubric.criteria[i],importedRubric.criteria[i-1]];renderRubricPreview();}},"↑"),down=h("button",{type:"button",disabled:i===importedRubric.criteria.length-1,"aria-label":`Move ${c.name} down`,onclick:()=>{[importedRubric.criteria[i+1],importedRubric.criteria[i]]=[importedRubric.criteria[i],importedRubric.criteria[i+1]];renderRubricPreview();}},"↓"),remove=h("button",{type:"button",onclick:()=>{importedRubric.criteria.splice(i,1);renderRubricPreview();}},"Remove");
        const suggestion=c.suggestedFact?h("small",{},`Suggested: ${c.suggestedFact}; choose above to accept.`):"";body.append(h("tr",{},h("td",{},name),h("td",{},points),h("td",{},desc),h("td",{},keywords,keywordInput),h("td",{},fact,suggestion),h("td",{},c.confidence==="high"?"High confidence":"Check this row"),h("td",{},up,down,remove)));
      });
      box.append(table);syncRubricPreview();
    }
    function syncRubricPreview(){if(!importedRubric)return;importedRubric.title=$("#rubric-import-title-field").value||importedRubric.title;$("#rubric-preview").value=JSON.stringify(importedRubric,null,2);}
    function openRubricImport(){
      $("#rubric-source").value = ""; $("#rubric-preview").value = ""; $("#rubric-import-status").textContent = ""; importedRubric = null;rubricImportBytes=null;importDialog.showModal();
      $("#rubric-source").dataset.filename="rubric.txt";$("#rubric-file").value="";$("#rubric-preview-table").replaceChildren();$("#rubric-import-warnings").replaceChildren();
    }
    ["#btn-rubric-import","#welcome-import-rubric","#library-import-rubric"].forEach(sel=>$(sel).addEventListener("click",()=>{if(sel==="#library-import-rubric")$("#rubric-library-dialog").close();openRubricImport();}));
    $("#assignment-import-rubric").addEventListener("click",()=>{$("#assignment-dialog").close();openRubricImport();});
    $("#rubric-import-close").addEventListener("click", () => importDialog.close());
    async function loadRubricFile(file){if (!file) return;
      if (file.size > 2 * 1024 * 1024) { $("#rubric-import-status").textContent = "Rubric files are limited to 2 MB."; return; }
      if(/\.(docx|xlsx|pdf|png|jpe?g|webp)$/i.test(file.name)){rubricImportBytes=new Uint8Array(await file.arrayBuffer());$("#rubric-source").value="";}else{rubricImportBytes=null;$("#rubric-source").value = await file.text();}
      $("#rubric-import-status").textContent = `Loaded ${file.name} (${file.size} bytes, ${file.type||"unknown format"}). Choose Read and preview.`;
      $("#rubric-source").dataset.filename = file.name;
    }
    $("#rubric-file").addEventListener("change", async (e) => {await loadRubricFile(e.target.files[0]);});
    $("#rubric-source").addEventListener("dragover",e=>{e.preventDefault();});
    $("#rubric-source").addEventListener("drop",async e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)await loadRubricFile(f);else if(e.dataTransfer.getData("text/plain"))$("#rubric-source").value=e.dataTransfer.getData("text/plain");});
    $("#rubric-drop-zone").addEventListener("click",()=>$("#rubric-file").click());$("#rubric-drop-zone").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){$("#rubric-file").click();}});$("#rubric-drop-zone").addEventListener("dragover",e=>{e.preventDefault();});$("#rubric-drop-zone").addEventListener("drop",async e=>{e.preventDefault();if(e.dataTransfer.files[0])await loadRubricFile(e.dataTransfer.files[0]);else if(e.dataTransfer.getData("text/plain"))$("#rubric-source").value=e.dataTransfer.getData("text/plain");});
    importDialog.addEventListener("paste",async e=>{const file=[...(e.clipboardData?.files||[])][0];if(file){e.preventDefault();await loadRubricFile(file);}});
    $("#rubric-template-csv").addEventListener("click",()=>download("rubric-template.csv","Criterion,Points,Description,Keywords,Fact\nCorrectness,5,Meets the requirements,correct output bug,\n","text/csv;charset=utf-8"));
    $("#rubric-template-excel").addEventListener("click",()=>download("rubric-template-excel.csv","Criterion;Points;Description;Keywords;Fact\nCorrectness;5;Meets the requirements;correct output bug;\n","text/csv;charset=utf-8"));
    $("#rubric-template-json").addEventListener("click",()=>download("rubric-template.json",TG_rubricExport.toJSON(TL.templates[0]),"application/json"));
    $("#rubric-template-md").addEventListener("click",()=>download("rubric-template.md",TG_rubricExport.toMarkdown(TL.templates[0]),"text/markdown;charset=utf-8"));
    $("#rubric-read").addEventListener("click", async () => {
      const source = $("#rubric-source").value.trim(); if (!source&&!rubricImportBytes) { $("#rubric-import-status").textContent = "Paste or choose a rubric first."; return; }
      $("#rubric-import-status").textContent="Reading rubric…";
      const result = await RI.parseRubricSource({ name: $("#rubric-source").dataset.filename || "rubric.txt", text: source, bytes:rubricImportBytes });
      let final=result;if(result.needsAI&&rubricImportBytes){$("#rubric-import-status").textContent="Sending this document to the configured AI extraction service…";try{let binary="";for(let i=0;i<rubricImportBytes.length;i+=0x8000)binary+=String.fromCharCode(...rubricImportBytes.subarray(i,i+0x8000));const res=await fetch("api/rubric/extract",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:$("#rubric-source").dataset.filename,mime:$("#rubric-file").files[0]?.type||"application/octet-stream",base64:btoa(binary)})}),data=await res.json();if(!res.ok){$("#rubric-import-status").textContent=data.message||data.error||result.message;return;}final=data;}catch(_){$("#rubric-import-status").textContent="Could not reach the rubric extraction service. Your file remains loaded; try again or paste its text.";return;}}
      if (!final.ok || !final.rubric) { $("#rubric-import-status").textContent = final.message; return; }
      importedRubric = final.rubric;renderRubricPreview();$("#rubric-import-warnings").replaceChildren(...(final.warnings||[]).map(x=>h("li",{},x)));
      $("#rubric-import-status").textContent = `${final.format||"Rubric"} · ${rubricImportBytes?.length||source.length} bytes · ${final.rubric.criteria.length} criteria detected. ${final.message||"Review each criterion, then save."}`;
    });
    $("#rubric-import-title-field").addEventListener("input",syncRubricPreview);
    $("#rubric-scale-apply").addEventListener("click",()=>{if(!importedRubric?.criteria.length)return;const target=Number($("#rubric-scale").value),criteria=importedRubric.criteria;if(!(target>0&&target<=1000)){$("#rubric-import-status").textContent="Choose a total between 1 and 1000.";return;}const sum=criteria.reduce((n,c)=>n+(Number(c.max)||0),0);if(!sum){$("#rubric-import-status").textContent="Add criterion points before scaling.";return;}const before=criteria.map(c=>c.max);let used=0;criteria.forEach((c,i)=>{c.max=Math.round((before[i]/sum*target)*2)/2;used+=c.max;});const largest=criteria.reduce((best,c,i)=>c.max>criteria[best].max?i:best,0);criteria[largest].max=Math.max(.5,criteria[largest].max+(target-used));renderRubricPreview();$("#rubric-import-status").textContent=`Scaled to ${target} points; rounding remainder added to ${criteria[largest].name}.`;});
    $("#rubric-keywords-generate").addEventListener("click",()=>{if(!importedRubric)return;importedRubric.criteria.forEach(c=>{if(!(c.keywords||[]).length)c.keywords=window.TG_keywords.keywords(`${c.name} ${c.description}`);});renderRubricPreview();});
    $("#rubric-preview-add").addEventListener("click",()=>{if(!importedRubric)return;if(importedRubric.criteria.length>=12){$("#rubric-import-status").textContent="Rubrics support at most 12 criteria.";return;}importedRubric.criteria.push({id:`criterion-${importedRubric.criteria.length+1}`,name:"",max:5,description:"",keywords:[],fact:"",suggestedFact:"",confidence:"check"});renderRubricPreview();});
    function saveImportedRubric(assign){
      let parsed; try { parsed = JSON.parse($("#rubric-preview").value); } catch (_) { $("#rubric-import-status").textContent = "Preview must be valid JSON."; return; }
      const result = R.validateRubric(parsed); if (!result.ok) { $("#rubric-import-status").textContent = result.errors.join(" "); return; }
      if (assign&&graded().length && !window.confirm("Changing the rubric clears current scores and feedback. Continue?")) return;
      const saved=TL.save(state.rubricLibrary,result.rubric);state.rubricLibrary=saved.list;lastSavedImported=result.rubric;
      if(assign){const previous=rubricSnapshot(state.rubric);state.rubricSourceId=saved.item.id;state.rubric = result.rubric; state.students.forEach(s => { s.scores = null; s.feedback = ""; }); state.dismissed = []; flags = []; checked = false;logAudit("rubric-changed","Assigned imported rubric",null,previous,rubricSnapshot(state.rubric));}
      save();if(assign){importDialog.close();renderAll();say("Imported rubric saved to the library and assigned. Scores were cleared so submissions can be graded against it.");}else{$("#rubric-import-status").textContent="Rubric saved to your library. It has not been assigned to this or any other assignment.";say("Rubric saved to library.");}
    }
    $("#rubric-import-save").addEventListener("click",()=>saveImportedRubric(true));$("#rubric-import-save-library").addEventListener("click",()=>saveImportedRubric(false));
    $("#rubric-export-saved").addEventListener("click",()=>{if(!lastSavedImported){$("#rubric-import-status").textContent="Save a rubric before exporting it.";return;}download(`${lastSavedImported.title.replace(/[^a-z0-9]+/gi,"-")}.json`,TG_rubricExport.toJSON(lastSavedImported),"application/json");});
    $("#rubric-open-studio").addEventListener("click",()=>{let parsed;try{parsed=JSON.parse($("#rubric-preview").value);}catch(_){$("#rubric-import-status").textContent="Read a rubric first so its criteria can be edited.";return;}importDialog.close();openStudio(parsed,null);});
    $("#btn-sample").addEventListener("click", loadSample);
    $("#welcome-sample").addEventListener("click", loadSample);
    $("#btn-score-all").addEventListener("click", scoreAllSamples);
    $("#btn-clear").addEventListener("click", () => {
      if (state.students.length && !window.confirm("Remove all submissions, scores and feedback from this browser?")) return;
      state = { rubric: null, students: [], currentId: null, dismissed: [], tone: state.tone, privacy: state.privacy };
      flags = []; checked = false;
      save(); renderAll(); say("Everything cleared.");
    });
    $("#btn-import").addEventListener("click", () => $("#file-input").click());
    $("#btn-import-folder").addEventListener("click",()=>$("#folder-input").click());
    $("#file-input").addEventListener("change", (e) => { importFiles(e.target.files); e.target.value = ""; });
    $("#folder-input").addEventListener("change",(e)=>{importFiles(e.target.files);e.target.value="";});
    const submissionDrop=$("#submission-drop-zone");submissionDrop.addEventListener("click",()=>$("#file-input").click());submissionDrop.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){$("#file-input").click();}});submissionDrop.addEventListener("dragover",e=>{e.preventDefault();submissionDrop.classList.add("drag-over");});submissionDrop.addEventListener("dragleave",()=>submissionDrop.classList.remove("drag-over"));submissionDrop.addEventListener("drop",async e=>{e.preventDefault();submissionDrop.classList.remove("drag-over");try{const files=await droppedSubmissionFiles(e.dataTransfer.items);await importFiles(files.length?files:e.dataTransfer.files);}catch(_){showImportReport(0,[{path:"Dropped items",reason:"Could not read the dropped files or folder."}]);}});
    $("#import-report-close").addEventListener("click",()=>$("#import-report-dialog").close());
    $("#btn-check").addEventListener("click", () => { if (!state.rubric) { say("Load a sample or import submissions first."); return; } recheck(true); });
    $("#btn-analyze").addEventListener("click", () => analyze(current()));
    $("#btn-sample-notes").addEventListener("click", () => {
      const st = current();
      st.notes = st.sampleNotes; $("#notes").value = st.notes;flushTextAudit(st,"notes"); save();
      say("Sample dictation inserted. Press Ctrl+Enter to score.");
    });
    $("#btn-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("#feedback").value); say("Feedback copied."); } catch (_) { $("#feedback").select(); say("Press Ctrl+C to copy the selected feedback."); }
    });
    $("#btn-csv").addEventListener("click", () => {
      const rows = exportRows();
      if (!rows.length) { say("Grade at least one submission before exporting."); return; }
      const warned=warnFeedbackQuality(rows);
      const columns=selectedExportColumns();if(columns?.length===0){say("Select at least one CSV column in Export and backup.");return;}
      download("talkgrade-grades.csv", X.toCSV(state.rubric, rows,{preset:$("#export-preset").value||"generic",columns}), "text/csv;charset=utf-8");
      say(warned?`Grades exported. ${warned} feedback draft(s) have quality warnings; export was not blocked.`:"Grades exported.");
    });
    $("#btn-feedback").addEventListener("click", () => {
      const rows = exportRows();
      if (!rows.length) { say("Grade at least one submission before exporting."); return; }
      const warned=warnFeedbackQuality(rows);
      download("talkgrade-feedback.txt", X.feedbackBundle(state.rubric, rows), "text/plain;charset=utf-8");
      say(warned?`Feedback exported. ${warned} draft(s) have quality warnings; export was not blocked.`:"Feedback exported.");
    });
    $("#tone").addEventListener("change", (e) => { state.tone = e.target.value; save(); });
    $("#student-name").addEventListener("input",e=>{const st=current();if(st){st.name=e.target.value.slice(0,100);save();renderStudents();}});
    $("#student-id").addEventListener("input",e=>{const st=current();if(st){st.studentId=e.target.value.slice(0,100);save();}});

    $("#notes").addEventListener("input", (e) => { const st = current(); if (st) { st.notes = e.target.value; save(); } });
    $("#notes").addEventListener("blur",()=>flushTextAudit(current(),"notes"));
    $("#notes").addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); analyze(current()); } });
    $("#comment-add").addEventListener("click",addManualComment);$("#comment-close").addEventListener("click",()=>$("#comment-dialog").close());
    $("#feedback").addEventListener("input", (e) => { const st = current(); if (st) { st.feedback = e.target.value; save(); } });
    $("#feedback").addEventListener("input",()=>{const st=current();if(st)renderFeedbackQuality(st);});
    $("#feedback").addEventListener("blur",()=>flushTextAudit(current(),"feedback"));
    $("#translate-feedback").addEventListener("click",async()=>{
      const st=current(),source=String($("#feedback").value||"");
      if(!st||!source.trim()){$("#translation-status").textContent="Write feedback before translating.";return;}
      const button=$("#translate-feedback"),status=$("#translation-status"),review=$("#translation-review");
      button.disabled=true;review.hidden=true;status.textContent="Translating with Gemini…";
      try{
        const res=await fetch("api/translate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:source,language:$("#translation-language").value,tone:state.tone,privacy:{anonymise:state.privacy.anonymise,stripIdentifiers:state.privacy.stripIdentifiers,studentNames:state.students.map(x=>x.name)}})});
        const data=await res.json();if(!res.ok)throw Error(data.error||"Translation failed.");
        translationCandidate={source,text:data.text,studentId:st.id};$("#translation-original").textContent=source;$("#translation-result").textContent=data.text;review.hidden=false;status.textContent="Translation ready. Compare both versions, then choose whether to replace the draft.";
      }catch(error){status.textContent=error.message||"Translation failed. The original feedback is unchanged.";}
      finally{button.disabled=false;}
    });
    $("#translation-replace").addEventListener("click",()=>{
      const candidate=translationCandidate,st=current();if(!candidate||!st)return;
      if(st.id!==candidate.studentId||$("#feedback").value!==candidate.source){$("#translation-status").textContent="The draft changed after translation. Translate the current draft again before replacing it.";return;}
      st.feedback=candidate.text;$("#feedback").value=candidate.text;save();renderFeedbackQuality(st);flushTextAudit(st,"feedback");
      $("#translation-review").hidden=true;translationCandidate=null;$("#translation-status").textContent="Translation confirmed and placed in the feedback draft.";
    });
    $("#translation-cancel").addEventListener("click",()=>{translationCandidate=null;$("#translation-review").hidden=true;$("#translation-status").textContent="Original feedback kept.";});
    $("#feedback-quality-fix").addEventListener("click",()=>{const st=current();if(!st)return;st.feedback=FQ.applyEasyFixes(st.feedback||"");$("#feedback").value=st.feedback;save();renderFeedbackQuality(st);say("Applied all available feedback fixes. Review the draft before exporting.");});
    $("#command").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const text = e.target.value;
      e.target.value = "";
      if (state.rubric && current()) runCommand(text);
    });
    const palette=$("#command-palette"),paletteInput=$("#palette-input"),paletteOptions=$("#palette-options");
    const paletteActions=["next ungraded","next student","previous student","check consistency","undo","redo","show similarity","export csv","export zip","go to insights","go to dashboard","go to calibration","go to activity","go to export","go to settings"];
    function renderPalette(){const q=paletteInput.value.trim(),items=[...paletteActions.map(label=>({label,run:()=>runCommand(label),score:K.fuzzyScore(q,label)})),...state.students.map(s=>({label:`Open ${s.name}`,run:()=>{select(s.id);say(`Opened ${s.name}.`);},score:K.fuzzyScore(q,`Open ${s.name}`)}))].filter(x=>!q||x.score>0).sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label));paletteOptions.replaceChildren(...items.slice(0,30).map(item=>h("li",{},h("button",{type:"button",onclick:()=>{palette.close();item.run();}},item.label))));}
    function openPalette(){if(!palette.open)palette.showModal();paletteInput.value="";renderPalette();paletteInput.focus();}
    paletteInput.addEventListener("input",renderPalette);paletteInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const first=paletteOptions.querySelector("button");if(first)first.click();else{const command=paletteInput.value;palette.close();runCommand(command);}}});$("#palette-close").addEventListener("click",()=>palette.close());
    const speechToggle=$("#speech-command-enabled"),speechButton=$("#speech-command-start"),speechStatus=$("#speech-command-status"),SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    speechToggle.checked=localStorage.getItem("talkgrade-speech-commands")==="enabled";speechButton.disabled=!SpeechRecognition||!speechToggle.checked;speechToggle.disabled=!SpeechRecognition;
    speechStatus.textContent=SpeechRecognition?"Optional browser speech recognition is off until you enable it.":"Browser speech recognition is not available in this browser.";
    speechToggle.addEventListener("change",()=>{localStorage.setItem("talkgrade-speech-commands",speechToggle.checked?"enabled":"disabled");speechButton.disabled=!SpeechRecognition||!speechToggle.checked;speechStatus.textContent=speechToggle.checked?"Enabled. Start recognition when you want to dictate a command.":"Disabled.";});
    speechButton.addEventListener("click",()=>{if(!SpeechRecognition||!speechToggle.checked)return;const recognition=new SpeechRecognition();recognition.lang="en-IN";recognition.interimResults=false;recognition.maxAlternatives=1;speechStatus.textContent="Browser speech recognition is listening. TalkGrade has not sent audio to Wispr Flow.";recognition.onresult=event=>{paletteInput.value=event.results[0][0].transcript;renderPalette();speechStatus.textContent="Transcript added to the command box. Review it and press Enter to run.";paletteInput.focus();};recognition.onerror=()=>{speechStatus.textContent="Browser speech recognition could not complete. Type the command instead.";};recognition.onend=()=>{if(speechStatus.textContent.includes("listening"))speechStatus.textContent="Recognition stopped.";};recognition.start();});
    document.addEventListener("keydown", (e) => {
      const target=e.target,editing=target?.matches?.("input,textarea,select,[contenteditable=true]");
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openPalette();return;}
      if(!current())return;
      if(e.altKey&&e.key==="ArrowRight"){e.preventDefault();move(1);return;}if(e.altKey&&e.key==="ArrowLeft"){e.preventDefault();move(-1);return;}
      if(e.altKey&&e.key==="ArrowDown"){e.preventDefault();moveUngraded(1);return;}if(e.altKey&&e.key==="ArrowUp"){e.preventDefault();moveUngraded(-1);return;}
      if(!editing&&(e.key==="n"||e.key==="N")){e.preventDefault();$("#notes").focus();return;}if(!editing&&e.key==="/"){e.preventDefault();$("#command").focus();return;}
      if(!editing&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();historyAction(e.shiftKey?"redo":"undo");}
    });

    // Rubric Studio: editable criteria fields with keyboard-reorder controls.
    const studio = $("#rubric-studio-dialog");
    let studioDraft = null, studioMode = "assignment", draggedStudioIndex=-1;
    function studioErrors(){const result=TG_rubricStudio.validate({title:$("#studio-title").value,criteria:studioDraft.criteria});const box=$("#studio-errors");box.replaceChildren();$("#studio-title-error").textContent=result.errors.title.join(" ");$("#studio-title").setAttribute("aria-invalid",result.errors.title.length?"true":"false");if(result.errors.title.length)box.append(...result.errors.title.map(x=>h("li",{},x)));result.errors.criteria.forEach((row,i)=>Object.entries(row).forEach(([field,msgs])=>{const target=$(`[data-error="${i}-${field}"]`);if(target){target.textContent=msgs.join(" ");const input=$(`[data-studio="${i}-${field}"]`);if(input)input.setAttribute("aria-invalid",msgs.length?"true":"false");}}));return result;}
    function renderStudio() {
      const body=$("#studio-criteria");body.replaceChildren();
      (studioDraft.criteria||[]).forEach((c,i)=>{
        const error=(field)=>h("small",{class:"studio-field-error",id:`studio-error-${i}-${field}`,"data-error":`${i}-${field}`,role:"alert"});
        const field=(el,key)=>{el.dataset.studio=`${i}-${key}`;el.setAttribute("aria-describedby",`studio-error-${i}-${key}`);return el;};
        const id=field(h("input",{type:"text",maxlength:32,value:c.id||"","aria-label":`Criterion ${i+1} ID`}),"id");id.dataset.manualId="false";
        const name=field(h("input",{type:"text",maxlength:80,value:c.name||"","aria-label":`Criterion ${i+1} name`}),"name");
        const max=field(h("input",{type:"number",min:.5,max:100,step:.5,value:c.max??5,"aria-label":`Criterion ${i+1} maximum points`}),"max");
        const desc=field(h("textarea",{rows:2,maxlength:300,"aria-label":`Criterion ${i+1} description`},c.description||""),"description");
        const chips=h("div",{class:"keyword-chips"});const wordInput=h("input",{type:"text","aria-label":`Criterion ${i+1} add keyword`,placeholder:"Type a keyword, then Enter"});
        function drawChips(){chips.replaceChildren(...(c.keywords||[]).map((word,k)=>h("span",{class:"keyword-chip"},word,h("button",{type:"button","aria-label":`Remove keyword ${word}`,onclick:()=>{c.keywords.splice(k,1);drawChips();}},"×"))));}
        wordInput.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();const word=wordInput.value.trim().replace(/,$/,"");if(word&&!(c.keywords||[]).some(x=>x.toLowerCase()===word.toLowerCase())){if(c.keywords.length>=30){document.querySelector("[data-error='"+i+"-keywords']").textContent="Use at most 30 keywords.";return;}c.keywords.push(word);}wordInput.value="";drawChips();studioErrors();}});
        wordInput.addEventListener("blur",()=>{const word=wordInput.value.trim();if(word){if(!(c.keywords||[]).some(x=>x.toLowerCase()===word.toLowerCase())){if(c.keywords.length>=30){document.querySelector("[data-error='"+i+"-keywords']").textContent="Use at most 30 keywords.";return;}c.keywords.push(word);}wordInput.value="";drawChips();studioErrors();}});drawChips();
        const fact=field(h("select",{"aria-label":`Criterion ${i+1} fact link`}),"fact");[["","None"],["hasTests","Has tests"],["hasComments","Has comments"],["noNestedLoops","No nested loops"]].forEach(([v,l])=>fact.append(h("option",{value:v,selected:(c.fact||"")===v},l)));
        id.addEventListener("input",()=>{id.dataset.manualId="true";c.id=id.value;studioErrors();});name.addEventListener("input",()=>{c.name=name.value;if(id.dataset.manualId!=="true"){const used=studioDraft.criteria.filter((_,j)=>j!==i).map(x=>x.id);c.id=TG_rubricStudio.makeId(name.value,used);id.value=c.id;}updateStudioTotal();studioErrors();});max.addEventListener("input",()=>{c.max=max.value;updateStudioTotal();studioErrors();});desc.addEventListener("input",()=>{c.description=desc.value;studioErrors();});fact.addEventListener("change",()=>{c.fact=fact.value;c.suggestedFact="";studioErrors();});
        const moveUp=h("button",{type:"button",disabled:i===0,"aria-label":`Move ${c.name||`criterion ${i+1}`} up`,onclick:()=>{[studioDraft.criteria[i-1],studioDraft.criteria[i]]=[studioDraft.criteria[i],studioDraft.criteria[i-1]];renderStudio();}},"↑");
        const moveDown=h("button",{type:"button",disabled:i===studioDraft.criteria.length-1,"aria-label":`Move ${c.name||`criterion ${i+1}`} down`,onclick:()=>{[studioDraft.criteria[i+1],studioDraft.criteria[i]]=[studioDraft.criteria[i],studioDraft.criteria[i+1]];renderStudio();}},"↓");
        const remove=h("button",{type:"button","aria-label":`Remove ${c.name||`criterion ${i+1}`}`,onclick:()=>{studioDraft.criteria.splice(i,1);renderStudio();}},"Remove");
        const factCell=h("td",{},fact,error("fact"));if(c.suggestedFact)factCell.append(h("small",{},`Suggested: ${c.suggestedFact}. Choose it above to accept.`));
        const nameCell=h("td",{},name,error("name"),h("small",{},`Confidence: ${c.confidence||"high"}`));
        body.append(h("tr",{draggable:true,ondragstart:()=>{draggedStudioIndex=i;},ondragover:e=>e.preventDefault(),ondrop:e=>{e.preventDefault();if(draggedStudioIndex<0||draggedStudioIndex===i)return;const [row]=studioDraft.criteria.splice(draggedStudioIndex,1);studioDraft.criteria.splice(i,0,row);draggedStudioIndex=-1;renderStudio();}},h("td",{},id,error("id")),nameCell,h("td",{},max,error("max")),h("td",{},desc,error("description")),h("td",{},chips,wordInput,error("keywords")),factCell,h("td",{},moveUp,moveDown,remove)));
      });
      $("#studio-title").value=studioDraft.title||"";$("#studio-title").oninput=()=>{studioDraft.title=$("#studio-title").value;studioErrors();};$("#studio-save-library").hidden=studioMode!=="library";$("#studio-save").textContent=studioMode==="library"?"Assign to this assignment":"Save and assign";updateStudioTotal();studioErrors();
    }
    function updateStudioTotal(){const total=(studioDraft?.criteria||[]).reduce((n,c)=>n+(Number(c.max)||0),0);$("#studio-total").textContent=`${studioDraft?.criteria?.length||0} criteria · ${total} points total`;}
    function openStudio(rubric,id,mode="assignment"){studioDraft=JSON.parse(JSON.stringify(rubric||TL.templates[0]));studioDraft.id=id||null;studioMode=mode;$("#studio-errors").replaceChildren();renderStudio();studio.showModal();}
    function studioRubric(){const criteria=studioDraft.criteria.map(c=>({...c,id:String(c.id||"").trim(),name:String(c.name||"").trim(),max:Number(c.max),description:String(c.description||""),keywords:Array.isArray(c.keywords)?c.keywords:[],fact:c.fact||""}));return {title:$("#studio-title").value.trim(),criteria};}
    function saveStudioLibrary(assign){const rubric=studioRubric(),v=TG_rubricStudio.validate(rubric);if(!v.ok){studioErrors();return;}const result=R.validateRubric(rubric);if(!result.ok){say(result.errors.join(" "));return;}if(assign&&graded().length&&!window.confirm("Changing the assigned rubric clears existing scores and feedback. Continue?"))return;const saved=TL.save(state.rubricLibrary,result.rubric,studioDraft.id);state.rubricLibrary=saved.list;if(assign){const previous=rubricSnapshot(state.rubric);state.rubricSourceId=saved.item.id;state.rubric=result.rubric;state.students.forEach(s=>{s.scores=null;s.feedback="";});state.dismissed=[];flags=[];checked=false;logAudit("rubric-changed","Assigned rubric from Rubric Studio",null,previous,rubricSnapshot(state.rubric));}save();studio.close();if(assign){renderAll();say("Rubric saved to the library and assigned to this assignment.");}else{renderRubricLibrary();say("Library rubric updated. Assignment rubrics and scores were left unchanged.");}}
    $("#btn-rubric").addEventListener("click",()=>openStudio(state.rubric||window.TG_SAMPLE.rubric,state.rubricSourceId,"assignment"));
    $("#studio-close").addEventListener("click",()=>studio.close());
    $("#studio-add").addEventListener("click",()=>{if(studioDraft.criteria.length>=12){$("#studio-errors").textContent="A rubric can have at most 12 criteria.";return;}studioDraft.criteria.push({id:"",name:"",max:5,description:"",keywords:[],fact:""});renderStudio();$("#studio-criteria tr:last-child input").focus();});
    $("#studio-save-library").addEventListener("click",()=>saveStudioLibrary(false));
    $("#studio-save").addEventListener("click",()=>saveStudioLibrary(true));
    function renderRubricLibrary(){
      const q=$("#rubric-search").value.trim().toLowerCase(),user=state.rubricLibrary||[],all=TL.all(user).filter(r=>!q||r.title.toLowerCase().includes(q)||r.criteria.some(c=>`${c.name} ${(c.keywords||[]).join(" ")}`.toLowerCase().includes(q)));const box=$("#rubric-library-list");box.replaceChildren();
      all.forEach(r=>{const article=h("article",{class:"rubric-library-item"},h("h3",{},r.title),h("p",{},`${r.criteria.length} criteria · ${r.criteria.reduce((n,c)=>n+c.max,0)} points · ${r.source||"user"}`));
        article.append(h("button",{type:"button",onclick:()=>applyLibraryRubric(r)},"Assign"),h("button",{type:"button",onclick:()=>{const copy=TL.duplicate(state.rubricLibrary,r);state.rubricLibrary=copy.list;save();renderRubricLibrary();}},"Duplicate"));
        if(r.source!=="builtin")article.append(h("button",{type:"button",onclick:()=>{$("#rubric-library-dialog").close();openStudio(r,r.id,"library");}},"Edit library copy"));
        article.append(h("button",{type:"button",onclick:()=>{download(`${r.title.replace(/[^a-z0-9]+/gi,"-")}.json`,TG_rubricExport.toJSON(r),"application/json");}},"Export JSON"),h("button",{type:"button",onclick:()=>download(`${r.title}.csv`,TG_rubricExport.toCSV(r),"text/csv;charset=utf-8")},"Export CSV"),h("button",{type:"button",onclick:()=>download(`${r.title}.md`,TG_rubricExport.toMarkdown(r),"text/markdown;charset=utf-8")},"Export Markdown"));
        if(r.source!=="builtin")article.append(h("button",{type:"button",onclick:()=>{state.rubricLibrary=TL.remove(state.rubricLibrary,r.id);save();renderRubricLibrary();}},"Delete"));box.append(article);
      });
      const templates=$("#rubric-templates");templates.replaceChildren(...TL.templates.map(t=>h("button",{type:"button",onclick:()=>applyLibraryRubric(t)},`Use ${t.title}`)));
    }
    function applyLibraryRubric(r){if(graded().length&&!window.confirm("Replacing the rubric clears existing scores and feedback. Continue?"))return;const valid=R.validateRubric({title:r.title,criteria:r.criteria});if(!valid.ok){say(valid.errors.join(" "));return;}const previous=rubricSnapshot(state.rubric);state.rubric=valid.rubric;state.rubricSourceId=r.source==="builtin"?null:r.id||null;state.students.forEach(s=>{s.scores=null;s.feedback="";});state.dismissed=[];flags=[];checked=false;logAudit("rubric-changed","Assigned rubric from library",null,previous,rubricSnapshot(state.rubric));save();$("#rubric-library-dialog").close();renderAll();say(`Assigned ${r.title}.`);}
    $("#btn-rubric-library").addEventListener("click",()=>{renderRubricLibrary();$("#rubric-library-dialog").showModal();});
    $("#rubric-search").addEventListener("input",renderRubricLibrary);
    $("#rubric-library-close").addEventListener("click",()=>$("#rubric-library-dialog").close());

    // Legacy JSON editor remains available for direct rubric editing.
    const dialog = $("#rubric-dialog");
    $("#btn-rubric-json").addEventListener("click", () => {
      studio.close();
      if (!state.rubric) state.rubric = window.TG_SAMPLE.rubric;
      $("#rubric-text").value = JSON.stringify(state.rubric, null, 2);
      $("#rubric-errors").replaceChildren();
      dialog.showModal();
    });
    $("#rubric-cancel").addEventListener("click", () => dialog.close());
    $("#rubric-save").addEventListener("click", () => {
      const errors = $("#rubric-errors");
      errors.replaceChildren();
      let parsed;
      try { parsed = JSON.parse($("#rubric-text").value); } catch (_) { errors.append(h("li", {}, "That is not valid JSON.")); return; }
      const result = R.validateRubric(parsed);
      if (!result.ok) { result.errors.forEach((m) => errors.append(h("li", {}, m))); return; }
      const hasScores = graded().length > 0;
      if (hasScores && !window.confirm("Changing the rubric clears all scores and feedback. Continue?")) return;
      const previous=rubricSnapshot(state.rubric),saved=TL.save(state.rubricLibrary,result.rubric,state.rubricSourceId);state.rubricLibrary=saved.list;state.rubricSourceId=saved.item.id;
      state.rubric = result.rubric;
      state.students.forEach((s) => { s.scores = null; s.feedback = ""; });
      state.dismissed = []; flags = []; checked = false;
      logAudit("rubric-changed","Rubric edited and assigned",null,previous,rubricSnapshot(state.rubric));
      save(); dialog.close(); renderAll();
      say("Rubric saved. Score your submissions again.");
    });
  }

  async function detectEngine() {
    const badge = $("#engine");
    try {
      const res = await fetch("api/health");
      const data = await res.json();
      badge.textContent = data.engine === "gemini" ? "Engine: Gemini" : "Engine: offline rules";
      const available=data.engine==="gemini";$("#translation-language").disabled=!available;$("#translate-feedback").disabled=!available;
      $("#translation-availability").textContent=available?"Gemini is available. Translation sends feedback to Google's Gemini API.":"Translation requires Gemini AI and is disabled while offline rules are active.";
    } catch (_) {
      badge.textContent = "Engine: offline rules";
      $("#translation-language").disabled=true;$("#translate-feedback").disabled=true;$("#translation-availability").textContent="Translation availability could not be checked, so the control is disabled.";
    }
  }

  // Scripts are `defer`red, so the DOM is already parsed here.
  initializeTheme();
  document.body.classList.add("page-enter");window.setTimeout(()=>document.body.classList.remove("page-enter"),400);
  wire();
  renderAll();
  animateWelcomeOnce();
  detectEngine();
  window.TG_router?.sync();
  initializeIndexedDB();
})();
