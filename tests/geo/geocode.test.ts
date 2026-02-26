import { describe, it, expect } from "vitest";
import {
  geocodeFromParadas,
  geocodeFromNominatim,
  geocodeIntersection,
  type NominatimResult,
} from "../../src/geo/geocode.js";
import type { Parada } from "../../src/types/parada.js";

function makeParada(id: number, calle: string, esquina: string, lat: number, lng: number): Parada {
  return { id, linea: "181", variante: 52, ordinal: 1, calle, esquina, lat, lng };
}

const PARADAS: Parada[] = [
  makeParada(1, "BV ESPAÑA", "LIBERTAD", -34.9045, -56.1738),
  makeParada(2, "BV ESPAÑA", "LIBERTAD", -34.9048, -56.1741),
  makeParada(3, "AV ITALIA", "GARIBALDI", -34.8800, -56.0700),
  makeParada(4, "GARIBALDI", "AV ITALIA", -34.8802, -56.0702),
];

function makeFetchMock(results: NominatimResult) {
  return async (_url: string, _opts?: RequestInit) =>
    ({
      ok: true,
      status: 200,
      json: async () => results,
    }) as unknown as Response;
}

describe("geocodeFromParadas", () => {
  it("finds intersection from parada names", () => {
    const result = geocodeFromParadas("BV ESPAÑA", "LIBERTAD", PARADAS);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-34.9046, 2);
    expect(result!.lon).toBeCloseTo(-56.1739, 2);
  });

  it("finds intersection when streets are swapped", () => {
    const result = geocodeFromParadas("LIBERTAD", "BV ESPAÑA", PARADAS);
    expect(result).not.toBeNull();
  });

  it("returns null when no matching paradas", () => {
    const result = geocodeFromParadas("INEXISTENTE", "CALLE", PARADAS);
    expect(result).toBeNull();
  });

  it("handles diacritics in query (españa matches ESPAÑA)", () => {
    const result = geocodeFromParadas("españa", "libertad", PARADAS);
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
      {
        lat: "-34.9045",
        lon: "-56.1738",
        display_name: "Bulevar España, Montevideo, Uruguay",
        type: "highway",
      },
    ];
    const fetchFn = makeFetchMock(mockResults);
    const result = await geocodeFromNominatim("BV ESPAÑA", "LIBERTAD", fetchFn as typeof fetch);

    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-34.9045, 4);
    expect(result!.lon).toBeCloseTo(-56.1738, 4);
  });

  it("returns null on empty Nominatim response", async () => {
    const fetchFn = makeFetchMock([]);
    const result = await geocodeFromNominatim("NOWHERE", "STREET", fetchFn as typeof fetch);
    expect(result).toBeNull();
  });

  it("throws on Nominatim HTTP error", async () => {
    const fetchFn = async () =>
      ({ ok: false, status: 429 }) as unknown as Response;
    await expect(
      geocodeFromNominatim("A", "B", fetchFn as typeof fetch)
    ).rejects.toThrow("HTTP 429");
  });
});

describe("geocodeIntersection", () => {
  it("uses paradas first (no Nominatim call needed)", async () => {
    let nominatimCalled = false;
    const fetchFn = async () => {
      nominatimCalled = true;
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    };

    const result = await geocodeIntersection(
      "BV ESPAÑA",
      "LIBERTAD",
      PARADAS,
      fetchFn as typeof fetch
    );
    expect(result).not.toBeNull();
    expect(nominatimCalled).toBe(false);
  });

  it("falls back to Nominatim when paradas don't match", async () => {
    const nominatimResult: NominatimResult = [
      { lat: "-34.9000", lon: "-56.1500", display_name: "Somewhere", type: "place" },
    ];
    const fetchFn = makeFetchMock(nominatimResult);

    const result = await geocodeIntersection(
      "CALLE INEXISTENTE",
      "ESQUINA FALSA",
      PARADAS,
      fetchFn as typeof fetch
    );
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-34.9, 1);
  });
});
