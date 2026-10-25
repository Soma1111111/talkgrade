"use strict";
/* TalkGrade server: static files + a tiny JSON API. No dependencies. Node 18+. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
loadLocalEnv();
const { analyze, validatePayload } = require("./src/engine.js");
const { extractRubric } = require("./src/rubric-extract.js");
const { polish: polishInsights } = require("./src/insights-polish.js");
const { translate: translateFeedback } = require("./src/translate.js");

const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 200 * 1024;
const RATE = { windowMs: 10 * 60 * 1000, max: 120 };

// Load local development settings without a dependency. Existing shell/host
// environment variables take precedence over values in .env.
function loadLocalEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    process.env[match[1]] = value;
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"
};

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store"
};

function createServer({ env = process.env, fetchImpl, teamDb } = {}) {
  const hits = new Map();
  // Team mode is opt-in. Local single-grader use stays dependency-free.
  const teamService = env.TEAM_MODE === "1"
    ? require("./server/team.js").createTeamService({ env, db: teamDb })
    : null;

  function limited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 10000) {
      for (const [candidate, times] of hits) {
        if (!times.some((time) => now - time < RATE.windowMs)) hits.delete(candidate);
      }
      while (hits.size > 10000) hits.delete(hits.keys().next().value);
    }
    return recent.length > RATE.max;
  }

  function send(res, status, body, headers) {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(body);
  }
  const sendJson = (res, status, data) => send(res, status, JSON.stringify(data), { "content-type": TYPES[".json"] });

  function readBody(req, maxBytes=MAX_BODY) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let tooBig = false;
      const chunks = [];
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          tooBig = true;
          chunks.length = 0;
          if (size > 8 * maxBytes) req.destroy(); // stop reading absurd uploads, but answer small overruns cleanly
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => (tooBig
        ? reject(Object.assign(new Error("Request too large."), { status: 413 }))
        : resolve(Buffer.concat(chunks).toString("utf8"))));
      req.on("error", reject);
    });
  }

  function serveStatic(req, res) {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (_) { return sendJson(res, 400, { error: "Bad path." }); }
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: "Forbidden." });
    fs.readFile(file, (err, data) => {
      if (err) return sendJson(res, 404, { error: "Not found." });
      send(res, 200, data, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    });
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (teamService && url.pathname.startsWith("/api/")) {
        const handled = await teamService.handle(req, res, { sendJson, readBody });
        if (handled !== false) return;
      }
      if (teamService && req.method === "GET" && /^\/s\/[A-Za-z0-9_-]{20,80}$/.test(url.pathname)) {
        req.url = "/student.html";
        return serveStatic(req, res);
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        return sendJson(res, 200, { ok: true, engine: env.GEMINI_API_KEY ? "gemini" : "heuristic", teamMode: Boolean(teamService), version: require("./package.json").version });
      }
      if (req.method === "POST" && url.pathname === "/api/analyze") {
        if (limited(req.socket.remoteAddress || "unknown")) return sendJson(res, 429, { error: "Too many requests. Try again in a few minutes." });
        if (!/^application\/json/i.test(req.headers["content-type"] || "")) return sendJson(res, 415, { error: "Send JSON." });
        let body;
        try { body = JSON.parse(await readBody(req)); } catch (e) {
          return sendJson(res, e.status || 400, { error: e.status ? e.message : "Invalid JSON." });
        }
        const checked = validatePayload(body);
        if (checked.error) return sendJson(res, 400, { error: checked.error });
        return sendJson(res, 200, await analyze(checked.value, env, { fetchImpl }));
      }
      if (req.method === "POST" && url.pathname === "/api/translate") {
        if (limited(req.socket.remoteAddress || "unknown")) return sendJson(res, 429, { error: "Too many AI requests. Try again in a few minutes." });
        if (!/^application\/json/i.test(req.headers["content-type"] || "")) return sendJson(res, 415, { error: "Send JSON." });
        let body;
        try { body = JSON.parse(await readBody(req)); } catch (e) { return sendJson(res, e.status || 400, { error: e.status ? e.message : "Invalid JSON." }); }
        const result = await translateFeedback(body, env, { fetchImpl });
        return sendJson(res, result.status, result.body);
      }
      if (req.method === "POST" && url.pathname === "/api/rubric/extract") {
        if (limited(req.socket.remoteAddress || "unknown")) return sendJson(res, 429, { error: "Too many requests. Try again in a few minutes." });
        if (!/^application\/json/i.test(req.headers["content-type"] || "")) return sendJson(res, 415, { error: "Send JSON." });
        let body;try { body=JSON.parse(await readBody(req,2_900_000)); } catch(e) { return sendJson(res,e.status||400,{error:e.status?e.message:"Invalid JSON."}); }
        if (!body || typeof body !== "object" || typeof body.name !== "string" || typeof body.mime !== "string" || typeof body.base64 !== "string") return sendJson(res,400,{error:"Provide file name, media type, and base64 file data."});
        const result=await extractRubric(body,env,{fetchImpl});return sendJson(res,result.status,result.body);
      }
      if (req.method === "POST" && url.pathname === "/api/insights/polish") {
        if (limited(req.socket.remoteAddress || "unknown")) return sendJson(res, 429, { error: "Too many requests. Try again in a few minutes." });
        if (!/^application\/json/i.test(req.headers["content-type"] || "")) return sendJson(res, 415, { error: "Send JSON." });
        let body;try { body=JSON.parse(await readBody(req)); } catch(e) { return sendJson(res,e.status||400,{error:e.status?e.message:"Invalid JSON."}); }
        if (!body || typeof body !== "object") return sendJson(res,400,{error:"Provide class insight aggregates."});
        const result=await polishInsights(body,env,{fetchImpl});return sendJson(res,result.status,result.body);
      }
      if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
      return sendJson(res, 405, { error: "Method not allowed." });
    } catch (error) {
      return sendJson(res, 500, { error: "Something went wrong on the server." });
    }
  };
  const server = http.createServer(handler);
  server.handler = handler;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    const engine = process.env.GEMINI_API_KEY ? "Gemini" : "offline rules (set GEMINI_API_KEY to enable Gemini)";
    console.log(`TalkGrade running at http://localhost:${port}  |  engine: ${engine}`);
  });
}

module.exports = { createServer };
