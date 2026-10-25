"use strict";
// Vercel serverless entry point: reuses the same request handler as server.js.
// Team mode needs a writable SQLite database, which serverless hosting does not
// have; force it off so a stray TEAM_MODE=1 cannot crash the function.
process.env.TEAM_MODE = "0";
const { createServer } = require("../server.js");
module.exports = createServer().handler;
