/**
 * REST API route tests — happy path, param handling, error cases, edge cases.
 * Uses Hono's test client (no real HTTP server needed).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createRestApp } from "../../src/api/rest-server.js";
import { createMockClient } from "../tools/__helpers__/tool-test-utils.js";
import { GpsClient } from "../../src/data/gps-client.js";
import type { Hono } from "hono";

let app: Hono;

beforeAll(() => {
  const ckan = createMockClient();
  const gps = new GpsClient(); // stub, no credentials
  app = createRestApp(ckan, gps);
});

/** Helper to make requests against the Hono app */
function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

// --- Happy path ---

describe("REST API — happy path", () => {
  it("GET /api/health returns 200 with status ok", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; version: string; uptime_seconds: number };
    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("GET /api/paradas/buscar with coords returns 200 array", async () => {
    const res = await req("/api/paradas/buscar?latitud=-34.9145&longitud=-56.1505&radio_metros=500");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/paradas/buscar with calle1+calle2 returns 200", async () => {
    const res = await req("/api/paradas/buscar?calle1=BV+ESPA%C3%91A&calle2=LIBERTAD");
    expect(res.status).toBe(200);
  });

  it("GET /api/buses/proximos with parada_id returns 200", async () => {
    const res = await req("/api/buses/proximos?parada_id=300");
    expect(res.status).toBe(200);
  });

  it("GET /api/lineas/181/recorrido returns 200 array", async () => {
    const res = await req("/api/lineas/181/recorrido");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/buses/181/ubicacion returns 200", async () => {
    const res = await req("/api/buses/181/ubicacion");
    expect(res.status).toBe(200);
  });

  it("POST /api/como-llegar with valid body returns 200", async () => {
    const res = await req("/api/como-llegar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origen_calle1: "BV ESPAÑA",
        destino_calle1: "18 DE JULIO",
      }),
    });
    expect(res.status).toBe(200);
  });
});

// --- Response format ---

describe("REST API — response format", () => {
  it("all responses are JSON content type", async () => {
    const res = await req("/api/health");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("success responses don't have error field", async () => {
    const res = await req("/api/health");
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeUndefined();
  });

  it("error responses have { error, message, code }", async () => {
    const res = await req("/api/paradas/buscar");
    expect(res.status).toBe(400);
    const body = await res.json() as { error: boolean; message: string; code: string };
    expect(body.error).toBe(true);
    expect(body.message).toBeDefined();
    expect(body.code).toBe("BAD_REQUEST");
  });
});

// --- Parameter handling ---

describe("REST API — parameter handling", () => {
  it("trims whitespace from query params", async () => {
    const res = await req("/api/paradas/buscar?calle1=%20BV+ESPA%C3%91A%20&calle2=%20LIBERTAD%20");
    expect(res.status).toBe(200);
  });

  it("empty string params treated as absent", async () => {
    const res = await req("/api/paradas/buscar?calle1=&latitud=-34.9145&longitud=-56.1505");
    expect(res.status).toBe(200);
  });

  it("radio_metros=abc returns 400 BAD_REQUEST", async () => {
    const res = await req("/api/paradas/buscar?calle1=test&radio_metros=abc");
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("cantidad=-5 returns 400 BAD_REQUEST", async () => {
    const res = await req("/api/buses/proximos?parada_id=300&cantidad=-5");
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("latitud=999 returns 400 BAD_REQUEST", async () => {
    const res = await req("/api/paradas/buscar?latitud=999&longitud=-56.15");
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("BAD_REQUEST");
  });
});

// --- Error cases ---

describe("REST API — error cases", () => {
  it("GET /api/paradas/buscar with no params returns 400", async () => {
    const res = await req("/api/paradas/buscar");
    expect(res.status).toBe(400);
    const body = await res.json() as { error: boolean; message: string };
    expect(body.error).toBe(true);
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("GET /api/buses/proximos with no parada_id and no calle returns 400", async () => {
    const res = await req("/api/buses/proximos");
    expect(res.status).toBe(400);
  });

  it("GET /api/lineas/999999/recorrido returns 404", async () => {
    const res = await req("/api/lineas/999999/recorrido");
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  it("POST /api/como-llegar with empty body returns 400", async () => {
    const res = await req("/api/como-llegar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/como-llegar with missing destino returns 400", async () => {
    const res = await req("/api/como-llegar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origen_calle1: "test" }),
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/nonexistent returns 404", async () => {
    const res = await req("/api/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("NOT_FOUND");
  });
});

// --- Edge cases ---

describe("REST API — edge cases", () => {
  it("URL-encoded special chars decoded correctly", async () => {
    const res = await req("/api/paradas/buscar?calle1=18+de+Julio");
    // Should not crash, may return data or not found
    expect(res.status).toBeLessThan(500);
  });

  it("Unicode in query works", async () => {
    const res = await req("/api/paradas/buscar?calle1=Jos%C3%A9+Ellauri");
    expect(res.status).toBeLessThan(500);
  });

  it("very long query string doesn't crash", async () => {
    const longCalle = "A".repeat(2000);
    const res = await req(`/api/paradas/buscar?calle1=${longCalle}`);
    expect(res.status).toBeLessThan(500);
  });

  it("10 concurrent requests all resolve", async () => {
    const promises = Array.from({ length: 10 }, () => req("/api/health"));
    const responses = await Promise.all(promises);
    expect(responses.length).toBe(10);
    for (const r of responses) {
      expect(r.status).toBe(200);
    }
  });
});
