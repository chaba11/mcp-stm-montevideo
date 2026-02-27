/**
 * Entry point for REST API mode.
 * Run with: node dist/api/index.js
 */
import { serve } from "@hono/node-server";
import { createRestApp } from "./rest-server.js";

const app = createRestApp();
const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`STM API running on http://localhost:${info.port}`);
  console.log(`Docs: http://localhost:${info.port}/api/docs`);
});
