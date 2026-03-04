/**
 * MCP protocol compliance tests — in-process via InMemoryTransport.
 * Tests tool registration, schema validation, and error handling.
 */
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { createMockClient } from "../tools/__helpers__/tool-test-utils.js";
import type { CkanClient } from "../../src/data/ckan-client.js";

const TOOL_NAMES = ["buscar_parada", "proximos_buses", "recorrido_linea", "ubicacion_bus", "como_llegar"];

async function createTestPair(mockCkanClient?: CkanClient) {
  const ckan = mockCkanClient ?? createMockClient();
  const { server } = createServer(ckan);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcpClient = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  await mcpClient.connect(clientTransport);
  return { mcpClient, server };
}

describe("MCP protocol — tools/list", () => {
  it("returns all 5 tools", async () => {
    const { mcpClient } = await createTestPair();
    const { tools } = await mcpClient.listTools();
    expect(tools.length).toBe(5);
    const names = tools.map((t) => t.name);
    for (const name of TOOL_NAMES) {
      expect(names).toContain(name);
    }
  });

  it("each tool has a non-empty description", async () => {
    const { mcpClient } = await createTestPair();
    const { tools } = await mcpClient.listTools();
    for (const tool of tools) {
      expect(tool.description, `tool ${tool.name} missing description`).toBeDefined();
      expect((tool.description ?? "").length).toBeGreaterThan(10);
    }
  });

  it("each tool has inputSchema of type object", async () => {
    const { mcpClient } = await createTestPair();
    const { tools } = await mcpClient.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.inputSchema.properties).toBe("object");
    }
  });

  it("each tool schema property has a description", async () => {
    const { mcpClient } = await createTestPair();
    const { tools } = await mcpClient.listTools();
    for (const tool of tools) {
      const props = tool.inputSchema.properties ?? {};
      for (const [propName, propDef] of Object.entries(props)) {
        const def = propDef as Record<string, unknown>;
        expect(def.description, `${tool.name}.${propName} missing description`).toBeDefined();
        expect((def.description as string).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("MCP protocol — tools/call", () => {
  it("buscar_parada with valid coords returns text content", async () => {
    const { mcpClient } = await createTestPair();
    const result = await mcpClient.callTool({
      name: "buscar_parada",
      arguments: { latitud: -34.9145, longitud: -56.1505, radio_metros: 500 },
    });
    expect(result.content).toBeDefined();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].type).toBe("text");
    expect(content[0].text.length).toBeGreaterThan(0);
  });

  it("unknown tool name returns isError result with message", async () => {
    const { mcpClient } = await createTestPair();
    const result = await mcpClient.callTool({ name: "nonexistent_tool", arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("nonexistent_tool");
  });

  it("proximos_buses with no parada identifier returns helpful message", async () => {
    const { mcpClient } = await createTestPair();
    const result = await mcpClient.callTool({ name: "proximos_buses", arguments: {} });
    expect(result.isError).toBeUndefined();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Proporciona");
  });

  it("buscar_parada with no args returns helpful message", async () => {
    const { mcpClient } = await createTestPair();
    const result = await mcpClient.callTool({ name: "buscar_parada", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Proporciona");
  });

  it("wrong type (string for number) returns isError with type info", async () => {
    const { mcpClient } = await createTestPair();
    const result = await mcpClient.callTool({
      name: "buscar_parada",
      arguments: { latitud: "not-a-number", longitud: -56.1505 },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text.length).toBeGreaterThan(0);
  });

  it("extra unknown args are ignored, no crash", async () => {
    const { mcpClient } = await createTestPair();
    const result = await mcpClient.callTool({
      name: "buscar_parada",
      arguments: {
        latitud: -34.9145,
        longitud: -56.1505,
        radio_metros: 100,
        completely_unknown_field: "ignored",
      },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");
    expect(result.isError).toBeFalsy();
  });

  it("5 concurrent tool calls all resolve correctly", async () => {
    const { mcpClient } = await createTestPair();
    const calls = Array.from({ length: 5 }, (_, i) =>
      mcpClient.callTool({
        name: "buscar_parada",
        arguments: { latitud: -34.9145 + i * 0.001, longitud: -56.1505, radio_metros: 500 },
      })
    );
    const results = await Promise.all(calls);
    expect(results.length).toBe(5);
    for (const r of results) {
      const content = r.content as Array<{ type: string; text: string }>;
      expect(content[0].type).toBe("text");
    }
  });

  it("sequential calls after first request still work (server lifecycle)", async () => {
    const { mcpClient } = await createTestPair();
    const r1 = await mcpClient.callTool({
      name: "buscar_parada",
      arguments: { latitud: -34.9145, longitud: -56.1505 },
    });
    const r2 = await mcpClient.callTool({
      name: "recorrido_linea",
      arguments: { linea: "181" },
    });
    const c1 = r1.content as Array<{ type: string; text: string }>;
    const c2 = r2.content as Array<{ type: string; text: string }>;
    expect(c1[0].type).toBe("text");
    expect(c2[0].type).toBe("text");
  });

  it("recorrido_linea with empty paradas returns message not crash", async () => {
    const empty = createMockClient({ paradas: [] });
    const { mcpClient } = await createTestPair(empty);
    const result = await mcpClient.callTool({
      name: "recorrido_linea",
      arguments: { linea: "181" },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");
    expect(content[0].text.length).toBeGreaterThan(0);
    expect(result.isError).toBeFalsy();
  });

  it("ubicacion_bus with valid linea returns text content (stub)", async () => {
    const { mcpClient } = await createTestPair();
    const result = await mcpClient.callTool({
      name: "ubicacion_bus",
      arguments: { linea: "181" },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");
    expect(content[0].text.length).toBeGreaterThan(0);
  });

  it("como_llegar with no matching routes returns message not crash", async () => {
    const empty = createMockClient({ paradas: [] });
    const { mcpClient } = await createTestPair(empty);
    const result = await mcpClient.callTool({
      name: "como_llegar",
      arguments: {
        origen_calle1: "NONEXISTENT",
        destino_calle1: "ALSO_NONE",
      },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");
    expect(result.isError).toBeFalsy();
  });
});
