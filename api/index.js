"use strict";
// Vercel serverless entry point: reuses the same request handler as server.js.
const { createServer } = require("../server.js");
module.exports = createServer().handler;
