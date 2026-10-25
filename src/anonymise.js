"use strict";

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function stripIdentifiers(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b(?:student|learner|user)[ _-]?id\s*[:=#]\s*["']?[A-Z0-9_-]{3,}["']?/gi, "[ID]")
    .replace(/\b(?:student|learner|user)[ _-]?number\s*[:=#]\s*["']?[A-Z0-9_-]{3,}["']?/gi, "[ID]");
}

function anonymiseText(value, names) {
  let text = String(value || "");
  names.forEach(({ name, label }) => {
    if (!name) return;
    text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "giu"), label);
  });
  return text;
}

function prepare(payload) {
  const privacy = payload.privacy || {};
  const sourceNames = Array.isArray(privacy.studentNames) ? [...privacy.studentNames] : [];
  if (payload.submission?.student) sourceNames.unshift(payload.submission.student);
  const seen = new Set();
  const names = sourceNames.map(x => String(x || "").trim().slice(0, 100)).filter(name => {
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((name, index) => ({ name, label: `S${index + 1}` }));
  const protect = text => {
    let value = String(text || "");
    if (privacy.stripIdentifiers !== false) value = stripIdentifiers(value);
    if (privacy.anonymise !== false) value = anonymiseText(value, names);
    return value;
  };
  return {
    payload: {
      ...payload,
      submission: {
        ...payload.submission,
        student: privacy.anonymise === false ? payload.submission?.student || "" : protect(payload.submission?.student || ""),
        code: privacy.sendCode === false ? "" : protect(payload.submission?.code || "")
      },
      notes: protect(payload.notes)
    },
    names: privacy.anonymise === false ? [] : names
  };
}

function restore(analysis, names) {
  if (!names?.length || !analysis || typeof analysis !== "object") return analysis;
  const restoreText = value => {
    let text = String(value || "");
    names.forEach(({ name, label }) => { text = text.replace(new RegExp(`\\b${label}\\b`, "g"), name); });
    return text;
  };
  return {
    ...analysis,
    feedback: restoreText(analysis.feedback),
    scores: Object.fromEntries(Object.entries(analysis.scores || {}).map(([id, score]) => [id, score && typeof score === "object" ? { ...score, reason: restoreText(score.reason) } : score]))
  };
}

module.exports = { prepare, restore, stripIdentifiers };
