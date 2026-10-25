"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
test("visual system provides warm/dark themes, a short accessible intro, and reduced-motion support",()=>{
 const css=read("public/styles.css"),app=read("public/app.js"),html=read("public/index.html");
 for(const token of ["--paper:#f6f4ee","--brand:#1d5a43","--display:ui-serif","--paper:#121a16","--ink:#e8f0eb"])assert.ok(css.includes(token));
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/editorial-enter 360ms/);assert.match(app,/talkgrade-theme/);assert.match(app,/prefers-reduced-motion: reduce/);assert.match(app,/talkgrade-welcome-typed/);assert.match(html,/id="theme-toggle"/);assert.match(html,/id="welcome-title"/);assert.match(html,/aria-label="A clear path from submissions to feedback\."/);
});
test("team mode uses email/password accounts and has no Google sign-in surface",()=>{
 const html=read("public/team.html"),client=read("public/team.js"),server=read("server/team.js"),env=read(".env.example"),docs=read("docs/API.md");
 assert.match(html,/Sign in with email/);assert.match(html,/Create an account/);assert.match(client,/api\/auth\/login/);assert.match(client,/api\/auth\/register/);
 for(const source of [html,client,server,env,docs])assert.doesNotMatch(source,/google-oauth|google\/start|google\/callback|google_sub|GOOGLE_CLIENT|Continue with Google|Connect Google/i);
});
