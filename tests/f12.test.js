"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const audit=require("../public/lib/audit.js");
const undo=require("../public/lib/undo.js");

test("F12: audit recording is immutable, timestamps events, and caps oldest entries with a warning",()=>{
  const input=[{type:"old",ts:"2026-01-01T00:00:00.000Z"}],warnings=[];
  const result=audit.record(input,{type:"new"},1,warning=>warnings.push(warning));
  assert.equal(input.length,1);assert.equal(result.length,1);assert.equal(result[0].type,"new");
  assert.ok(result[0].ts);assert.equal(warnings.length,1);assert.equal(warnings[0].removed,1);assert.equal(warnings[0].limit,1);
});

test("F12: undo stack caps at 50, redo restores state, and a new edit clears redo",()=>{
  let stack=undo.create(50),state=0;
  for(let next=1;next<=51;next++)stack=undo.push(stack,{label:`score ${next}`,revert:()=>next-1,apply:()=>next});
  assert.equal(stack.past.length,50);
  const undone=undo.undo(stack,state);assert.equal(undone.label,"score 51");assert.equal(undone.state,50);
  const redone=undo.redo(undone.stack,undone.state);assert.equal(redone.label,"score 51");assert.equal(redone.state,51);
  const branched=undo.push(undone.stack,{label:"new comment",revert:()=>49,apply:()=>52});
  assert.equal(branched.future.length,0);
  assert.equal(undo.redo(branched,50).label,null);
});
