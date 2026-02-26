import { describe, it, expect } from "vitest";
import {
  geocodeFromParadas,
  geocodeFromNominatim,
  geocodeIntersection,
  type NominatimResult,
} from "../../src/geo/geocode.js";
import { PARADAS_GEO } from "../fixtures/paradas-geo.js";

function makeFetch(results: NominatimResult, ok = true, status = 200) {
  return async (_url: string, _opts?: RequestInit) =>
    ({
      ok,
      status,
      json: async () => results,
    }) as unknown as Response;
}

describe("geocodeFromParadas", () => {
  it("finds BV ESPAÑA y LIBERTAD from paradas", () => {
    const result = geocodeFromParadas("BV ESPAÑA", "LIBERTAD", PARADAS_GEO);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-34.914, 1);
    expect(result!.lon).toBeCloseTo(-56.151, 1);
  });

  it("finds 18 DE JULIO y EJIDO", () => {
    const result = geocodeFromParadas("18 DE JULIO", "EJIDO", PARADAS_GEO);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-34.906, 1);
  });

  it("case insensitive: 'bv españa' matches 'BV ESPAÑA'", () => {
    const result = geocodeFromParadas("bv españa", "libertad", PARADAS_GEO);
    expect(result).not.toBeNull();
  });

  it("diacritics insensitive: 'espana' matches 'ESPAÑA'", () => {
    const result = geocodeFromParadas("espana", "libertad", PARADAS_GEO);
    expect(result).not.toBeNull();
  });

  it("abbreviation: 'bulevar españa' matches 'BV ESPAÑA'", () => {
    const result = geocodeFromParadas("bulevar españa", "libertad", PARADAS_GEO);
    expect(result).not.toBeNull();
  });

  it("abbreviation: 'avenida italia' matches 'AV ITALIA'", () => {
    const result = geocodeFromParadas("avenida italia", "bulevar artigas", PARADAS_GEO);
    expect(result).not.toBeNull();
  });

  it("handles street swap (calle2 y calle1 order)", () => {
    const result1 = geocodeFromParadas("BV ESPAÑA", "LIBERTAD", PARADAS_GEO);
    const result2 = geocodeFromParadas("LIBERTAD", "BV ESPAÑA", PARADAS_GEO);
    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
  });

  it("single street search (no calle2)", () => {
    const result = geocodeFromParadas("BV ESPAÑA", "", PARADAS_GEO);
    expect(result).not.toBeNull();
  });

  it("edge: empty calle1 returns null", () => {
    const result = geocodeFromParadas("", "LIBERTAD", PARADAS_GEO);
    expect(result).toBeNull();
  });

  it("edge: street not found returns null", () => {
    const result = geocodeFromParadas("CALLE INVENTADA", "NO EXISTE", PARADAS_GEO);
    expect(result).toBeNull();
  });

  it("handles numbers in street name: '21 DE SETIEMBRE'", () => {
    const result = geocodeFromParadas("21 DE SETIEMBRE", "JOSE ENRIQUE RODO", PARADAS_GEO);
    expect(result).not.toBeNull();
  });

  it("handles empty paradas array", () => {
    const result = geocodeFromParadas("BV ESPAÑA", "LIBERTAD", []);
    expect(result).toBeNull();
  });
});

describe("geocodeFromNominatim", () => {
  it("parses Nominatim response correctly", async () => {
    const mockResults: NominatimResult = [
      { lat: "-34.9045", lon: "-56.1738", display_name: "Bulevar España, Montevideo", type: "highway" },
    ];
    const result = await geocodeFromNominatim("BV ESPAÑA", "LIBERTAD", makeFetch(mockResults) as typeof fetch);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-34.9045, 4);
    expect(result!.lon).toBeCloseTo(-56.1738, 4);
  });

  it("returns null on empty response", async () => {
    const result = await geocodeFromNominatim("NOWHERE", "STREET", makeFetch([]) as typeof fetch);
    expect(result).toBeNull();
  });

  it("throws on HTTP error (429 rate limit)", async () => {
    await expect(
      geocodeFromNominatim("A", "B", makeFetch([], false, 429) as typeof fetch)
    ).rejects.toThrow("HTTP 429");
  });

  it("filters out-of-Montevideo results (prefers Montevideo bbox)", async () => {
    const mockResults: NominatimResult = [
      // Buenos Aires (wrong city)
      { lat: "-34.6000", lon: "-58.4000", display_name: "Calle Rivera, Buenos Aires", type: "highway" },
      // Montevideo (correct)
      { lat: "-34.9060", lon: "-56.1880", display_name: "Rivera, Montevideo", type: "highway" },
    ];
    const result = await geocodeFromNominatim("RIVERA", "", makeFetch(mockResults) as typeof fetch);
    expect(result).not.toBeNull();
    // Should prefer the Montevideo result
    expect(result!.lat).toBeCloseTo(-34.906, 1);
    expect(result!.lon).toBeCloseTo(-56.188, 1);
  });
});

describe("geocodeIntersection", () => {
  it("uses paradas first when match found (no Nominatim call)", async () => {
    let nominatimCalled = false;
    const fetchFn = async () => {
      nominatimCalled = true;
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    };

    const result = await geocodeIntersection("BV ESPAÑA", "LIBERTAD", PARADAS_GEO, fetchFn as typeof fetch);
    expect(result).not.toBeNull();
    expect(nominatimCalled).toBe(false);
  });

  it("falls back to Nominatim when paradas don't match", async () => {
    const nominatimResult: NominatimResult = [
      { lat: "-34.9000", lon: "-56.1500", display_name: "Somewhere, Montevideo", type: "place" },
    ];
    const result = await geocodeIntersection(
      "CALLE INEXISTENTE",
      "ESQUINA FALSA",
      PARADAS_GEO,
      makeFetch(nominatimResult) as typeof fetch
    );
    expect(result).not.toBeNull();
  });

  it("edge: empty calle1 returns null without network call", async () => {
    let fetchCalled = false;
    const fetchFn = async () => {
      fetchCalled = true;
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    };
    const result = await geocodeIntersection("", "LIBERTAD", PARADAS_GEO, fetchFn as typeof fetch);
    expect(result).toBeNull();
    expect(fetchCalled).toBe(false);
  });
});
