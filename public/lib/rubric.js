/* Rubric helpers shared by the browser and Node. */
(function (root) {
  "use strict";

  const FACTS = ["hasTests", "hasComments", "noNestedLoops"];

  const roundHalf = (n) => Math.round(n * 2) / 2;

  function clampScore(value, max) {
    const v = Number(value);
    if (!Number.isFinite(v)) return null;
    return Math.min(max, Math.max(0, roundHalf(v)));
  }

  const totalMax = (rubric) => rubric.criteria.reduce((sum, c) => sum + c.max, 0);

  function totalScore(rubric, scores) {
    return rubric.criteria.reduce((sum, c) => {
      const s = scores && scores[c.id];
      return sum + (s && Number.isFinite(s.score) ? s.score : 0);
    }, 0);
  }

  function validateRubric(input) {
    const errors = [];
    if (!input || typeof input !== "object") return { ok: false, errors: ["Rubric must be an object."], rubric: null };
    const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
    if (!title) errors.push("Rubric needs a title.");
    const list = Array.isArray(input.criteria) ? input.criteria : [];
    if (!list.length || list.length > 12) errors.push("Rubric needs between 1 and 12 criteria.");
    const seen = new Set();
    const criteria = [];
    list.slice(0, 12).forEach((c, i) => {
      const where = `Criterion ${i + 1}`;
      if (!c || typeof c !== "object") { errors.push(`${where} must be an object.`); return; }
      const id = String(c.id || "").trim();
      if (!/^[a-z0-9_-]{1,32}$/i.test(id)) errors.push(`${where}: id must be 1-32 letters, numbers, "-" or "_".`);
      else if (seen.has(id)) errors.push(`${where}: duplicate id "${id}".`);
      seen.add(id);
      const name = String(c.name || "").trim().slice(0, 80);
      if (!name) errors.push(`${where}: name is required.`);
      const max = Number(c.max);
      if (!(max > 0 && max <= 100)) errors.push(`${where}: max must be greater than 0 and at most 100.`);
      const keywords = Array.isArray(c.keywords)
        ? c.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 30)
        : [];
      let fact = c.fact ? String(c.fact) : "";
      if (fact && !FACTS.includes(fact)) { errors.push(`${where}: fact must be one of ${FACTS.join(", ")}.`); fact = ""; }
      criteria.push({ id, name, max, description: String(c.description || "").slice(0, 300), keywords, fact });
    });
    return { ok: errors.length === 0, errors, rubric: errors.length ? null : { title, criteria } };
  }

  /* Turns any analysis (LLM output or heuristic output) into a safe, complete record. */
  function normalizeAnalysis(raw, rubric) {
    const src = raw && typeof raw === "object" ? raw : {};
    const given = src.scores && typeof src.scores === "object" ? src.scores : {};
    const scores = {};
    rubric.criteria.forEach((c) => {
      const r = given[c.id];
      const score = r && typeof r === "object" ? clampScore(r.score, c.max) : null;
      if (score === null) {
        scores[c.id] = { score: c.max, reason: "No issues mentioned.", sentiment: 0, tags: [], inferred: true };
        return;
      }
      const sentiment = [-1, 0, 1].includes(Number(r.sentiment)) ? Number(r.sentiment) : 0;
      const tags = Array.isArray(r.tags) ? r.tags.map(String).filter((t) => c.keywords.includes(t)).slice(0, 5) : [];
      scores[c.id] = { score, reason: String(r.reason || "").slice(0, 300), sentiment, tags, inferred: Boolean(r.inferred) };
    });
    return { scores, feedback: String(src.feedback || "").slice(0, 4000) };
  }

  const api = { FACTS, roundHalf, clampScore, totalMax, totalScore, validateRubric, normalizeAnalysis };
  root.TG_rubric = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
