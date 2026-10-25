"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../public/lib/rubric.js");
require("../public/lib/rubric-text.js");
require("../public/lib/rubric-spoken.js");
require("../public/lib/keywords.js");
require("../public/lib/csv.js");
require("../public/lib/zip.js");
require("../public/lib/xml-lite.js");
require("../public/lib/rubric-office.js");
const importer=require("../public/lib/rubric-import.js");
const templates=require("../public/lib/templates.js");
const studio=require("../public/lib/rubric-studio.js");
const intake=require("../public/lib/submissions.js");

test("F2: built-in rubric templates have the required totals",()=>{
  assert.equal(templates.templates.length,5);
  assert.deepEqual(templates.templates.map(r=>r.criteria.reduce((n,c)=>n+c.max,0)),[20,30,20,25,20]);
});
test("F2: rubric library saves, duplicates, and removes a user's rubric",()=>{
  const first=templates.save([],templates.templates[0]);
  assert.equal(first.list.length,1);assert.equal(first.item.source,"user");
  const copy=templates.duplicate(first.list,first.item);assert.equal(copy.list.length,2);assert.match(copy.item.title,/copy$/);
  assert.equal(templates.remove(copy.list,first.item.id).length,1);
});
test("F2: Studio creates editable slug IDs and reports validation errors per field",()=>{
  assert.equal(studio.makeId("Nested Loops & Tests"),"nested-loops-tests");
  assert.equal(studio.makeId("Nested Loops & Tests",["nested-loops-tests"]),"nested-loops-tests-2");
  const check=studio.validate({title:"",criteria:[
    {id:"same id",name:"",max:0,description:"x".repeat(301),keywords:Array(31).fill("k"),fact:"unknown"},
    {id:"same id",name:"Second",max:5,description:"",keywords:[],fact:""}
  ]});
  assert.equal(check.ok,false);assert.ok(check.errors.title.length);
  assert.ok(check.errors.criteria[0].id.length);assert.ok(check.errors.criteria[0].name.length);
  assert.ok(check.errors.criteria[0].max.length);assert.ok(check.errors.criteria[0].description.length);
  assert.ok(check.errors.criteria[0].keywords.length);assert.ok(check.errors.criteria[0].fact.length);
  assert.ok(check.errors.criteria[1].id.length);
});
test("F2: editing a saved library rubric preserves an assigned rubric snapshot",()=>{
  const saved=templates.save([],templates.templates[0]);
  const assigned=structuredClone(saved.item);
  const edited=templates.save(saved.list,{title:"Edited library rubric",criteria:saved.item.criteria.map(c=>({...c,max:c.max+1}))},saved.item.id);
  assert.equal(edited.list.length,1);assert.equal(edited.list[0].title,"Edited library rubric");
  assert.equal(assigned.title,templates.templates[0].title);
  assert.equal(assigned.criteria[0].max,templates.templates[0].criteria[0].max);
  assert.notEqual(assigned.criteria,edited.list[0].criteria);
});
test("F3: imports JSON variants, quoted CSV, TSV, Markdown and spoken text",async()=>{
  const cases=[
    ["r.json",JSON.stringify({name:"Test",items:[{Criterion:"Correctness",Marks:"5",Description:"Correct output"}]})],
    ["r.csv",'Criterion,Points,Description\r\n"Correctness",5,"Output, edge cases"'],
    ["r.tsv","Criterion\tPoints\tDescription\nTesting\t3\tEdge cases"],
    ["r.md","# Web rubric\n| Criterion | Points | Description |\n|---|---:|---|\n| Accessibility | 4 | Keyboard access |"],
    ["r.txt","Correctness is worth five points, efficiency four, readability four, comments two and testing five"]
  ];
  for(const [name,text] of cases){const r=await importer.parseRubricSource({name,text});assert.equal(r.ok,true,name);assert.ok(r.rubric.criteria.length>0,name);}
  const csv=await importer.parseRubricSource({name:"x.csv",text:cases[1][1]});assert.equal(csv.rubric.criteria[0].description,"Output, edge cases");
});
test("F3: detects semicolon tables and rubric grids, and extracts level-based JSON maxima",async()=>{
  const semi=await importer.parseRubricSource({name:"export.csv",text:"Criterion;Points;Description\nTesting;4;Edge cases"});
  assert.equal(semi.ok,true);assert.equal(semi.rubric.criteria[0].name,"Testing");assert.equal(semi.rubric.criteria[0].max,4);
  const grid=importer.parseRows([["Criterion","Excellent (5)","Good (3)","Poor (0)"],["Testing","Thorough tests","Some tests","No tests"]],"Grid");
  assert.equal(grid.criteria[0].max,5);assert.match(grid.criteria[0].description,/excellent: Thorough tests/i);assert.match(grid.criteria[0].description,/poor: No tests/i);
  const levels=await importer.parseRubricSource({name:"levels.json",text:JSON.stringify({title:"Levels",criteria:[{name:"Analysis",levels:[{points:5,description:"Insightful"},{points:2,description:"Basic"}]}]})});
  assert.equal(levels.rubric.criteria[0].max,5);assert.match(levels.rubric.criteria[0].description,/Insightful/);
});
test("F3: importer reports defaulted points, duplicate names, inconsistent totals, and row cap",()=>{
  const parsed=importer.finalizeDraft({title:"Review",total:50,criteria:[{name:"Testing",max:4},{name:"testing",max:3},{name:"No points"},...Array.from({length:11},(_,i)=>({name:`Extra ${i}`,max:1}))]},"r.csv");
  assert.ok(parsed.rubric.criteria.length<=12);assert.ok(parsed.warnings.some(x=>/Duplicate criterion/i.test(x)));assert.ok(parsed.warnings.some(x=>/no points/i.test(x)));assert.ok(parsed.warnings.some(x=>/ignored/i.test(x)));assert.ok(parsed.warnings.some(x=>/Stated total/i.test(x)));
});
test("F3: reads generated DOCX and XLSX archives using the bundled ZIP/XML readers",async()=>{
  const zip=globalThis.TG_zip;
  const docx=zip.writeZip([{path:"word/document.xml",text:'<w:document xmlns:w="w"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Criterion</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Points</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Testing</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>4</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'}]);
  const word=await importer.parseRubricSource({name:"rubric.docx",bytes:docx});assert.equal(word.ok,true);assert.equal(word.rubric.criteria[0].name,"Testing");
  const xlsx=zip.writeZip([
    {path:"xl/workbook.xml",text:'<workbook xmlns:r="r"><sheets><sheet name="Rubric" r:id="rId1"/></sheets></workbook>'},
    {path:"xl/_rels/workbook.xml.rels",text:'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'},
    {path:"xl/worksheets/sheet1.xml",text:'<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Criterion</t></is></c><c r="B1" t="inlineStr"><is><t>Points</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Correctness</t></is></c><c r="B2"><v>5</v></c></row></sheetData></worksheet>'}
  ]);
  const excel=await importer.parseRubricSource({name:"rubric.xlsx",bytes:xlsx});assert.equal(excel.ok,true);assert.equal(excel.rubric.criteria[0].name,"Correctness");
});
test("F4: imports independent files, groups a student's folder, and preserves student IDs",()=>{
  const result=intake.ingest([
    {path:"one.py",text:"print(1)"},
    {path:"Course/Ada/main.py",group:"Ada",text:"print(2)"},
    {path:"Course/Ada/test.py",group:"Ada",text:"assert True"},
    {path:"roster.json",text:JSON.stringify([{name:"Grace",studentId:"g7",code:"print(7)"}])}
  ]);
  assert.equal(result.submissions.length,3);assert.equal(result.submissions.find(x=>x.name==="Ada").files.length,2);assert.equal(result.submissions.find(x=>x.name==="Grace").studentId,"g7");assert.equal(result.skipped.length,0);
});
test("F4: reports oversized, binary, unsafe, and excess submission input",()=>{
  const large="x".repeat(intake.MAX_FILE+1),result=intake.ingest([
    {path:"large.py",text:large},{path:"bad/../escape.py",text:"x"},{path:"image.png",text:"abc"},{path:"binary.bin",bytes:new Uint8Array([0,1,2])}
  ]);
  assert.equal(result.submissions.length,0);assert.equal(result.skipped.length,4);
  const capped=intake.ingest([{path:"a.py",text:"x"},{path:"b.py",text:"x"}],{existingCount:499});assert.equal(capped.submissions.length,1);assert.equal(capped.skipped.length,1);
});
test("F4: accepts multi-file JSON rosters above the per-code-file limit and retains student IDs",()=>{
  const code="x".repeat(110*1024),roster=JSON.stringify([{name:"Ada",studentId:"s-1",files:[{path:"main.py",code},{path:"test.py",code}]},{name:"Grace",code}]);
  assert.ok(new TextEncoder().encode(roster).length>intake.MAX_FILE);
  const result=intake.ingest([{path:"roster.json",text:roster}]);assert.equal(result.submissions.length,2);assert.equal(result.submissions[0].files.length,2);assert.equal(result.submissions[0].studentId,"s-1");assert.equal(result.skipped.length,0);
});
test("F4: enforces the 2 MB per-student limit and catches binary control bytes",()=>{
  const tooLarge=Array.from({length:11},(_,i)=>({path:`Ada/f${i}.py`,text:"x".repeat(intake.MAX_FILE)}));
  const result=intake.ingest([...tooLarge,{path:"bad.bin",text:"abc\u0001\u0002\u0003\u0004\u0005"}]);
  assert.equal(result.submissions.length,0);assert.ok(result.skipped.some(x=>/2 MB/.test(x.reason)));assert.ok(result.skipped.some(x=>/binary/.test(x.reason)));
});
test("F4: groups ZIP root folders, per-student folders, and flat student files safely",()=>{
  const bytes=text=>new TextEncoder().encode(text);
  const nested=intake.fromArchive([
    {path:"Course/Ada/main.py",getBytes:()=>bytes("a")},{path:"Course/Ada/test.py",getBytes:()=>bytes("t")},{path:"Course/Bea/main.py",getBytes:()=>bytes("b")}
  ]),grouped=intake.ingest(nested);
  assert.equal(grouped.submissions.length,2);assert.equal(grouped.submissions.find(x=>x.name==="Ada").files.length,2);
  const singleStudent=intake.ingest(intake.fromArchive([{path:"Ada/main.py",getBytes:()=>bytes("a")},{path:"Ada/test.py",getBytes:()=>bytes("t")} ]));
  assert.equal(singleStudent.submissions.length,1);assert.equal(singleStudent.submissions[0].name,"Ada");
  const flat=intake.ingest(intake.fromArchive([{path:"Course/ada.py",getBytes:()=>bytes("a")},{path:"Course/bea.py",getBytes:()=>bytes("b")} ]));
  assert.equal(flat.submissions.length,2);assert.deepEqual(flat.submissions.map(x=>x.name),["ada","bea"]);
});
