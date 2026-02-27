/**
 * REST API integration tests — multi-step flows using the API endpoints.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createRestApp } from "../../src/api/rest-server.js";
import { createMockClient } from "../tools/__helpers__/tool-test-utils.js";
import { GpsClient } from "../../src/data/gps-client.js";
import type { Hono } from "hono";

let app: Hono;

beforeAll(() => {
  const ckan = createMockClient();
  const gps = new GpsClient();
  app = createRestApp(ckan, gps);
});

function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

describe("REST API — integration flows", () => {
  it("search parada → use parada_id to get proximos", async () => {
    // Step 1: search for paradas
    const searchRes = await req(
      "/api/paradas/buscar?latitud=-34.9145&longitud=-56.1505&radio_metros=500"
    );
    expect(searchRes.status).toBe(200);
    const paradas = (await searchRes.json()) as Array<{ parada_id: number }>;
    expect(Array.isArray(paradas)).toBe(true);

    if (paradas.length > 0) {
      // Step 2: get proximos for first parada found
      const proximosRes = await req(
        `/api/buses/proximos?parada_id=${paradas[0].parada_id}`
      );
      expect(proximosRes.status).toBe(200);
    }
  });

  it("search parada by street → get recorrido for a linea", async () => {
    // Step 1: search by street name
    const searchRes = await req("/api/paradas/buscar?calle1=BV+ESPA%C3%91A&calle2=LIBERTAD");
    expect(searchRes.status).toBe(200);
    const body = await searchRes.json();
    expect(Array.isArray(body)).toBe(true);

    // Step 2: use the mock linea "181" for recorrido
    const recorridoRes = await req("/api/lineas/181/recorrido");
    expect(recorridoRes.status).toBe(200);
    const recorrido = await recorridoRes.json();
    expect(recorrido).toBeDefined();
  });

  it("health endpoint returns valid uptime", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      version: string;
      uptime_seconds: number;
    };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime_seconds).toBe("number");
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("OpenAPI spec is served as YAML", async () => {
    const res = await req("/api/openapi.yaml");
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type");
    expect(ct).toContain("text/yaml");
    const text = await res.text();
    expect(text).toContain("openapi:");
    expect(text).toContain("/api/paradas/buscar");
  });

  it("multiple endpoints work in sequence without interference", async () => {
    const r1 = await req("/api/health");
    expect(r1.status).toBe(200);

    const r2 = await req("/api/paradas/buscar?calle1=BV+ESPA%C3%91A");
    expect(r2.status).toBe(200);

    const r3 = await req("/api/lineas/181/recorrido");
    expect(r3.status).toBe(200);

    const r4 = await req("/api/buses/181/ubicacion");
    expect(r4.status).toBe(200);

    // Verify health still works after all other calls
    const r5 = await req("/api/health");
    expect(r5.status).toBe(200);
  });
});
