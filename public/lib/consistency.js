/*
 * Consistency checker: the feature that makes TalkGrade more than "voice to text".
 * Pure function: (rubric, graded entries in grading order) -> list of flags.
 *
 * Six kinds of flag:
 *  fact-lenient       a submission has a measurable flaw (e.g. no tests) but scored far above
 *                     other submissions with the same flaw
 *  fact-harsh         the reverse: the submission is fine on a measurable fact but scored far
 *                     below others that are fine
 *  tag-variance       the same spoken issue (e.g. "tests") cost very different points
 *  noted-no-deduction your notes raise a problem but the criterion kept full marks
 *  praise-low-score   your notes are positive but the score is half marks or less
 *  drift              the average score for a criterion moved a lot between your first and last
 *                     graded submissions (fatigue / changing standards)
 */
(function (root) {
  "use strict";
  const R = root.TG_rubric || require("./rubric.js");

  const TOLERANCE = 0.25; // fraction of a criterion's max that counts as a real difference
  const DRIFT_TOLERANCE = 0.3; // fraction of max the average must move to count as drift
  const MIN_PEERS = 2; // need at least this many comparable submissions before calling someone an outlier
  const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const fmt = (n) => String(Math.round(n * 10) / 10);

  const FACT_PHRASE = {
    hasTests: { true: "has tests", false: "has no tests" },
    hasComments: { true: "is commented", false: "has few or no comments" },
    noNestedLoops: { true: "avoids nested loops", false: "uses nested loops" }
  };

  function check({ rubric, entries, settings = {} }) {
    const tolerance = Number.isFinite(settings.tolerance) ? Math.max(.05, Math.min(.5, settings.tolerance)) : TOLERANCE;
    const driftTolerance = Number.isFinite(settings.driftTolerance) ? Math.max(.1, Math.min(.6, settings.driftTolerance)) : DRIFT_TOLERANCE;
    const minPeers = Number.isInteger(settings.minPeers) ? Math.max(1, Math.min(5, settings.minPeers)) : MIN_PEERS;
    const flags = [];
    const add = (flag, suffix) =>
      flags.push({ ...flag, id: [flag.kind, flag.criterionId, flag.studentIds.join("+"), suffix || ""].join(":") });
    const scoreOf = (entry, c) => {
      const s = entry.scores && entry.scores[c.id];
      return s && Number.isFinite(s.score) ? s : null;
    };

    rubric.criteria.forEach((c, order) => {
      const tol = tolerance * c.max;

      // 1. Fact-based outliers
      if (c.fact) {
        const good = [];
        const bad = [];
        entries.forEach((e) => {
          const s = scoreOf(e, c);
          if (!s || !e.facts) return;
          (e.facts[c.fact] ? good : bad).push({ e, score: s.score });
        });
        [[bad, "fact-lenient", false], [good, "fact-harsh", true]].forEach(([group, kind, factValue]) => {
          if (group.length < minPeers + 1) return;
          group.forEach((m) => {
            const others = group.filter((o) => o !== m);
            const mean = avg(others.map((o) => o.score));
            const diff = m.score - mean;
            const hit = kind === "fact-lenient" ? diff >= tol : -diff >= tol;
            if (!hit) return;
            const phrase = FACT_PHRASE[c.fact][String(factValue)];
            add({
              kind,
              severity: kind === "fact-lenient" ? "high" : "medium",
              criterionId: c.id,
              studentIds: [m.e.id],
              message: `${m.e.name} got ${fmt(m.score)}/${c.max} for ${c.name}, but the submission ${phrase}. ` +
                `Other submissions like that averaged ${fmt(mean)}/${c.max} (${others.length} compared).`,
              explanation:{score:m.score,max:c.max,peerMean:mean,peerCount:others.length,difference:Math.abs(diff),threshold:tol,fact:c.fact,factValue:Boolean(factValue)},
              suggestions: [{ studentId: m.e.id, criterionId: c.id, score: R.clampScore(mean, c.max) }],
              order
            });
          });
        });
      }

      // 2. Same spoken issue, very different penalty
      const byTag = new Map();
      entries.forEach((e) => {
        const s = scoreOf(e, c);
        if (!s || s.inferred || !s.tags || s.tags.length !== 1) return; // one tag only, so the cost is attributable
        if (!byTag.has(s.tags[0])) byTag.set(s.tags[0], []);
        byTag.get(s.tags[0]).push({ e, deduction: c.max - s.score });
      });
      byTag.forEach((list, tag) => {
        if (list.length < 2) return;
        const deductions = list.map((x) => x.deduction);
        if (Math.max(...deductions) - Math.min(...deductions) < tol) return;
        const typical = median(deductions);
        add({
          kind: "tag-variance",
          severity: "medium",
          criterionId: c.id,
          studentIds: list.map((x) => x.e.id),
          message: `"${tag}" under ${c.name} cost: ` + list.map((x) => `${x.e.name} ${fmt(x.deduction)}`).join(", ") + " points.",
          explanation:{tag,criterionMax:c.max,deductions:list.map(x=>({studentId:x.e.id,deduction:x.deduction})),spread:Math.max(...deductions)-Math.min(...deductions),threshold:tol,typical},
          suggestions: list
            .filter((x) => x.deduction !== typical)
            .map((x) => ({ studentId: x.e.id, criterionId: c.id, score: R.clampScore(c.max - typical, c.max) })),
          order
        }, tag);
      });

      // 3. Notes and score disagree
      entries.forEach((e) => {
        const s = scoreOf(e, c);
        if (!s || s.inferred) return;
        if (s.sentiment < 0 && s.score >= c.max) {
          add({
            kind: "noted-no-deduction", severity: "high", criterionId: c.id, studentIds: [e.id],
            message: `${e.name}: your notes raise a problem under ${c.name}, but it kept full marks (${c.max}/${c.max}).`,
            explanation:{score:s.score,max:c.max,sentiment:s.sentiment,condition:"negative notes with full marks"},
            suggestions: [], order
          });
        } else if (s.sentiment > 0 && s.score <= c.max * 0.5) {
          add({
            kind: "praise-low-score", severity: "medium", criterionId: c.id, studentIds: [e.id],
            message: `${e.name}: your notes are positive about ${c.name}, yet the score is ${fmt(s.score)}/${c.max}.`,
            explanation:{score:s.score,max:c.max,halfMarkThreshold:c.max*.5,sentiment:s.sentiment,condition:"positive notes with half marks or less"},
            suggestions: [{ studentId: e.id, criterionId: c.id, score: c.max }], order
          });
        }
      });

      // 4. Drift between your first and last graded submissions
      const scored = entries.filter((e) => scoreOf(e, c));
      if (scored.length >= 6) {
        const n = Math.floor(scored.length / 3);
        const first = scored.slice(0, n);
        const last = scored.slice(-n);
        const a = avg(first.map((e) => scoreOf(e, c).score));
        const b = avg(last.map((e) => scoreOf(e, c).score));
        if (Math.abs(a - b) >= driftTolerance * c.max) {
          add({
            kind: "drift", severity: "medium", criterionId: c.id, studentIds: last.map((e) => e.id),
            message: `Average ${c.name} score went from ${fmt(a)} (first ${n}) to ${fmt(b)} (last ${n}). ` +
              "Worth checking your standard stayed the same.",
            explanation:{criterionMax:c.max,firstMean:a,lastMean:b,difference:Math.abs(a-b),threshold:driftTolerance*c.max,firstCount:first.length,lastCount:last.length},
            suggestions: [], order
          });
        }
      }
    });

    return flags.sort((x, y) =>
      SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity] || x.order - y.order);
  }

  function explain(flag){return flag&&flag.explanation?{...flag.explanation}:{};}
  const api = { check, explain, TOLERANCE, DRIFT_TOLERANCE, MIN_PEERS };
  root.TG_consistency = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
