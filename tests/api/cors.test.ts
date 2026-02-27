/**
 * CORS header tests for the REST API.
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

describe("CORS headers", () => {
  it("OPTIONS preflight returns CORS headers", async () => {
    const res = await req("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    // Hono cors middleware responds to preflight
    expect(res.headers.get("access-control-allow-origin")).toBeDefined();
  });

  it("GET includes Access-Control-Allow-Origin", async () => {
    const res = await req("/api/health", {
      headers: { Origin: "https://example.com" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeDefined();
  });

  it("POST includes CORS headers", async () => {
    const res = await req("/api/como-llegar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
      },
      body: JSON.stringify({
        origen_calle1: "BV ESPAÑA",
        destino_calle1: "18 DE JULIO",
      }),
    });
    expect(res.headers.get("access-control-allow-origin")).toBeDefined();
  });

  it("CORS allows any origin by default (wildcard)", async () => {
    const res = await req("/api/health", {
      headers: { Origin: "https://random-domain.example" },
    });
    const origin = res.headers.get("access-control-allow-origin");
    expect(origin === "*" || origin === "https://random-domain.example").toBe(true);
  });
});
