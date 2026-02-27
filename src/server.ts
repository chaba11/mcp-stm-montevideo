import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { CkanClient } from "./data/ckan-client.js";
import { registerBuscarParada } from "./tools/buscar-parada.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as {
  version: string;
};

export function createServer(client?: CkanClient): McpServer {
  const server = new McpServer({
    name: "stm-montevideo",
    version: pkg.version,
  });

  const ckanClient = client ?? new CkanClient();

  // Register MCP tools
  registerBuscarParada(server, ckanClient);

  return server;
}
