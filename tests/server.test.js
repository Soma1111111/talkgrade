"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../server.js");
const { extractJson, buildPrompt } = require("../src/llm.js");
const R = require("../public/lib/rubric.js");
const S = require("../public/data/sample.js");

const rubric = R.validateRubric(S.rubric).rubric;
const payload = (over) => JSON.stringify({ rubric: S.rubric, submission: { student: "Bhavna", code: S.students[1].code }, notes: S.students[1].sampleNotes, ...over });

function start(opts) {
  const server = createServer(opts);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}
const post = (base, body, headers) => fetch(base + "/api/analyze", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

test("static files, headers and path traversal", async () => {
  const { server, base } = await start({ env: {} });
  try {
    const page = await fetch(base + "/");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /TalkGrade/);
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await fetch(base + "/app.js")).headers.get("content-type").split(";")[0], "text/javascript");
    assert.equal((await fetch(base + "/nope.html")).status, 404);
    const raw = await new Promise((resolve) => {
      require("node:http").get({ host: "127.0.0.1", port: server.address().port, path: "/..%2f..%2fserver.js" }, (res) => resolve(res.statusCode));
    });
    assert.ok([403, 404].includes(raw));
    assert.equal((await fetch(base + "/..%2fpackage.json")).status === 200, false);
  } finally { server.close(); }
});

test("health reports the engine", async () => {
  const a = await start({ env: {} });
  const b = await start({ env: { GEMINI_API_KEY: "k" } });
  try {
    assert.equal((await (await fetch(a.base + "/api/health")).json()).engine, "heuristic");
    assert.equal((await (await fetch(b.base + "/api/health")).json()).engine, "gemini");
  } finally { a.server.close(); b.server.close(); }
});

test("rubric extraction clearly reports unavailable AI and extracts PDF with configured AI", async () => {
  const offline=await start({env:{}});
  try { const res=await fetch(offline.base+"/api/rubric/extract",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"rubric.pdf",mime:"application/pdf",base64:"JVBERi0x"})});assert.equal(res.status,501);assert.equal((await res.json()).needsAI,true); }
  finally { offline.server.close(); }
  let request;
  const online=await start({env:{GEMINI_API_KEY:"test",GEMINI_MODEL:"vision-test"},fetchImpl:async(url,init)=>{request={url,init,body:JSON.parse(init.body)};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({title:"Extracted",criteria:[{name:"Testing",max:4,description:"Covers edge cases"}]})}]}}]})};}});
  try {const res=await fetch(online.base+"/api/rubric/extract",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"rubric.pdf",mime:"application/pdf",base64:"JVBERi0x"})}),data=await res.json();assert.equal(res.status,200);assert.equal(data.rubric.criteria[0].confidence,"check");assert.equal(request.url,"https://generativelanguage.googleapis.com/v1beta/models/vision-test:generateContent");assert.equal(request.body.contents[0].parts[1].inlineData.mimeType,"application/pdf");assert.equal(request.init.headers["x-goog-api-key"],"test");}
  finally { online.server.close(); }
});

test("analyze: offline engine scores the sample notes", async () => {
  const { server, base } = await start({ env: {} });
  try {
    const res = await post(base, payload());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.engine, "heuristic");
    assert.equal(data.scores.testing.score, 3);
    assert.equal(data.scores.efficiency.score, 3);
    assert.match(data.feedback, /^Hi Bhavna/);
  } finally { server.close(); }
});

test("analyze: input validation", async () => {
  const { server, base } = await start({ env: {} });
  try {
    assert.equal((await post(base, "{not json")).status, 400);
    assert.equal((await post(base, payload({ notes: "   " }))).status, 400);
    assert.equal((await post(base, payload({ rubric: { title: "x", criteria: [] } }))).status, 400);
    assert.equal((await post(base, payload({ submission: { student: "x", code: "a".repeat(70000) } }))).status, 400);
    assert.equal((await post(base, "x", { "content-type": "text/plain" })).status, 415);
    assert.equal((await post(base, JSON.stringify({ pad: "a".repeat(250 * 1024) }))).status, 413);
    assert.equal((await fetch(base + "/api/analyze", { method: "PUT" })).status, 405);
  } finally { server.close(); }
});

