"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {DatabaseSync}=require("node:sqlite");
const {createServer}=require("../server.js");
const commands=require("../public/lib/commands.js");

test("F15: extended command parser and fuzzy palette search cover required actions",()=>{
 assert.deepEqual(commands.parseCommand("comment on line 12: handle empty input",null),{type:"comment",from:12,to:12,text:"handle empty input"});
 assert.deepEqual(commands.parseCommand("undo",null),{type:"undo"});assert.deepEqual(commands.parseCommand("redo",null),{type:"redo"});
 assert.deepEqual(commands.parseCommand("open Bhavna",null),{type:"open",query:"Bhavna"});assert.deepEqual(commands.parseCommand("go to insights",null),{type:"view",view:"insights"});
 assert.deepEqual(commands.parseCommand("export csv",null),{type:"export",format:"csv"});assert.deepEqual(commands.parseCommand("export zip",null),{type:"export",format:"zip"});
 assert.deepEqual(commands.parseCommand("show similarity",null),{type:"view",view:"similarity"});assert.deepEqual(commands.parseCommand("next ungraded",null),{type:"next-ungraded"});
 assert.ok(commands.fuzzyScore("opn bhvna","Open Bhavna")>0);assert.ok(commands.fuzzyScore("dashboard","go to dashboard")>0);
 const app=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8"),html=fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
 assert.match(app,/SpeechRecognition\|\|window\.webkitSpeechRecognition/);assert.match(app,/talkgrade-speech-commands/);assert.match(app,/export-feedback-zip/);assert.match(html,/Wispr Flow/);
});

function start(){const teamDb=new DatabaseSync(":memory:"),server=createServer({env:{TEAM_MODE:"1",COOKIE_SECURE:"0"},teamDb});return new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve({server,base:`http://127.0.0.1:${server.address().port}`})));}
async function call(base,pathName,{method="GET",body,cookie}={}){const headers={};if(body!==undefined)headers["content-type"]="application/json";if(cookie)headers.cookie=cookie;if(["POST","PUT","PATCH","DELETE"].includes(method))headers["x-tg-csrf"]="1";const response=await fetch(base+pathName,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});let data={};try{data=await response.json()}catch(_){}return {response,data,cookie:response.headers.get("set-cookie")?.split(";")[0]||cookie};}
async function register(base,email,name){const result=await call(base,"/api/auth/register",{method:"POST",body:{email,name,password:"strong-password-123"}});assert.equal(result.response.status,201);return result.cookie;}

test("F17: team accounts, roles, shared grading, audit attribution and feedback links work in UI-enabled API mode",async()=>{
 const app=await start();
 try{
  assert.equal((await call(app.base,"/api/health")).data.teamMode,true);
  assert.equal((await fetch(app.base+"/team.html")).status,200);
  const owner=await register(app.base,"owner@example.test","Owner"),grader=await register(app.base,"grader@example.test","Grader"),viewer=await register(app.base,"viewer@example.test","Viewer");
  const created=await call(app.base,"/api/courses",{method:"POST",cookie:owner,body:{name:"Shared class"}});assert.equal(created.response.status,201);const courseId=created.data.course.id;
  const member=await call(app.base,`/api/courses/${courseId}/members`,{method:"POST",cookie:owner,body:{email:"grader@example.test",role:"grader"}});assert.equal(member.data.member.role,"grader");
  await call(app.base,`/api/courses/${courseId}/members`,{method:"POST",cookie:owner,body:{email:"viewer@example.test",role:"viewer"}});
  assert.equal((await call(app.base,`/api/courses/${courseId}/members`,{cookie:grader})).data.members.length,3);
  assert.equal((await call(app.base,`/api/courses/${courseId}/members`,{method:"POST",cookie:grader,body:{email:"viewer@example.test",role:"grader"}})).response.status,403);
  const assignment=await call(app.base,`/api/courses/${courseId}/assignments`,{method:"POST",cookie:owner,body:{title:"Loops",rubric:{title:"Rubric",criteria:[{id:"correctness",name:"Correctness",max:10}]}}});const assignmentId=assignment.data.assignment.id;
  const submissions=await call(app.base,`/api/assignments/${assignmentId}/submissions`,{method:"POST",cookie:owner,body:{submissions:[{name:"Student A",files:[{path:"main.py",text:"print(1)"}]}]}});const submissionId=submissions.data.submissions[0].id;
  const grade=await call(app.base,`/api/submissions/${submissionId}/grading`,{method:"PUT",cookie:grader,body:{scores:{correctness:{score:8}},feedback:"Good work.",engine:"heuristic"}});assert.equal(grade.response.status,200);
  const shared=await call(app.base,`/api/assignments/${assignmentId}/submissions`,{cookie:owner});assert.equal(shared.data.submissions[0].gradings[0].grader,"Grader");assert.equal(shared.data.submissions[0].gradings[0].scores.correctness.score,8);
  const events=await call(app.base,`/api/audit?submission=${submissionId}`,{cookie:owner});assert.ok(events.data.events.some(e=>e.type==="grading-updated"));
  assert.equal((await call(app.base,`/api/assignments/${assignmentId}/submissions`,{cookie:viewer})).response.status,200);
  const ownerId=(await call(app.base,"/api/auth/me",{cookie:owner})).data.user.id,viewerId=(await call(app.base,"/api/auth/me",{cookie:viewer})).data.user.id;
  assert.equal((await call(app.base,`/api/courses/${courseId}/members/${ownerId}`,{method:"DELETE",cookie:owner})).response.status,400);
  assert.equal((await call(app.base,`/api/courses/${courseId}/members`,{method:"POST",cookie:owner,body:{email:"owner@example.test",role:"viewer"}})).response.status,400);
  const link=await call(app.base,"/api/student-links",{method:"POST",cookie:grader,body:{submissionId,ttlDays:14}});assert.equal(link.response.status,201);assert.equal(Buffer.from(link.data.url.split("/").pop(),"base64url").length,16);
  const token=link.data.url.split("/").pop(),feedback=await call(app.base,`/api/student/${token}`);assert.equal(feedback.response.status,200);assert.equal(feedback.data.scores.correctness.score,8);
  const listed=await call(app.base,`/api/student-links?submissionId=${submissionId}`,{cookie:owner});assert.equal(listed.data.links[0].id,link.data.id);
  assert.equal((await call(app.base,`/api/student-links/${link.data.id}`,{method:"DELETE",cookie:owner})).response.status,200);
  assert.equal((await call(app.base,`/api/student/${token}`)).response.status,404);
  assert.equal((await call(app.base,`/api/courses/${courseId}/members/${viewerId}`,{method:"DELETE",cookie:owner})).response.status,200);
 }finally{app.server.close();}
});
