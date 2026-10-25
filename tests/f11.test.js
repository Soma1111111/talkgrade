"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const quality=require("../public/lib/feedback-quality.js");

test("F11: quality checker reports all required finding types and score labels",()=>{
  const feedback="TERRIBLE AWFUL USELESS!!!! This is an idiot result, minus 2 points off. TODO ??? Asha did better. You should add tests.";
  const result=quality.analyze(feedback,["Asha"]);
  const ids=new Set(result.findings.map(item=>item.id));
  for(const id of ["short","harsh-words","shouting","exclamations","arithmetic","placeholder","other-student","no-score"])assert.ok(ids.has(id),`expected ${id}`);
  assert.ok(result.score>=0&&result.score<=100);
  assert.equal(result.label,result.score>=80?"Good":result.score>=60?"Okay":"Needs work");
  assert.ok(result.findings.filter(x=>x.id==="harsh-words").length<=3);
});

test("F11: next-step and positive-feedback rules use language cues",()=>{
  assert.ok(quality.analyze("The output is correct.").findings.some(x=>x.id==="no-next-step"));
  const positive=quality.analyze("The output is clear and correct. Next time, consider adding two edge-case tests. Score: 9/10.");
  assert.ok(!positive.findings.some(x=>x.id==="all-negative"));
  assert.ok(!positive.findings.some(x=>x.id==="no-next-step"));
});

test("F11: easy fixes are cumulative and leave non-fixable findings intact",()=>{
  const input="TERRIBLE AWFUL USELESS!!!! minus 2 points off. TODO ???";
  const fixed=quality.applyEasyFixes(input);
  assert.doesNotMatch(fixed,/TERRIBLE|AWFUL|USELESS|minus|points off/);
  assert.ok((fixed.match(/!/g)||[]).length<=3);
  assert.match(fixed,/Score:/);
  assert.match(fixed,/TODO/);
  assert.ok(quality.analyze(fixed).findings.some(x=>x.id==="placeholder"));
});
