/**
 * OpenAPI spec validity tests.
 */
import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import { getOpenApiSpec } from "../../src/api/openapi.js";

const spec = parse(getOpenApiSpec()) as Record<string, unknown>;

describe("OpenAPI spec — structure", () => {
  it("parses as valid YAML", () => {
    expect(spec).toBeDefined();
    expect(typeof spec).toBe("object");
  });

  it("has openapi 3.0.x version", () => {
    expect(spec.openapi).toMatch(/^3\.0\.\d+$/);
  });

  it("has info.title and info.description", () => {
    const info = spec.info as Record<string, string>;
    expect(info.title).toBeDefined();
    expect(info.title.length).toBeGreaterThan(0);
    expect(info.description).toBeDefined();
    expect(info.description.length).toBeGreaterThan(0);
  });

  it("has info.version", () => {
    const info = spec.info as Record<string, string>;
    expect(info.version).toBeDefined();
  });

  it("has at least one server URL", () => {
    const servers = spec.servers as Array<{ url: string }>;
    expect(servers.length).toBeGreaterThan(0);
    expect(servers[0].url).toContain("http");
  });
});

describe("OpenAPI spec — paths", () => {
  const paths = spec.paths as Record<string, unknown>;

  const expectedPaths = [
    "/api/paradas/buscar",
    "/api/buses/proximos",
    "/api/lineas/{numero}/recorrido",
    "/api/buses/{linea}/ubicacion",
    "/api/como-llegar",
    "/api/health",
  ];

  it("defines all 6 API paths", () => {
    for (const p of expectedPaths) {
      expect(paths[p], `Missing path: ${p}`).toBeDefined();
    }
  });

  it("each GET path has parameters array", () => {
    const getPaths = [
      "/api/paradas/buscar",
      "/api/buses/proximos",
      "/api/lineas/{numero}/recorrido",
      "/api/buses/{linea}/ubicacion",
    ];
    for (const p of getPaths) {
      const endpoint = paths[p] as Record<string, { parameters?: unknown[] }>;
      expect(endpoint.get.parameters, `${p} missing parameters`).toBeDefined();
      expect(endpoint.get.parameters!.length).toBeGreaterThan(0);
    }
  });

  it("POST /api/como-llegar has requestBody", () => {
    const comoLlegar = paths["/api/como-llegar"] as Record<string, { requestBody?: unknown }>;
    expect(comoLlegar.post.requestBody).toBeDefined();
  });

  it("parameters have descriptions", () => {
    const paradas = paths["/api/paradas/buscar"] as Record<
      string,
      { parameters: Array<{ name: string; description?: string }> }
    >;
    for (const param of paradas.get.parameters) {
      expect(param.description, `Param ${param.name} missing description`).toBeDefined();
    }
  });

  it("parameters have example values where defined", () => {
    const paradas = paths["/api/paradas/buscar"] as Record<
      string,
      { parameters: Array<{ name: string; example?: unknown }> }
    >;
    // At least the first param should have an example
    const withExamples = paradas.get.parameters.filter((p) => p.example !== undefined);
    expect(withExamples.length).toBeGreaterThan(0);
  });

  it("each endpoint has response schemas", () => {
    for (const p of expectedPaths) {
      const endpoint = paths[p] as Record<string, { responses?: Record<string, unknown> }>;
      const method = p === "/api/como-llegar" ? "post" : "get";
      expect(endpoint[method].responses, `${p} missing responses`).toBeDefined();
      expect(endpoint[method].responses!["200"], `${p} missing 200 response`).toBeDefined();
    }
  });
});

describe("OpenAPI spec — components", () => {
  it("has Error schema in components", () => {
    const components = spec.components as Record<string, Record<string, unknown>>;
    expect(components.schemas.Error).toBeDefined();
  });

  it("Error schema has error, message, code properties", () => {
    const components = spec.components as Record<
      string,
      Record<string, { properties: Record<string, unknown> }>
    >;
    const errorSchema = components.schemas.Error;
    expect(errorSchema.properties.error).toBeDefined();
    expect(errorSchema.properties.message).toBeDefined();
    expect(errorSchema.properties.code).toBeDefined();
  });
});
