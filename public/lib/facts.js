/* Objective, explainable facts about a submission. Used by the consistency checker. */
(function (root) {
  "use strict";

  function extractFacts(code) {
    const text = String(code || "").replace(/\r/g, "");
    const lines = text.split("\n");
    let nonBlank = 0;
    let comments = 0;
    let inDoc = false;
    let nested = false;
    const loops = [];

    for (const raw of lines) {
      const line = raw.replace(/\t/g, "    ");
      const t = line.trim();
      if (!t) continue;
      nonBlank++;

      const quotes = (t.match(/("""|''')/g) || []).length;
      if (inDoc) { comments++; if (quotes % 2 === 1) inDoc = false; continue; }
      if (quotes > 0) { comments++; if (quotes % 2 === 1) inDoc = true; continue; }
      if (/^(#|\/\/|\/\*|\*)/.test(t)) { comments++; continue; }

      const indent = line.length - line.trimStart().length;
      while (loops.length && indent <= loops[loops.length - 1]) loops.pop();
      if (/^(for|while)\b/.test(t) || /^\}?\s*(for|while)\s*\(/.test(t)) {
        if (loops.length) nested = true;
        loops.push(indent);
      }
    }

    const commentRatio = nonBlank ? comments / nonBlank : 0;
    const hasTests = /(\bdef test_|\bassert\b|\bunittest\b|\bpytest\b|\bdescribe\(|\bexpect\(|@Test\b|\bit\(["'])/.test(text);
    return {
      lineCount: nonBlank,
      commentRatio: Math.round(commentRatio * 100) / 100,
      hasTests,
      hasComments: commentRatio >= 0.08,
      nestedLoops: nested,
      noNestedLoops: !nested
    };
  }

  const api = { extractFacts };
  root.TG_facts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
