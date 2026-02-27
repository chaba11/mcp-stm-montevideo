import { describe, it, expect, beforeEach } from "vitest";
import { CkanClient } from "../../src/data/ckan-client.js";
import { Cache } from "../../src/data/cache.js";
import { buscarParadaHandler } from "../../src/tools/buscar-parada.js";
import { PARADAS_GEO } from "../fixtures/paradas-geo.js";

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
