/*
 * Spoken commands. Wispr Flow types whatever you say into the focused field, so a "voice
 * command" is simply a short sentence typed into the command box and submitted with Enter.
 */
(function (root) {
  "use strict";

  const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

  function numberize(text) {
    return text
      .replace(/\bhalf (?:a )?(?:point|mark)s?\b/gi, "0.5 points")
      .replace(/\bhalf\b/gi, "0.5")
      .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (m) => String(NUMBER_WORDS[m.toLowerCase()]));
  }

  function findCriterion(phrase, rubric) {
    const p = phrase.toLowerCase();
    const tokens = p.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    let best = null;
    let bestScore = 0;
    rubric.criteria.forEach((c) => {
      const candidates = [c.id, c.name, ...c.keywords].map((x) => x.toLowerCase());
      let score = 0;
      candidates.forEach((cand) => {
        if (cand && p.includes(cand)) score = Math.max(score, 10 + cand.length);
        cand.split(/[^a-z0-9]+/).filter((w) => w.length > 2).forEach((w) => {
          if (tokens.some((t) => t.startsWith(w) || w.startsWith(t))) score = Math.max(score, 2);
        });
      });
      if (score > bestScore) { best = c; bestScore = score; }
    });
    return best;
  }

  function fuzzyScore(query,candidate){
    const q=String(query||"").toLowerCase().replace(/[^a-z0-9]+/g,""),c=String(candidate||"").toLowerCase().replace(/[^a-z0-9]+/g,"");
    if(!q||!c)return 0;if(c===q)return 1000;if(c.includes(q))return 800-q.length;
    let qi=0,gaps=0,last=-1;for(let i=0;i<c.length&&qi<q.length;i++)if(c[i]===q[qi]){if(last>=0)gaps+=i-last-1;last=i;qi++;}
    if(qi===q.length)return 500-gaps-q.length;
    if(q.length<4)return 0;
    let previous=Array.from({length:c.length+1},(_,i)=>i);
    for(let i=1;i<=q.length;i++){const row=[i];for(let j=1;j<=c.length;j++)row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(q[i-1]===c[j-1]?0:1));previous=row;}
    const distance=previous[c.length];return distance<=Math.max(1,Math.floor(q.length/4))?300-distance*50:0;
  }

  function parseCommand(input, rubric) {
    const text = numberize(String(input || "").trim().replace(/[.!?]+$/, ""));
    if (!text) return { type: "empty" };
    if (/^next ungraded$/i.test(text)) return { type: "next-ungraded" };
    if (/^(next|go next|next student|next one)\b/i.test(text)) return { type: "next" };
    if (/^(previous|prev|back|go back|previous student)\b/i.test(text)) return { type: "prev" };
    if (/^(analy[sz]e|grade|score (?:this|it)|process)\b/i.test(text)) return { type: "analyze" };
    if (/^(check|consistency|find inconsistenc)/i.test(text)) return { type: "check" };
    if (/^undo$/i.test(text)) return { type: "undo" };
    if (/^redo$/i.test(text)) return { type: "redo" };
    if (/^(export|download) csv$/i.test(text)) return { type: "export", format: "csv" };
    if (/^(export|download) zip$/i.test(text)) return { type: "export", format: "zip" };
    if (/^(show )?similarity$/i.test(text)) return { type: "view", view: "similarity" };
    let extended = text.match(/^comment on lines? (\d+)(?:\s+to\s+(\d+))?\s*:\s*(.+)$/i);
    if (extended) return { type: "comment", from: Number(extended[1]), to: Number(extended[2] || extended[1]), text: extended[3] };
    extended = text.match(/^open\s+(.+)$/i);
    if (extended) return { type: "open", query: extended[1] };
    extended = text.match(/^go to\s+(.+)$/i);
    if (extended) return { type: "view", view: extended[1].toLowerCase() };

    let m = text.match(/^full (?:marks|points|score) (?:on|for|in)\s+(.+)$/i);
    if (m) {
      const c = findCriterion(m[1], rubric);
      return c ? { type: "set", criterionId: c.id, score: c.max } : { type: "error", message: `No criterion matches "${m[1]}".` };
    }
    m = text.match(/^(?:zero|no marks|no points) (?:on|for|in)\s+(.+)$/i);
    if (m) {
      const c = findCriterion(m[1], rubric);
      return c ? { type: "set", criterionId: c.id, score: 0 } : { type: "error", message: `No criterion matches "${m[1]}".` };
    }
    m = text.match(/^(?:make|set|change|put|give)\s+(.+?)(?:\s+(?:to|as|at|=))?\s+(\d+(?:\.\d+)?)(?:\s*(?:points?|marks?))?$/i);
    if (m) {
      const c = findCriterion(m[1], rubric);
      if (!c) return { type: "error", message: `No criterion matches "${m[1]}".` };
      return { type: "set", criterionId: c.id, score: Number(m[2]) };
    }
    return { type: "unknown" };
  }

  const api = { parseCommand, findCriterion, fuzzyScore };
  root.TG_commands = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
