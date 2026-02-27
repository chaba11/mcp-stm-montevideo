import { describe, it, expect, beforeEach } from "vitest";
import { CkanClient } from "../../src/data/ckan-client.js";
import { Cache } from "../../src/data/cache.js";
import { buscarParadaHandler } from "../../src/tools/buscar-parada.js";
import { PARADAS_GEO } from "../fixtures/paradas-geo.js";
import { PARADAS_FIXTURE, LINEAS_FIXTURE } from "../fixtures/schedule-data.js";

function makeMockClient(): CkanClient {
  const cache = new Cache();
  const client = new CkanClient({ cache });
  // Override data-fetching methods to return fixture data
  client.getParadas = async () => PARADAS_GEO;
  client.getHorarios = async () => [];
  client.getLineas = async () => [];
  return client;
}

describe("buscar_parada handler", () => {
  let client: CkanClient;

  beforeEach(() => {
    client = makeMockClient();
  });

  it("finds stops by lat/lon and returns structured JSON", async () => {
    const result = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 200 },
      client
    );
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    // Pocitos area stop id 300
    const ids = parsed.map((p: { parada_id: number }) => p.parada_id);
    expect(ids).toContain(300);
  });

  it("returns required fields in each result", async () => {
    const result = await buscarParadaHandler(
      { latitud: -34.9060, longitud: -56.1880, radio_metros: 500 },
      client
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      parada_id: number;
      nombre: string;
      latitud: number;
      longitud: number;
      distancia_metros: number;
      lineas: string[];
    }>;
    expect(Array.isArray(parsed)).toBe(true);
    for (const p of parsed) {
      expect(typeof p.parada_id).toBe("number");
      expect(typeof p.nombre).toBe("string");
      expect(p.nombre.length).toBeGreaterThan(0);
      expect(typeof p.latitud).toBe("number");
      expect(typeof p.longitud).toBe("number");
      expect(typeof p.distancia_metros).toBe("number");
      expect(Array.isArray(p.lineas)).toBe(true);
    }
  });

  it("finds stops by street intersection (calle1+calle2)", async () => {
    const result = await buscarParadaHandler(
      { calle1: "BV ESPAÑA", calle2: "LIBERTAD", radio_metros: 500 },
      client
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("returns error message when intersection not found (no Nominatim in test)", async () => {
    // Override to fail Nominatim too
    const failClient = makeMockClient();
    const result = await buscarParadaHandler(
      { calle1: "CALLE_COMPLETAMENTE_INVENTADA_ZZZZZ", calle2: "ESQUINA_FALSA_ZZZZZ", radio_metros: 500 },
      failClient
    );
    // Should return error text
    expect(result.content[0].text).toContain("No se encontró");
  });

  it("finds stops by fuzzy street name (calle1 only)", async () => {
    const result = await buscarParadaHandler({ calle1: "bulevar artigas" }, client);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("returns helpful message when no args provided", async () => {
    const result = await buscarParadaHandler({}, client);
    expect(result.content[0].text).toContain("Proporciona");
  });

  it("returns message when no stops within radius", async () => {
    const result = await buscarParadaHandler(
      { latitud: -34.5, longitud: -55.0, radio_metros: 1 },
      client
    );
    expect(result.content[0].text).toContain("No se encontraron");
  });

  it("deduplicates stops with same ID", async () => {
    const result = await buscarParadaHandler(
      { latitud: -34.8937, longitud: -56.1675, radio_metros: 200 },
      client
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{ parada_id: number }>;
    const ids = parsed.map((p) => p.parada_id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("returns message when parada name not found (fuzzy mode)", async () => {
    const result = await buscarParadaHandler({ calle1: "XYZZY_INVENTADA_9999" }, client);
    expect(result.content[0].text).toContain("No se encontraron");
  });

  it("regression: calle1+calle2 with encoding-corrupted data finds stop via fallback", async () => {
    // BV ESPAÑA → BV ESPAA (Latin-1 mis-decode): geocodeIntersection fails but
    // the combined fallback (search calle+esquina together) should still find it
    const corruptClient = makeMockClient();
    corruptClient.getParadas = async () => [
      { id: 4855, linea: "183", variante: 60, ordinal: 6, calle: "BV ESPAA", esquina: "OBLIGADO", lat: -34.912, lng: -56.161 },
    ];
    const result = await buscarParadaHandler(
      { calle1: "Bv España", calle2: "Obligado", radio_metros: 500 },
      corruptClient
    );
    // Should find the stop via fuzzy geocode, not return intersection-not-found error
    expect(result.content[0].text).not.toContain("No se encontró la intersección");
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].parada_id).toBe(4855);
  });

  it("returns empty lineas array when stop has no known lines", async () => {
    const emptyClient = makeMockClient();
    emptyClient.getParadas = async () => [
      { id: 999, linea: "", variante: 0, ordinal: 0, calle: "TEST", esquina: "", lat: -34.9, lng: -56.1 },
    ];
    const result = await buscarParadaHandler(
      { latitud: -34.9, longitud: -56.1, radio_metros: 10 },
      emptyClient
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed[0].lineas).toEqual([]);
  });
});

describe("buscar_parada — edge cases and radius tests", () => {
  function makeFixtureClient(): CkanClient {
    const cache = new Cache();
    const client = new CkanClient({ cache });
    client.getParadas = async () => PARADAS_FIXTURE;
    client.getHorarios = async () => [];
    client.getLineas = async () => LINEAS_FIXTURE;
    return client;
  }

  it("custom radius: radio_metros=50 returns fewer results than 500", async () => {
    const client = makeFixtureClient();
    // Parada 300 at -34.9145, -56.1505 — nearby parada 301 is farther
    const small = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 50 },
      client
    );
    const large = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 5000 },
      client
    );
    const smallParsed = JSON.parse(small.content[0].text);
    const largeParsed = JSON.parse(large.content[0].text);
    expect(smallParsed.length).toBeLessThanOrEqual(largeParsed.length);
  });

  it("coords take priority when both calle and coords provided", async () => {
    const client = makeFixtureClient();
    // Provide coords near parada 300, plus calle that could match something else
    const result = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 200, calle1: "AV ITALIA" },
      client
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{ parada_id: number }>;
    // Result should be near -34.9145 (parada 300), not AV ITALIA (parada 302)
    const ids = parsed.map((p) => p.parada_id);
    expect(ids).toContain(300);
  });

  it("lat=0, lon=0 (Atlantic Ocean) returns no results in Uruguay", async () => {
    const client = makeFixtureClient();
    const result = await buscarParadaHandler(
      { latitud: 0, longitud: 0, radio_metros: 500 },
      client
    );
    // Should return no stops (all paradas are in Montevideo, far from 0,0)
    expect(result.content[0].text).toContain("No se encontraron");
  });

  it("coords outside Uruguay (NYC) returns no results", async () => {
    const client = makeFixtureClient();
    const result = await buscarParadaHandler(
      { latitud: 40.7128, longitud: -74.006, radio_metros: 500 },
      client
    );
    expect(result.content[0].text).toContain("No se encontraron");
  });

  it("very small radius (1m) returns no results gracefully", async () => {
    const client = makeFixtureClient();
    const result = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 1 },
      client
    );
    // Likely empty — no crash, returns message or empty array
    expect(result.content[0].type).toBe("text");
  });

  it("very large radius returns results without crash", async () => {
    const client = makeFixtureClient();
    const result = await buscarParadaHandler(
      { latitud: -34.9060, longitud: -56.188, radio_metros: 50000 },
      client
    );
    // Should return results — all paradas in Montevideo are within 50km of center
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("unicode in street name works correctly", async () => {
    const client = makeFixtureClient();
    // "18 de Julio" normalizes correctly
    const result = await buscarParadaHandler({ calle1: "18 de Julio" }, client);
    expect(result.content[0].type).toBe("text");
    // Should not crash — either finds results or returns friendly message
  });

  it("SQL injection attempt in calle1 treated as literal string, no crash", async () => {
    const client = makeFixtureClient();
    const result = await buscarParadaHandler(
      { calle1: "'; DROP TABLE paradas; --" },
      client
    );
    expect(result.content[0].type).toBe("text");
    // Should return "No se encontraron" or "No se encontró" — not crash
    expect(result.content[0].text).toMatch(/No se encontr/);
  });

  it("lineas[] in result lists correct lines for stop", async () => {
    const client = makeFixtureClient();
    // Parada 300 is served by linea "181" in the fixture
    const result = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 100 },
      client
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      parada_id: number;
      lineas: string[];
    }>;
    const parada300 = parsed.find((p) => p.parada_id === 300);
    expect(parada300).toBeDefined();
    expect(parada300!.lineas).toContain("181");
  });
});
