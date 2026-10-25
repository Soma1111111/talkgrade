/*
 * Offline rules engine. Turns messy spoken notes into rubric scores and a feedback draft
 * with no network or API key. Runs in the browser (fallback) and on the server.
 *
 * Rules, in plain words:
 *  - Notes are split into clauses (sentences, and halves of "X but Y").
 *  - A clause belongs to a criterion when it contains one of that criterion's keywords.
 *  - Numbers win: "3 out of 5", "gives it 3", "minus 2", "half a point off".
 *  - A negative clause with no number costs a quarter of the criterion's points.
 *  - A criterion nobody mentioned gets full marks and is marked `inferred` so the
 *    consistency checker can still catch things the grader forgot to mention.
 */
(function (root) {
  "use strict";
  const R = root.TG_rubric || require("./rubric.js");

  const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const NEG = /\b(no|not|never|missing|lacks?|lacking|without|wrong|incorrect|bugs?|buggy|fails?|failing|broken|breaks?|slow|inefficient|quadratic|nested|messy|unclear|confusing|poor|weak|forgot|forgets?|crash(?:es)?|minus|deduct(?:ed|ing)?|hardcoded|hard-coded|duplicate[ds]?|repeated|unreadable|vague|bad|needs?|should|thin|doesn't|didn't|isn't|aren't|can't|cannot)\b|o\(n\^?2\)/gi;
  const POS = /\b(good|great|nice(?:ly)?|clean|clear(?:ly)?|correct(?:ly)?|well|excellent|solid|readable|neat|elegant|efficient|thorough|works?|perfect|handles?|covers?|tidy|consistent|impressive|fine|okay|ok)\b/gi;
  const NO_PROBLEM = /\bno (bugs?|issues?|errors?|problems?)\b/i;

  const NUM = "(\\d+(?:\\.\\d+)?)";
  const REL = new RegExp(NUM + "\\s*(?:/|out of)\\s*" + NUM, "i");
  const ABS = new RegExp("\\b(?:gives?|gets?|scores?d?|award(?:ed)?|worth)\\s+(?:[a-z']+\\s+){0,3}?(?:a\\s+)?" + NUM + "(?!\\s*(?:points?|marks?)?\\s*(?:off|deducted|lost))", "i");
  const DEDUCTIONS = [
    new RegExp("\\b(?:minus|deduct(?:ed|ing)?|lose|lost|take off)\\s*" + NUM, "i"),
    new RegExp(NUM + "\\s*(?:points?|marks?)?\\s*(?:off|deducted|lost|penalty)\\b", "i"),
    new RegExp("(?:^|\\s)-\\s*" + NUM + "\\b", "i")
  ];

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keywordRe = (kw) => new RegExp("\\b" + escapeRe(kw), "i");

  function numberize(text) {
    return text
      .replace(/\bhalf (?:a )?(?:point|mark)s?\b/gi, "0.5 points")
      .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (m) => String(NUMBER_WORDS[m.toLowerCase()]));
  }

  function splitClauses(notes) {
    const out = [];
    String(notes || "").replace(/\r/g, "").split(/\n+|(?<=[.!?])\s+/).forEach((sentence) => {
      sentence.split(/\s*\b(?:but|however|although|though|except)\b,?\s*/i).forEach((part) => {
        const t = part.trim().replace(/^[,;:\-\s]+/, "");
        if (t.length > 1) out.push(t);
      });
    });
    return out;
  }

  function sentimentOf(text) {
    if (NO_PROBLEM.test(text)) return 1;
    const neg = (text.match(NEG) || []).length;
    const pos = (text.match(POS) || []).length;
    if (neg > pos) return -1;
    if (pos > neg) return 1;
    return neg > 0 ? -1 : 0;
  }

  function firstNumber(patterns, text) {
    for (const re of patterns) {
      const m = text.match(re);
      if (m) return Number(m[1]);
    }
    return null;
  }

  function analyzeClauses(rubric, notes) {
    const clauses = splitClauses(notes).map((text) => {
      const t = numberize(text);
      return { text, t, sentiment: sentimentOf(t), used: false };
    });

    const scores = {};
    rubric.criteria.forEach((c) => {
      const matched = [];
      clauses.forEach((k) => {
        const kw = c.keywords.find((w) => keywordRe(w).test(k.t));
        if (kw) { matched.push({ k, kw }); k.used = true; }
      });
      if (!matched.length) {
        scores[c.id] = { score: c.max, reason: "No issues mentioned.", sentiment: 0, tags: [], inferred: true };
        return;
      }

      let absolute = null;
      let deducted = 0;
      let negative = false;
      let positive = false;
      const tags = [];
      let reasonClause = null;

      matched.forEach(({ k, kw }) => {
        const rel = k.t.match(REL);
        const abs = k.t.match(ABS);
        const ded = firstNumber(DEDUCTIONS, k.t);
        let isNegative = k.sentiment < 0;
        if (rel) absolute = (Number(rel[1]) / Number(rel[2])) * c.max;
        else if (abs) absolute = Number(abs[1]);
        else if (ded !== null) { deducted += ded; isNegative = true; }
        else if (k.sentiment < 0) deducted += Math.max(0.5, R.roundHalf(c.max * 0.25));
        if (isNegative) {
          negative = true;
          if (!tags.includes(kw)) tags.push(kw);
          if (!reasonClause || reasonClause.sentiment >= 0) reasonClause = k;
        } else if (k.sentiment > 0) {
          positive = true;
          if (!reasonClause) reasonClause = k;
        }
        if (!reasonClause) reasonClause = k;
      });

      const raw = absolute !== null ? absolute : c.max - deducted;
      scores[c.id] = {
        score: R.clampScore(raw, c.max),
        reason: reasonClause.text.charAt(0).toUpperCase() + reasonClause.text.slice(1, 200),
        sentiment: negative ? -1 : positive ? 1 : 0,
        tags,
        inferred: false
      };
    });

    return { scores, clauses };
  }

  function cleanForStudent(text) {
    let t = numberize(text)
      .replace(/,?\s*(?:only\s+)?(?:minus|deduct(?:ed|ing)?|lose|lost)\s+\d+(?:\.\d+)?(?:\s*(?:points?|marks?))?/gi, "")
      .replace(/,?\s*(?:only\s+)?\d+(?:\.\d+)?\s*(?:points?|marks?)\s*off\b/gi, "")
      .replace(/\s+/g, " ")
      .replace(/[\s,;]+$/, "")
      .trim();
    if (!t) return "";
    return t.charAt(0).toUpperCase() + t.slice(1).replace(/\.$/, "") + ".";
  }

  function draftFeedback(rubric, result, student, tone) {
    const { scores, clauses } = result;
    const good = [];
    const work = [];
    rubric.criteria.forEach((c) => {
      const s = scores[c.id];
      if (s.inferred) return;
      const line = cleanForStudent(s.reason);
      if (!line) return;
      if (s.sentiment < 0) work.push(`${c.name}: ${line}`);
      else if (s.sentiment > 0) good.push(`${c.name}: ${line}`);
    });
    clauses.filter((k) => !k.used).forEach((k) => {
      const line = cleanForStudent(k.text);
      if (!line) return;
      if (k.sentiment > 0) good.push(line);
      else if (k.sentiment < 0) work.push(line);
    });

    const total = R.totalScore(rubric, scores);
    const max = R.totalMax(rubric);
    const name = String(student || "").trim();
    const out = [];
    if (tone === "direct") out.push(name ? `Feedback for ${name}` : "Feedback", "");
    else out.push(name ? `Hi ${name},` : "Hi,", "", "Thanks for your submission. Here is my feedback.", "");
    if (good.length) out.push("What went well", ...good.map((g) => `- ${g}`), "");
    if (work.length) out.push("What to work on", ...work.map((w) => `- ${w}`), "");
    out.push(`Score: ${total}/${max}`);
    rubric.criteria.forEach((c) => out.push(`- ${c.name}: ${scores[c.id].score}/${c.max}`));
    return out.join("\n");
  }

  function analyze({ rubric, notes, student, tone }) {
    const result = analyzeClauses(rubric, notes);
    return { scores: result.scores, feedback: draftFeedback(rubric, result, student, tone), engine: "heuristic" };
  }

  const api = { analyze, splitClauses, sentimentOf, numberize };
  root.TG_heuristic = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
