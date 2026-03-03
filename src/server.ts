import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { CkanClient } from "./data/ckan-client.js";
import { registerBuscarParada } from "./tools/buscar-parada.js";
import { registerProximosBuses } from "./tools/proximos-buses.js";
import { registerRecorridoLinea } from "./tools/recorrido-linea.js";
import { registerUbicacionBus } from "./tools/ubicacion-bus.js";
import { GpsClient } from "./data/gps-client.js";
import { StopMapper } from "./data/stop-mapper.js";
import { registerComoLlegar } from "./tools/como-llegar.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let pkgVersion = "0.1.0";
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as {
    version: string;
  };
  pkgVersion = pkg.version;
} catch {
  // fallback when bundled path differs from source path
}

export function createServer(client?: CkanClient): McpServer {
  const server = new McpServer({
    name: "stm-montevideo",
    version: pkgVersion,
  });

  const ckanClient = client ?? new CkanClient();
  const gps = new GpsClient({
    clientId: process.env.STM_CLIENT_ID,
    clientSecret: process.env.STM_CLIENT_SECRET,
  });

  const stopMapper = new StopMapper(gps);

  // Register MCP tools
  registerBuscarParada(server, ckanClient);
  registerProximosBuses(server, ckanClient, gps, stopMapper);
  registerRecorridoLinea(server, ckanClient);
  registerUbicacionBus(server, gps);
  registerComoLlegar(server, ckanClient);

  return server;
}