test("analyze: uses Gemini when configured and validates its output", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        scores: { testing: { score: 2.5, reason: "no tests", sentiment: -1, tags: ["test"], inferred: false }, correctness: { score: 50 } },
        feedback: "Nice work, add tests."
      }) }] } }] })
    };
  };
  const { server, base } = await start({ env: { GEMINI_API_KEY: "sk-test", GEMINI_MODEL: "m-1" }, fetchImpl });
  try {
    const data = await (await post(base, payload())).json();
    assert.equal(data.engine, "gemini");
    assert.equal(data.scores.testing.score, 2.5);
    assert.equal(data.scores.correctness.score, 5);
    assert.equal(data.scores.style.inferred, true);
    assert.equal(seen.url, "https://generativelanguage.googleapis.com/v1beta/models/m-1:generateContent");
    assert.equal(seen.init.headers["x-goog-api-key"], "sk-test");
    assert.equal(JSON.parse(seen.init.body).contents[0].parts.length, 1);
  } finally { server.close(); }
});

test("analyze: applies privacy settings before forwarding data to Gemini", async () => {
  let prompt;
  const fetchImpl=async(_url,init)=>{prompt=JSON.parse(init.body).contents[0].parts[0].text;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({scores:{testing:{score:4,reason:"S1 submitted useful tests",sentiment:1,tags:[],inferred:false}},feedback:"S1, your work is clear."})}]}}]})};};
  const {server,base}=await start({env:{GEMINI_API_KEY:"test"},fetchImpl});
  try{
    const body=payload({submission:{student:"Bhavna",code:'student_id = "abc-123"\nemail = "bhavna@example.edu"'},notes:"Bhavna added useful tests.",privacy:{anonymise:true,sendCode:true,stripIdentifiers:true,studentNames:["Bhavna","Chirag"]}});
    const result=await (await post(base,body)).json();
    assert.match(prompt,/S1 added useful tests/);assert.doesNotMatch(prompt,/Bhavna|Chirag|abc-123|bhavna@example\.edu/);
    assert.match(result.feedback,/Bhavna/);assert.match(result.scores.testing.reason,/Bhavna/);
  }finally{server.close();}
});

test("analyze: omits submission code when code sharing is disabled", async () => {
  let prompt;
  const fetchImpl=async(_url,init)=>{prompt=JSON.parse(init.body).contents[0].parts[0].text;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({scores:{},feedback:"Reviewed."})}]}}]})};};
  const {server,base}=await start({env:{GEMINI_API_KEY:"test"},fetchImpl});
  try{await post(base,payload({privacy:{anonymise:true,sendCode:false,stripIdentifiers:true,studentNames:[]}}));assert.doesNotMatch(prompt,/print\(|def /);}
  finally{server.close();}
});

test("analyze: falls back to offline rules when Gemini fails", async () => {
  const bad = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const garbage = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "no json here" }] } }] }) });
  for (const fetchImpl of [bad, garbage, async () => { throw new Error("network"); }]) {
    const { server, base } = await start({ env: { GEMINI_API_KEY: "k" }, fetchImpl });
    try {
      const data = await (await post(base, payload())).json();
      assert.equal(data.engine, "heuristic");
      assert.match(data.warning, /offline rules/);
      assert.equal(data.scores.testing.score, 3);
    } finally { server.close(); }
  }
});

test("llm helpers: JSON extraction and prompt hygiene", () => {
  assert.deepEqual(extractJson('prefix {"a":1} suffix'), { a: 1 });
  assert.throws(() => extractJson("nothing"));
  const prompt = buildPrompt({ rubric, submission: { student: 'Eve"<x>', code: "print(1)" }, notes: "good", tone: "direct" });
  assert.match(prompt, /Student name: Evex/);
  assert.match(prompt, /Instructor notes:\ngood/);
  assert.match(prompt, /direct and concise/);
});
