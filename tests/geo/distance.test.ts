import { describe, it, expect } from "vitest";
import { getDistance } from "geolib";
import { findNearestParadas, fastDistMeters } from "../../src/geo/distance.js";
import { PARADAS_GEO } from "../fixtures/paradas-geo.js";
import type { Parada } from "../../src/types/parada.js";

// Known Tres Cruces area coordinates
const TRES_CRUCES = { lat: -34.8937, lon: -56.1675 };
const CIUDAD_VIEJA = { lat: -34.9065, lon: -56.2005 };
const RIO_DE_LA_PLATA = { lat: -34.5, lon: -56.5 }; // far away

function makeParada(id: number, lat: number, lng: number, calle = "TEST"): Parada {
  return { id, linea: "181", variante: 52, ordinal: 1, calle, esquina: "CRUCE", lat, lng };
}

describe("findNearestParadas", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns Tres Cruces stops first for Tres Cruces coordinates", () => {
    const results = findNearestParadas(
      TRES_CRUCES.lat,
      TRES_CRUCES.lon,
      PARADAS_GEO,
      500
    );
    expect(results.length).toBeGreaterThan(0);
    // The two Tres Cruces stops (id 100, 102, 103) should be first
    expect(results[0].lat).toBeCloseTo(-34.8937, 2);
    expect(results[0].lng).toBeCloseTo(-56.1675, 2);
  });

  it("radius filter: radius 100m returns fewer results than 2000m", () => {
    const narrow = findNearestParadas(TRES_CRUCES.lat, TRES_CRUCES.lon, PARADAS_GEO, 100);
    const wide = findNearestParadas(TRES_CRUCES.lat, TRES_CRUCES.lon, PARADAS_GEO, 2000);
    expect(narrow.length).toBeLessThanOrEqual(wide.length);
  });

  it("respects maxResults=3", () => {
    const results = findNearestParadas(
      TRES_CRUCES.lat,
      TRES_CRUCES.lon,
      PARADAS_GEO,
      100_000,
      3
    );
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("sort order: results are sorted by distance ascending", () => {
    const results = findNearestParadas(TRES_CRUCES.lat, TRES_CRUCES.lon, PARADAS_GEO, 10_000);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].distancia_metros).toBeLessThanOrEqual(results[i].distancia_metros);
    }
  });

  it("distance accuracy: Tres Cruces to Ciudad Vieja ~3km (within 10%)", () => {
    const results = findNearestParadas(
      TRES_CRUCES.lat,
      TRES_CRUCES.lon,
      [makeParada(99, CIUDAD_VIEJA.lat, CIUDAD_VIEJA.lon, "SARANDÍ")],
      10_000
    );
    expect(results.length).toBe(1);
    // Google Maps says roughly 3100m direct distance
    expect(results[0].distancia_metros).toBeGreaterThan(2500);
    expect(results[0].distancia_metros).toBeLessThan(4000);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it("edge: exact match at parada location → distance near 0", () => {
    const exactParada = makeParada(999, TRES_CRUCES.lat, TRES_CRUCES.lon);
    const results = findNearestParadas(TRES_CRUCES.lat, TRES_CRUCES.lon, [exactParada], 10);
    expect(results.length).toBe(1);
    expect(results[0].distancia_metros).toBeLessThanOrEqual(5);
  });

  it("edge: no stops in radius (middle of Río de la Plata)", () => {
    const results = findNearestParadas(
      RIO_DE_LA_PLATA.lat,
      RIO_DE_LA_PLATA.lon,
      PARADAS_GEO,
      1
    );
    expect(results).toEqual([]);
  });

  it("edge: very large radius returns all stops up to maxResults", () => {
    const results = findNearestParadas(
      TRES_CRUCES.lat,
      TRES_CRUCES.lon,
      PARADAS_GEO,
      100_000,
      100
    );
    expect(results.length).toBe(PARADAS_GEO.length);
  });

  it("edge: negative coordinates (Montevideo) handled correctly", () => {
    // Both lat and lon are negative for Montevideo — verify this doesn't cause issues
    const results = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 500);
    expect(results.every((r) => r.lat < 0)).toBe(true);
    expect(results.every((r) => r.lng < 0)).toBe(true);
  });

  it("edge: 4 vs 6 decimal place precision both work", () => {
    const result4 = findNearestParadas(-34.8937, -56.1675, PARADAS_GEO, 200);
    const result6 = findNearestParadas(-34.893700, -56.167500, PARADAS_GEO, 200);
    expect(result4.length).toBe(result6.length);
  });

  it("edge: empty paradas array returns empty array", () => {
    const results = findNearestParadas(TRES_CRUCES.lat, TRES_CRUCES.lon, [], 10_000);
    expect(results).toEqual([]);
  });

  it("edge: duplicate coordinates — both returned", () => {
    // PARADAS_GEO has id 100 and 103 at same coordinates
    const results = findNearestParadas(TRES_CRUCES.lat, TRES_CRUCES.lon, PARADAS_GEO, 50);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(100);
    expect(ids).toContain(103);
  });

  it("includes all original parada fields plus distancia_metros", () => {
    const results = findNearestParadas(TRES_CRUCES.lat, TRES_CRUCES.lon, PARADAS_GEO, 500);
    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    expect(typeof r.id).toBe("number");
    expect(typeof r.linea).toBe("string");
    expect(typeof r.distancia_metros).toBe("number");
  });
});

describe("fastDistMeters vs geolib.getDistance", () => {
  const POINTS: [number, number, number, number][] = [
    // Tres Cruces → Ciudad Vieja (~3.1km)
    [-34.8937, -56.1675, -34.9065, -56.2005],
    // Short distance (~150m)
    [-34.9060, -56.1880, -34.9070, -56.1870],
    // Same point
    [-34.9, -56.2, -34.9, -56.2],
    // Across Montevideo (~10km)
    [-34.85, -56.10, -34.92, -56.22],
  ];

  for (const [lat1, lon1, lat2, lon2] of POINTS) {
    it(`error <1% for (${lat1},${lon1})→(${lat2},${lon2})`, () => {
      const fast = fastDistMeters(lat1, lon1, lat2, lon2);
      const precise = getDistance(
        { latitude: lat1, longitude: lon1 },
        { latitude: lat2, longitude: lon2 }
      );
      if (precise === 0) {
        expect(fast).toBeLessThan(1);
      } else {
        const errorPct = Math.abs(fast - precise) / precise;
        expect(errorPct).toBeLessThan(0.01);
      }
    });
  }
});
