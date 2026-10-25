"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../public/lib/rubric.js");
const F = require("../public/lib/facts.js");
const H = require("../public/lib/heuristic.js");
const C = require("../public/lib/consistency.js");
const S = require("../public/data/sample.js");

const rubric = R.validateRubric(S.rubric).rubric;
const score = (notes, id) => H.analyze({ rubric, notes, student: "T" }).scores[id];

test("heuristic: explicit deductions, spoken numbers and half points", () => {
  assert.equal(score("No tests, deduct 2.", "testing").score, 3);
  assert.equal(score("No tests, minus two.", "testing").score, 3);
  assert.equal(score("No tests, only half a point off.", "testing").score, 4.5);
  assert.equal(score("Testing is 3 out of 5.", "testing").score, 3);
  assert.equal(score("I'd give the tests a 4.", "testing").score, 4);
});

test("heuristic: negative without a number costs a quarter, praise keeps full marks", () => {
  assert.equal(score("The naming is messy.", "style").score, 3);
  assert.equal(score("Tests cover the edge cases nicely.", "testing").score, 5);
  assert.equal(score("Tests cover the edge cases nicely.", "testing").sentiment, 1);
});

test("heuristic: unmentioned criteria get full marks and are marked inferred", () => {
  const s = score("Correct output.", "testing");
  assert.equal(s.score, 5);
  assert.equal(s.inferred, true);
});

test("heuristic: 'no bugs' is praise, and 'but' splits clauses", () => {
  assert.equal(score("No bugs that I could find.", "correctness").sentiment, 1);
  const s = score("Handles punctuation but breaks on uppercase words, a bug, deduct 1.", "correctness");
  assert.equal(s.score, 4);
  assert.equal(s.sentiment, -1);
  assert.deepEqual(s.tags, ["bug"]);
});

test("heuristic: feedback is student-facing and hides deduction arithmetic", () => {
  const out = H.analyze({ rubric, notes: S.students[3].sampleNotes, student: "Divya", tone: "warm" });
  assert.match(out.feedback, /^Hi Divya,/);
  assert.doesNotMatch(out.feedback, /minus|deduct/i);
  assert.match(out.feedback, /Score: 18\.5\/20/);
  assert.match(H.analyze({ rubric, notes: "Good.", student: "", tone: "direct" }).feedback, /^Feedback/);
});

function gradeSample() {
  return S.students.map((s) => ({
    id: s.id, name: s.name, facts: F.extractFacts(s.code),
    scores: H.analyze({ rubric, notes: s.sampleNotes, student: s.name }).scores
  }));
}

test("consistency: the sample batch produces exactly the three designed flags", () => {
  const flags = C.check({ rubric, entries: gradeSample() });
  assert.deepEqual(flags.map((f) => f.kind).sort(), ["drift", "fact-lenient", "tag-variance"]);
  const lenient = flags.find((f) => f.kind === "fact-lenient");
  assert.equal(lenient.studentIds[0], "s3");
  assert.equal(lenient.criterionId, "testing");
  assert.equal(lenient.suggestions[0].score, 3.5);
  const variance = flags.find((f) => f.kind === "tag-variance");
  assert.deepEqual(variance.suggestions.map((x) => [x.studentId, x.score]), [["s4", 3]]);
  assert.equal(flags[0].severity, "high");
});

test("consistency: needs enough peers before blaming an outlier", () => {
  const two = gradeSample().filter((e) => ["s2", "s3"].includes(e.id));
  assert.equal(C.check({ rubric, entries: two }).filter((f) => f.kind === "fact-lenient").length, 0);
});

test("consistency: notes/score mismatch is flagged", () => {
  const entries = gradeSample().slice(0, 2);
  entries[0].scores.testing = { score: 5, sentiment: -1, tags: [], inferred: false };
  entries[1].scores.style = { score: 1, sentiment: 1, tags: [], inferred: false };
  const kinds = C.check({ rubric, entries }).map((f) => f.kind);
  assert.ok(kinds.includes("noted-no-deduction"));
  assert.ok(kinds.includes("praise-low-score"));
});

test("consistency: evenly graded identical work raises nothing", () => {
  const same = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    id, name: id, facts: { hasTests: true, hasComments: true, noNestedLoops: true },
    scores: Object.fromEntries(rubric.criteria.map((c) => [c.id, { score: c.max, sentiment: 0, tags: [], inferred: true }]))
  }));
  assert.deepEqual(C.check({ rubric, entries: same }), []);
});

test("consistency: flag ids are unique", () => {
  const flags = C.check({ rubric, entries: gradeSample() });
  assert.equal(new Set(flags.map((f) => f.id)).size, flags.length);
});
