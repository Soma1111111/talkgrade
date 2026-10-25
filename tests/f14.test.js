"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createServer}=require("../server.js");
const {translate,validate,MAX_TEXT}=require("../src/translate.js");

function start(opts){const server=createServer(opts);return new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve({server,base:`http://127.0.0.1:${server.address().port}`})));}
const request=(base,body)=>fetch(base+"/api/translate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});

test("F14: all supported languages validate and bad or oversized requests are rejected",()=>{
 for(const language of ["hi","hinglish","bn","ta","te","mr","kn"])assert.equal(validate({text:"Score: 8/10",language}).error,undefined);
 assert.match(validate({text:"Hello",language:"fr"}).error,/Choose/);
 assert.match(validate({text:" ",language:"hi"}).error,/required/);
 assert.match(validate({text:"x".repeat(MAX_TEXT+1),language:"hi"}).error,/too long/);
});

test("F14: offline endpoint explains translation is unavailable",async()=>{
 const app=await start({env:{}});
 try{const response=await request(app.base,{text:"Good work. Score: 8/10",language:"hi"});assert.equal(response.status,501);assert.match((await response.json()).error,/unavailable offline/);}
 finally{app.server.close();}
});

test("F14: Gemini translation follows the target-language and preservation prompt, with privacy redaction",async()=>{
 let call;
 const fetchImpl=async(url,init)=>{call={url,init,body:JSON.parse(init.body)};const prompt=call.body.contents[0].parts[0].text,markers=prompt.match(/\[\[TG_[a-f0-9]+_\d+\]\]/g)||[];return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:`अच्छा काम, ${markers[0]}। Score: ${markers[1]}/${markers[2]}; ${markers[3]} जोड़ें। Reach ${markers[4]} or ${markers[5]}.`}]}}]})};};
 const result=await translate({text:"Good work, Bhavna. Score: 8/10; add `parseInput`. Reach student_id: abc-123 or bhavna@example.edu.",language:"hi",tone:"warm",privacy:{anonymise:true,stripIdentifiers:true,studentNames:["Bhavna"]}},{GEMINI_API_KEY:"test",GEMINI_MODEL:"translate-test"},{fetchImpl});
 assert.equal(result.status,200, result.body.error);assert.equal(result.body.engine,"gemini");assert.match(result.body.text,/Bhavna/);assert.match(result.body.text,/Score: 8\/10/);assert.match(result.body.text,/`parseInput`/);
 assert.equal(call.url,"https://generativelanguage.googleapis.com/v1beta/models/translate-test:generateContent");
 assert.match(call.body.contents[0].parts[0].text,/Hindi/);assert.match(call.body.contents[0].parts[0].text,/Preserve every number, score/);assert.doesNotMatch(call.body.contents[0].parts[0].text,/Bhavna|abc-123|bhavna@example\.edu/);
 assert.doesNotMatch(call.body.contents[0].parts[0].text,/Bhavna|abc-123|bhavna@example\.edu/);
 assert.equal(call.init.headers["x-goog-api-key"],"test");
});

test("F14: route validates media type and language and does not replace source on AI failure",async()=>{
 const app=await start({env:{GEMINI_API_KEY:"test"},fetchImpl:async()=>({ok:false,status:503,json:async()=>({})})});
 try{
  const unsupported=await request(app.base,{text:"Feedback",language:"fr"});assert.equal(unsupported.status,400);
  const wrongType=await fetch(app.base+"/api/translate",{method:"POST",headers:{"content-type":"text/plain"},body:"{}"});assert.equal(wrongType.status,415);
  const failed=await request(app.base,{text:"Original. Score: 8/10",language:"ta"});assert.equal(failed.status,502);assert.match((await failed.json()).error,/original feedback is unchanged/);
 }finally{app.server.close();}
});

test("F14: interface offers all languages, offline explanation, side-by-side review and explicit replacement",async()=>{
 const html=require("node:fs").readFileSync(require("node:path").join(__dirname,"../public/index.html"),"utf8");
 const app=require("node:fs").readFileSync(require("node:path").join(__dirname,"../public/app.js"),"utf8");
 for(const code of ["hi","hinglish","bn","ta","te","mr","kn"])assert.match(html,new RegExp(`value="${code}"`));
 assert.match(html,/translation-availability[\s\S]*?translation-result/);assert.match(app,/Translation requires Gemini AI[\s\S]*?disabled/);
 assert.match(app,/translationCandidate=\{source,text:data\.text,studentId:st\.id\}/);assert.match(app,/translation-replace/);assert.match(app,/draft changed after translation/);
});
