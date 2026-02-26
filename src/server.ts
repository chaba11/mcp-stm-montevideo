import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerBuscarParada } from './tools/buscar-parada.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const pkg = require(join(__dirname, '../package.json'));

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'stm-montevideo',
    version: pkg.version ?? '0.1.0',
  });

  // Register all MCP tools
  registerBuscarParada(server);

  return server;
}
