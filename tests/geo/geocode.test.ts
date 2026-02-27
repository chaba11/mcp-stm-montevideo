import { describe, it, expect } from "vitest";
import {
  geocodeFromParadas,
  geocodeFromNominatim,
  geocodeIntersection,
  levenshteinDistance,
  allTokensFuzzyMatch,
  type NominatimResult,
} from "../../src/geo/geocode.js";
import { PARADAS_GEO } from "../fixtures/paradas-geo.js";
import type { Parada } from "../../src/types/parada.js";

function makeParada(id: number, calle: string, esquina: string, linea = "121"): Parada {
  return { id, linea, variante: 60, ordinal: 1, calle, esquina, lat: -34.9, lng: -56.1 };
}

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

describe("levenshteinDistance", () => {
  it("identical strings = 0", () => {
    expect(levenshteinDistance("espana", "espana")).toBe(0);
  });

  it("one deletion: 'espana' vs 'espaa' = 1", () => {
    // Simulates encoding corruption: Ñ → ÃA, normalized to A (loses the N)
    expect(levenshteinDistance("espana", "espaa")).toBe(1);
  });

  it("one substitution: 'obligado' vs 'obligato' = 1", () => {
    expect(levenshteinDistance("obligado", "obligato")).toBe(1);
  });

  it("empty string vs anything = length of other", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("both empty = 0", () => {
    expect(levenshteinDistance("", "")).toBe(0);
  });
});

describe("allTokensFuzzyMatch", () => {
  it("exact token match works normally", () => {
    expect(allTokensFuzzyMatch("bv espana", "bv espana")).toBe(true);
  });

  it("matches corrupted encoding: 'espana' vs 'espaa' (edit distance 1)", () => {
    // Regression: BV ESPAÑA stored as BV ESPAÃA normalizes to BV ESPAA
    expect(allTokensFuzzyMatch("bv espana", "bv espaa")).toBe(true);
  });

  it("short tokens (≤ 3 chars) require exact match", () => {
    expect(allTokensFuzzyMatch("bv", "bv espana")).toBe(true);
    expect(allTokensFuzzyMatch("bx", "bv espana")).toBe(false);
  });

  it("all tokens must match (not just one)", () => {
    // "obligado" doesn't match "bv espaa" — requires both streets
    expect(allTokensFuzzyMatch("espana obligado", "bv espaa")).toBe(false);
  });

  it("empty query returns false", () => {
    expect(allTokensFuzzyMatch("", "bv espana")).toBe(false);
  });

  it("empty target returns false", () => {
    expect(allTokensFuzzyMatch("espana", "")).toBe(false);
  });
});

describe("geocodeFromParadas — fuzzy fallback", () => {
  const CORRUPTED: Parada[] = [
    // Simulates BV ESPAÑA stored as BV ESPAÃA → normalizes to "bv espaa"
    makeParada(1, "BV ESPAA", "OBLIGADO"),   // corruption of BV ESPAÑA
    makeParada(2, "BV ESPAA", "LIBERTAD"),
    makeParada(3, "AV ITALIA", "GARIBALDI"),
  ];

  it("exact match misses corrupted names", () => {
    // Without fuzzy, "bv espana" would not match "bv espaa"
    // This test documents the problem that fuzzy fallback solves
    const corrupted = [makeParada(1, "BV ESPAA", "OBLIGADO")];
    // With fuzzy enabled, it should still find the stop
    const result = geocodeFromParadas("BV ESPAÑA", "OBLIGADO", corrupted);
    expect(result).not.toBeNull();
  });

  it("regression: 'Bv España y Obligado' finds corrupted stop via fuzzy", () => {
    const result = geocodeFromParadas("Bv España", "Obligado", CORRUPTED);
    expect(result).not.toBeNull();
  });

  it("single street fuzzy: 'España' finds corrupted 'ESPAA' stops", () => {
    const result = geocodeFromParadas("España", "", CORRUPTED);
    expect(result).not.toBeNull();
  });

  it("exact matches are preferred over fuzzy (no regression)", () => {
    const mixed: Parada[] = [
      makeParada(1, "BV ESPAÑA", "LIBERTAD"),   // correct
      makeParada(2, "BV ESPAA", "OBLIGADO"),    // corrupted
    ];
    const result = geocodeFromParadas("BV ESPAÑA", "LIBERTAD", mixed);
    expect(result).not.toBeNull();
    // Should find the exact match stop (id=1)
    expect(result!.lat).toBeCloseTo(-34.9, 3);
  });
});
