import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";

describe("createServer", () => {
  it("returns an MCP server instance and client", () => {
    const { server, client } = createServer();
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
    expect(client).toBeDefined();
  });
});
