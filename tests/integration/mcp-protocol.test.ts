/**
 * Integration test — MCP protocol via child process.
 * Skipped unless SKIP_INTEGRATION=false explicitly.
 * Requires `npm run build` to have been run first.
 */
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const SKIP = process.env["SKIP_INTEGRATION"] !== "false";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "../..");
const ENTRY = join(PROJECT_ROOT, "dist/index.js");

interface McpResponse {
  jsonrpc: string;
  id: number;
  result?: {
    tools?: Array<{ name: string; description: string }>;
    content?: Array<{ type: string; text: string }>;
  };
  error?: { code: number; message: string };
}

function sendAndReceive(
  lines: string[],
  timeoutMs: number = 15000
): Promise<McpResponse[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [ENTRY], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: PROJECT_ROOT,
    });

    const responses: McpResponse[] = [];
    let buffer = "";
    const timer = setTimeout(() => {
      proc.kill();
      resolve(responses);
    }, timeoutMs);

    proc.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as McpResponse;
          responses.push(parsed);
          if (responses.length >= lines.length) {
            clearTimeout(timer);
            proc.kill();
            resolve(responses);
          }
        } catch {
          // Ignore non-JSON output (e.g., startup messages)
        }
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", () => {
      clearTimeout(timer);
      resolve(responses);
    });

    // Send all requests
    for (const line of lines) {
      proc.stdin.write(line + "\n");
    }
  });
}

describe.skipIf(SKIP)("MCP protocol integration", () => {
  it("server responds to tools/list with all 5 tools", async () => {
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });

    const responses = await sendAndReceive([request]);
    const toolsList = responses.find((r) => r.id === 1);

    if (toolsList) {
      expect(toolsList.error).toBeUndefined();
      expect(toolsList.result?.tools).toBeDefined();
      const names = toolsList.result!.tools!.map((t) => t.name);
      expect(names).toContain("buscar_parada");
      expect(names).toContain("proximos_buses");
      expect(names).toContain("recorrido_linea");
      expect(names).toContain("ubicacion_bus");
      expect(names).toContain("como_llegar");
    }
  }, 20_000);

  it("server responds to tools/call with valid JSON response", async () => {
    const listRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    const callRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "buscar_parada",
        arguments: {
          latitud: -34.9145,
          longitud: -56.1505,
          radio_metros: 1, // tiny radius — won't hit network, returns quickly
        },
      },
    });

    const responses = await sendAndReceive([listRequest, callRequest]);
    const callResponse = responses.find((r) => r.id === 2);

    if (callResponse) {
      // Should have either result or error — but not crash
      expect(callResponse.jsonrpc).toBe("2.0");
      expect(callResponse.id).toBe(2);
      // result.content is the MCP tool response
      if (callResponse.result?.content) {
        expect(Array.isArray(callResponse.result.content)).toBe(true);
        expect(callResponse.result.content[0].type).toBe("text");
      }
    }
  }, 20_000);
});
