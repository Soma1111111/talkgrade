"use strict";
/* Picks the AI engine when a key is configured, and always falls back to the offline rules. */
const R = require("../public/lib/rubric.js");
const heuristic = require("../public/lib/heuristic.js");
const { analyzeWithGemini } = require("./llm.js");
const privacy = require("./anonymise.js");

const LIMITS = { code: 60000, notes: 8000, name: 100 };

function validatePayload(body) {
  if (!body || typeof body !== "object") return { error: "Request body must be a JSON object." };
  const checked = R.validateRubric(body.rubric);
  if (!checked.ok) return { error: checked.errors.join(" ") };
  const submission = body.submission || {};
  const code = typeof submission.code === "string" ? submission.code : "";
  const student = typeof submission.student === "string" ? submission.student.slice(0, LIMITS.name) : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!notes) return { error: "Notes are empty. Dictate or type your thoughts first." };
  if (notes.length > LIMITS.notes) return { error: `Notes are too long (limit ${LIMITS.notes} characters).` };
  if (code.length > LIMITS.code) return { error: `Submission is too large (limit ${LIMITS.code} characters).` };
  const tone = body.tone === "direct" ? "direct" : "warm";
  const options = body.privacy && typeof body.privacy === "object" ? body.privacy : {};
  const studentNames = Array.isArray(options.studentNames) ? options.studentNames.slice(0, 500).map(x => String(x || "").trim().slice(0, LIMITS.name)).filter(Boolean) : [];
  return { value: { rubric: checked.rubric, submission: { student, code }, notes, tone, privacy: { anonymise: options.anonymise !== false, sendCode: options.sendCode !== false, stripIdentifiers: options.stripIdentifiers !== false, studentNames } } };
}

async function analyze(payload, env, deps) {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || "gemini-3.8-flash";
  if (apiKey) {
    try {
      const protectedInput = privacy.prepare(payload);
      const result = await analyzeWithGemini({ ...protectedInput.payload, apiKey, model, fetchImpl: deps && deps.fetchImpl });
      return privacy.restore(result, protectedInput.names);
    } catch (error) {
      const fallback = heuristic.analyze({ rubric: payload.rubric, notes: payload.notes, student: payload.submission.student, tone: payload.tone });
      return { ...fallback, warning: "AI engine unavailable, used the offline rules instead." };
    }
  }
  return heuristic.analyze({ rubric: payload.rubric, notes: payload.notes, student: payload.submission.student, tone: payload.tone });
}

module.exports = { analyze, validatePayload, LIMITS };
