"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../public/lib/ids.js");
require("../public/lib/rubric.js");
require("../public/lib/zip.js");
const rubric={title:"Lab",criteria:[{id:"tests",name:"Tests",max:5},{id:"style",name:"Style",max:5}]};
const exportLib=require("../public/lib/export.js");
const backupLib=require("../public/lib/course-backup.js");

test("F13: selected gradebook columns and Moodle-style preset are formula safe",()=>{
  const rows=[{name:"=cmd",studentId:"+123",scores:{tests:{score:4},style:{score:5}},feedback:"@student"}];
  const generic=exportLib.toCSV(rubric,rows,{columns:["name","criterion:tests","total","percent","feedback"]});
  assert.match(generic,/^Student,Tests \(\/5\),Total,Percent,Feedback/m);
  assert.match(generic,/^'=cmd,4,9,90,'@student/m);
  const moodle=exportLib.toCSV(rubric,rows,{preset:"moodle"});
  assert.match(moodle,/Identifier,Full name,Grade,Maximum grade,Feedback comments/);
  assert.match(moodle,/'@student/);
});

test("F13: feedback ZIP contains per-student Markdown and text with safe unique filenames",async()=>{
  const entries=exportLib.feedbackZipFiles(rubric,[
    {name:"Ada/One",scores:{tests:{score:4},style:{score:5}},feedback:"Add edge tests."},
    {name:"Ada/One",scores:{tests:{score:3},style:{score:4}},feedback:"Try another case."}
  ]);
  assert.deepEqual(entries.map(x=>x.path),["Ada_One.md","Ada_One.txt","Ada_One-2.md","Ada_One-2.txt"]);
  const zip=globalThis.TG_zip.writeZip(entries),files=await globalThis.TG_zip.readZip(zip);
  assert.equal(files.length,4);
  const markdown=new TextDecoder().decode(files.find(x=>x.path==="Ada_One.md").getBytes());
  assert.match(markdown,/Score breakdown/);assert.match(markdown,/Add edge tests\./);
});

test("F13: course backup exports full course state and restores as an independent copy",()=>{
  const source={courses:[{id:"c1",name:"Algorithms",archived:false}],courseId:"c1",courseName:"Algorithms",assignments:[{id:"a1",courseId:"c1",title:"Lab 1",rubric,students:[{id:"s1",name:"Ada",studentId:"id1",scores:{tests:{score:4}},feedback:"Good work."},{id:"s2",name:"Grace",scores:{tests:{score:3}},feedback:"Try tests."}],dismissed:["flag:s1"],auditLog:[{type:"score-edited",submissionId:"s1",studentIds:["s1"],changes:[{studentId:"s2"}]}],similarityReviews:[{pairKey:"s1::s2",review:"not concern"}]}]};
  const dump=backupLib.exportCourse(source,"c1");assert.equal(dump.format,"talkgrade-course-backup");assert.equal(dump.assignments[0].students.length,2);
  const restored=backupLib.restoreCourse(source,dump),copy=restored.assignments[1];
  assert.notEqual(restored.courses[1].id,"c1");assert.notEqual(copy.id,"a1");assert.equal(copy.courseId,restored.courses[1].id);
  assert.notEqual(copy.students[0].id,"s1");assert.equal(copy.auditLog[0].submissionId,copy.students[0].id);
  assert.equal(copy.auditLog[0].changes[0].studentId,copy.students[1].id);
  assert.equal(copy.students[0].feedback,"Good work.");assert.equal(source.courses.length,1);
  assert.throws(()=>backupLib.validateBackup({format:"wrong",version:1}),/supported TalkGrade/);
});
