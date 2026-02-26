import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as {
  version: string;
};

export function createServer(): McpServer {
  const server = new McpServer({
    name: "stm-montevideo",
    version: pkg.version,
  });

  return server;
}
