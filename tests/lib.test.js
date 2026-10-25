"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../public/lib/rubric.js");
const F = require("../public/lib/facts.js");
const K = require("../public/lib/commands.js");
const X = require("../public/lib/export.js");
const S = require("../public/data/sample.js");

test("sample rubric validates", () => {
  const r = R.validateRubric(S.rubric);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(R.totalMax(r.rubric), 20);
});

test("rubric validation rejects bad input with readable errors", () => {
  const bad = R.validateRubric({ title: "", criteria: [{ id: "a b", name: "", max: 0 }, { id: "x", name: "X", max: 5, fact: "nope" }, { id: "x", name: "X", max: 5 }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 5);
  assert.equal(R.validateRubric(null).ok, false);
  assert.equal(R.validateRubric({ title: "t", criteria: [] }).ok, false);
});

test("clampScore rounds to half points and clamps", () => {
  assert.equal(R.clampScore(4.3, 5), 4.5);
  assert.equal(R.clampScore(9, 5), 5);
  assert.equal(R.clampScore(-2, 5), 0);
  assert.equal(R.clampScore("abc", 5), null);
});

test("normalizeAnalysis fills missing criteria, clamps, and drops unknown tags", () => {
  const rubric = R.validateRubric(S.rubric).rubric;
  const out = R.normalizeAnalysis({
    scores: { correctness: { score: 99, reason: "x", sentiment: 7, tags: ["bug", "made-up"] }, testing: "garbage" },
    feedback: "hi"
  }, rubric);
  assert.equal(out.scores.correctness.score, 5);
  assert.equal(out.scores.correctness.sentiment, 0);
  assert.deepEqual(out.scores.correctness.tags, ["bug"]);
  assert.equal(out.scores.testing.score, 5);
  assert.equal(out.scores.testing.inferred, true);
  assert.equal(Object.keys(out.scores).length, rubric.criteria.length);
  assert.deepEqual(R.normalizeAnalysis(null, rubric).feedback, "");
});

test("facts: tests, comments, nested loops", () => {
  const [aarav, bhavna, , , esha] = S.students.map((s) => F.extractFacts(s.code));
  assert.equal(aarav.hasTests, true);
  assert.equal(aarav.hasComments, true);
  assert.equal(aarav.nestedLoops, false);
  assert.equal(bhavna.hasTests, false);
  assert.equal(bhavna.nestedLoops, true);
  assert.equal(esha.hasComments, false);
});

test("facts: sequential loops are not nested, brace languages work", () => {
  assert.equal(F.extractFacts("for a in x:\n    pass\nfor b in y:\n    pass\n").nestedLoops, false);
  assert.equal(F.extractFacts("for (int i=0;i<n;i++) {\n  for (int j=0;j<n;j++) {\n    x++;\n  }\n}\n").nestedLoops, true);
  assert.equal(F.extractFacts("").lineCount, 0);
});

test("commands: navigation, scoring and fuzzy criterion match", () => {
  const rubric = R.validateRubric(S.rubric).rubric;
  assert.equal(K.parseCommand("Next student.", rubric).type, "next");
  assert.equal(K.parseCommand("go back", rubric).type, "prev");
  assert.equal(K.parseCommand("check consistency", rubric).type, "check");
  assert.deepEqual(K.parseCommand("set testing to 2", rubric), { type: "set", criterionId: "testing", score: 2 });
  assert.deepEqual(K.parseCommand("make the tests three", rubric), { type: "set", criterionId: "testing", score: 3 });
  assert.deepEqual(K.parseCommand("give readability half a point", rubric).score, 0.5);
  assert.deepEqual(K.parseCommand("full marks on style", rubric), { type: "set", criterionId: "style", score: 4 });
  assert.equal(K.parseCommand("set banana to 2", rubric).type, "error");
  assert.equal(K.parseCommand("tell me a joke", rubric).type, "unknown");
  assert.equal(K.parseCommand("   ", rubric).type, "empty");
});

test("export: CSV quoting and formula-injection protection", () => {
  const rubric = R.validateRubric(S.rubric).rubric;
  const scores = Object.fromEntries(rubric.criteria.map((c) => [c.id, { score: c.max }]));
  const csv = X.toCSV(rubric, [{ name: "=HYPERLINK(\"x\")", scores, feedback: "Line one,\nline \"two\"" }]);
  assert.match(csv, /'=HYPERLINK\(""x""\)/);
  assert.match(csv, /"Line one,\nline ""two"""/);
  assert.match(csv, /,20,20,100,/);
  assert.equal(X.cell("+1"), "'+1");
  assert.equal(X.cell(5), "5");
  assert.match(X.feedbackBundle(rubric, [{ name: "A", feedback: "hello" }]), /A\n=+\nhello/);
});
