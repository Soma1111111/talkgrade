"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const F1 = require("../public/lib/courses.js");

const rubric = { title: "Code", criteria: [{ id: "correctness", name: "Correctness", max: 5 }] };
function base() { return { rubric, students: [], currentId: null, dismissed: [], tone: "warm", courses: [], assignments: [] }; }

test("F1: courses can be created, renamed and archived/restored", () => {
  let state = F1.createCourse(base(), "  CS 101  ");
  const id = state.courseId;
  assert.equal(state.courses.length, 1);
  assert.equal(state.courses[0].name, "CS 101");
  state = F1.renameCourse(state, id, "Programming 101");
  assert.equal(state.courses[0].name, "Programming 101");
  state = F1.toggleCourseArchive(state, id);
  assert.equal(state.courses[0].archived, true);
  state = F1.toggleCourseArchive(state, id);
  assert.equal(state.courses[0].archived, false);
  assert.throws(() => F1.createCourse(state, "  "), /required/);
});

test("F1: assignments support due dates, settings overrides, rename and validation", () => {
  let state = F1.createCourse(base(), "Databases");
  state = F1.createAssignment(state, { title: "Lab 1", rubric });
  const id = state.assignmentId;
  const updated = F1.updateAssignment(state, id, {
    title: "Query lab", dueDate: "2026-11-01", tolerance: 0.4,
    driftTolerance: 0.5, minPeers: 3
  });
  assert.deepEqual(updated.errors, []);
  assert.equal(updated.assignmentTitle, "Query lab");
  assert.equal(updated.dueDate, "2026-11-01");
  assert.deepEqual(updated.assignments[0].settings.consistency, { tolerance: 0.4, driftTolerance: 0.5, minPeers: 3 });
  const invalid = F1.validateAssignmentDetails({ title: "", dueDate: "tomorrow", tolerance: 9, driftTolerance: 0, minPeers: 9 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.length, 5);
});

test("F1: assignment switching snapshots edits and restores independent state", () => {
  let state = F1.createCourse(base(), "Algorithms");
  state = F1.createAssignment(state, { title: "A", rubric });
  const a = state.assignmentId;
  state.students = [{ id: "s1", name: "Ada", notes: "line 2 is wrong", scores: { correctness: { score: 3 } } }];
  state = F1.createAssignment(state, { title: "B", rubric });
  const b = state.assignmentId;
  assert.equal(state.students.length, 0);
  state = F1.switchAssignment(state, a);
  assert.equal(state.students[0].notes, "line 2 is wrong");
  assert.equal(state.students[0].scores.correctness.score, 3);
  state.students[0].notes = "edited after switch";
  state = F1.switchAssignment(state, b);
  state = F1.switchAssignment(state, a);
  assert.equal(state.students[0].notes, "edited after switch");
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(F1.switchAssignment(restored, b).assignmentTitle, "B");
});

test("F1: archive preserves records; deleting assignment or course cascades submissions", () => {
  let state = F1.createCourse(base(), "Networks");
  const courseId = state.courseId;
  state = F1.createAssignment(state, { title: "Packet lab", rubric });
  const assignmentId = state.assignmentId;
  state.students = [{ id: "student-1", code: "print(1)" }];
  state = F1.snapshot(state);
  state = F1.toggleAssignmentArchive(state, assignmentId);
  assert.equal(state.assignments[0].archived, true);
  assert.equal(state.assignments[0].students.length, 1);
  state = F1.toggleAssignmentArchive(state, assignmentId);
  state = F1.deleteAssignment(state, assignmentId);
  assert.equal(state.assignments.length, 0);
  state = F1.createAssignment(state, { title: "Second lab", rubric, courseId });
  state.students = [{ id: "student-2" }];
  state = F1.snapshot(state);
  state = F1.deleteCourse(state, courseId);
  assert.equal(state.courses.length, 0);
  assert.equal(state.assignments.length, 0);
});

test("F1: v1 local state migrates into a course and assignment snapshot", () => {
  const old = { rubric, students: [{ id: "old", name: "Grace" }], currentId: "old", tone: "direct" };
  const migrated = F1.migrate(old);
  assert.equal(migrated.courses.length, 1);
  assert.equal(migrated.assignments.length, 1);
  assert.equal(migrated.assignments[0].title, "Imported assignment");
  assert.equal(migrated.assignments[0].students[0].id, "old");
  assert.equal(migrated.assignments[0].tone, "direct");
});
