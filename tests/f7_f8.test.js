"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const calibration=require("../public/lib/calibration.js");
const insights=require("../public/lib/insights.js");

const rubric={criteria:[{id:"tests",name:"Testing",max:10},{id:"style",name:"Style",max:5}]};

test("F7: calibration reports signed bias, agreement, QWK, and human summary",()=>{
  const submissions=[
    {id:"1",gradings:{A:{scores:{tests:{score:10},style:{score:5}}},B:{scores:{tests:{score:9},style:{score:5}}}}},
    {id:"2",gradings:{A:{scores:{tests:{score:8},style:{score:4}}},B:{scores:{tests:{score:8},style:{score:4}}}}},
    {id:"3",gradings:{A:{scores:{tests:{score:7},style:{score:3}}},B:{scores:{tests:{score:6},style:{score:3}}}}}
  ];
  const rows=calibration.compare(submissions,rubric,["A","B"]);
  const tests=rows.find(x=>x.criterionId==="tests"),style=rows.find(x=>x.criterionId==="style");
  assert.equal(tests.n,3);assert.equal(tests.bias,2/3);assert.equal(tests.mad,2/3);
  assert.equal(tests.exact,1/3);assert.equal(tests.within,1/3);
  assert.equal(tests.qwk,.8125);assert.equal(tests.label,"almost perfect");
  assert.match(tests.summary,/A scores Testing 0\.7 points higher than B/);
  assert.equal(style.qwk,1);assert.equal(style.label,"almost perfect");
  assert.equal(rows.strictness.length,2);
});

test("F7: QWK handles negative agreement",()=>{
  assert.ok(Math.abs(calibration.qwk([0,5,10],[10,5,0],10)+1)<1e-12);
  assert.equal(calibration.qwk([5,5,5],[5,5,5],10),null);
});

test("F7: fewer than three shared scores are explicitly insufficient",()=>{
  const submissions=[{id:"1",gradings:{A:{scores:{tests:{score:8}}},B:{scores:{tests:{score:7}}}}}];
  const row=calibration.compare(submissions,rubric,["A","B"])[0];
  assert.equal(row.n,1);assert.equal(row.bias,null);assert.equal(row.mad,null);assert.equal(row.exact,null);assert.equal(row.within,null);assert.equal(row.qwk,null);
});

test("F7: disagreement ordering and resolution are bounded and audited",()=>{
  const submissions=[{id:"s1",gradings:{A:{scores:{tests:{score:10}}},B:{scores:{tests:{score:4}}}}}];
  const row=calibration.compare(submissions,rubric,["A","B"],.25)[0];
  assert.equal(row.disagreements[0].difference,6);
  const resolved=calibration.resolve({submissions,submissionId:"s1",criterionId:"tests",finalScore:7,by:"instructor",rubric,audit:[]});
  assert.equal(resolved.submissions[0].gradings.consensus.scores.tests.score,7);
  assert.equal(resolved.audit[0].type,"calibration-resolved");assert.equal(resolved.audit[0].by,"instructor");assert.ok(resolved.audit[0].ts);
  assert.throws(()=>calibration.resolve({submissions,submissionId:"s1",criterionId:"tests",finalScore:11,rubric}),/valid non-negative score/);
});

test("F8: insights use per-criterion scored denominators and rank recurring issues",()=>{
  const students=[
    {id:"1",name:"Ada Lovelace",scores:{tests:{score:6,tags:["missing tests","missing tests"],reason:"Ada Lovelace forgot tests"},style:{score:4}}},
    {id:"2",name:"Grace Hopper",scores:{style:{score:5}}},
    {id:"3",name:"Linus Torvalds",scores:{tests:{score:10,inferred:true,tags:["missing tests"]}}}
  ];
  const data=insights.aggregate(students,rubric);
  const tests=data.criteria.find(x=>x.criterionId==="tests");
  assert.equal(data.gradedCount,3);assert.equal(tests.scoredCount,2);
  assert.equal(tests.lostRate,.5);assert.equal(tests.avgLoss,2);assert.equal(tests.avgScorePct,.8);
  assert.equal(data.issues.length,1);assert.equal(data.issues[0].count,1);assert.equal(data.issues[0].pct,1/3);assert.equal(data.issues[0].avgLoss,4);
  assert.doesNotMatch(data.issues[0].example,/Ada Lovelace/);
  const digest=insights.buildDigest(data);
  assert.match(digest,/What most students lost points on/);assert.match(digest,/What went well/);assert.match(digest,/Suggested focus for the next session/);
  assert.doesNotMatch(digest,/Ada Lovelace|Grace Hopper|Linus Torvalds/);
});

test("F8: empty and unscored criteria remain well-defined; identifiers are redacted",()=>{
  const data=insights.aggregate([{id:"x",name:"Student One",scores:{style:{score:4}}}],rubric);
  assert.equal(data.criteria.find(x=>x.criterionId==="tests").scoredCount,0);
  assert.equal(data.criteria.find(x=>x.criterionId==="tests").lostRate,0);
  assert.match(insights.redact("Contact ada@example.edu; learner id: ABC12345"),/an email address/);
  assert.doesNotMatch(insights.redact("Contact ada@example.edu; learner id: ABC12345"),/ada@example.edu|ABC12345/);
  const empty=insights.aggregate([],rubric);
  assert.equal(empty.gradedCount,0);assert.equal(empty.classAverage,0);assert.match(insights.buildDigest(empty),/No recurring deductions/);
});

test("F8: selected grader insights do not fall back to another grader's scores",()=>{
  const students=[
    {id:"1",scores:{tests:{score:0}},gradings:{Peer:{scores:{style:{score:5}}}}},
    {id:"2",scores:{tests:{score:2}},gradings:{Peer:{scores:{tests:{score:8}}}}}
  ];
  const data=insights.aggregate(students,rubric,"Peer");
  assert.equal(data.gradedCount,2);
  assert.equal(data.criteria.find(x=>x.criterionId==="tests").scoredCount,1);
  assert.equal(data.criteria.find(x=>x.criterionId==="tests").avgScorePct,.8);
});
