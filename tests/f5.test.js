"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const refs=require("../public/lib/linerefs.js");
const undo=require("../public/lib/undo.js");
const commands=require("../public/lib/commands.js");

test("F5: line references recognize numeric, spoken, range, and short forms",()=>{
  const found=refs.extractLineRefs("line 12, lines 3 through 5, lines 7-8, on line twelve, L12, ln 9, line one hundred twenty");
  assert.deepEqual(found.map(({from,to})=>[from,to]),[[12,12],[3,5],[7,8],[12,12],[12,12],[9,9],[120,120]]);
  assert.deepEqual(refs.extractLineRefs("L999").map(x=>x.from),[999]);
});
test("F5: spoken notes become comments with reference wording removed",()=>{
  const comments=refs.splitNotesIntoComments("On line twelve, tests are missing. Lines 3 to 5 are readable.");
  assert.deepEqual(comments.map(c=>[c.from,c.to]),[[12,12],[3,5]]);
  assert.match(comments[0].text,/tests are missing/i);assert.doesNotMatch(comments[0].text,/line twelve/i);
});
test("F5: workspace commands expose ungraded navigation, line comments, and history",()=>{
  assert.equal(commands.parseCommand("next ungraded").type,"next-ungraded");
  assert.deepEqual(commands.parseCommand("comment on lines 3 to 5: missing edge case"),{type:"comment",from:3,to:5,text:"missing edge case"});
  assert.equal(commands.parseCommand("undo").type,"undo");assert.equal(commands.parseCommand("redo").type,"redo");
});
test("F5: undo and redo retain independent before and after snapshots",()=>{
  const before={score:2,comments:[]},after={score:1,comments:["line comment"]};let stack=undo.create(50);
  stack=undo.push(stack,{label:"score and comment",revert:()=>structuredClone(before),apply:()=>structuredClone(after)});
  const back=undo.undo(stack,null);assert.deepEqual(back.state,before);const forward=undo.redo(back.stack,null);assert.deepEqual(forward.state,after);
});
